import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { Option } from 'effect'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { extract, packageSource } from '../src/api/extract.js'
import type { ApiExport, ApiPackage } from '../src/api/model.js'

const fixture = {
  'package.json': JSON.stringify({
    name: 'fixture',
    version: '1.2.3',
    exports: {
      '.': { 'foldkit-plus:source': './src/index.ts' },
      './extra/tools': { 'foldkit-plus:source': './src/tools.ts' },
      './styles': { 'foldkit-plus:source': './src/style.css' },
      './client': { 'foldkit-plus:source': './client.d.ts', types: './client.d.ts' },
      './package.json': './package.json',
    },
  }),
  'src/index.ts': `/**
 * The fixture's entry, linking {@link make}.
 */
import { Codec, live, make, table } from './remote.js'

export { Widget } from './widget.js'
export * from './star.js'

/**
 * Adds two numbers.
 * @param a - the first
 * @param b the second
 * @returns the sum
 * @example
 * \`\`\`ts
 * add(1, 2)
 * \`\`\`
 */
export function add(a: number, b: number): number {
  // a comment in the body
  return a + b
}

/**
 * Adds with a default.
 * @deprecated Use {@link add}.
 */
export const sum = (a: number, b = 1) => a + b

/** The limit. */
export const limit: number = 3

/** Remote's operations. */
export const Remote = {
  make,
  live,
  /** Its own doc. */
  version: 2,
  inline: (text: string): string => text,
  Codec,
  size: table.size,
} as const
/** Remote's type. */
export type Remote = typeof Remote

/** A shape. */
export interface Shape {
  /** Its width. */
  readonly width: number
  /** Scales it. */
  scale(by: number): Shape
}

/** A pair. */
export type Pair = 2
export const Pair = 2

export const Upper = 1
export type upper = 2

const hidden = 1
function secret(): number {
  return hidden
}
export const exposed = secret
`,
  'src/remote.ts': `/**
 * Makes a domain.
 * @param name - its name
 */
export function make(name: string): { name: string } {
  return { name }
}

/** Opens a live stream. */
export const live = (every: number) => every * 2

/** A codec's type, declared before its value. */
export type Codec = string
/** The codec. */
export const Codec: Codec = 'c'

export const table = { size: 3 }

/** A name. */
export type Name = string

const internal = 1
export const twice = internal * 2
`,
  'src/widget.ts': `/** A widget. */
export class Widget {
  /** Its label. */
  label = 'w'
  private secret = 1
  /** Renders it. */
  render(): string {
    return this.label + this.secret
  }
}
`,
  'src/star.ts': `/** Starred. */
export const starred = true

/** Shaped as foldkit-bundle's Bundle, which this fixture does not depend on. */
interface Bundle<Args, Model, Message, Out> {
  readonly name: string
  readonly Model: unknown
  readonly Message: unknown
  readonly init: (args: Args) => { readonly model: Model }
  readonly update: (
    model: Model,
    message: Message,
    args: Args,
  ) => { readonly model: Model; readonly outMessage?: Out }
}
type Tick = { readonly _tag: 'Ticked'; readonly at: number } | { readonly _tag: 'Stopped' }
/** A counter. */
export declare const Counter: Bundle<
  { readonly step: number; readonly label?: string },
  { readonly count: number },
  Tick,
  { readonly _tag: 'Done' }
>
/** An update, but not a Bundle. */
export declare const Updater: {
  readonly update: (model: number, message: string, args: void) => { readonly model: number }
}
/** One with no args and nothing for its parent. */
export declare const Plain: Bundle<void, { readonly count: number }, Tick, never>
/** Colors. */
export enum Color {
  Red,
}
`,
  'src/tools.ts': `export * as Mod from './remote.js'
import * as KitMembers from './remote.js'

/** What a kit holds. */
export interface Kit {
  readonly made: true
}
export { KitMembers as Kit }

type Base = { readonly base: () => number }
const Base: Base = { base: () => 0 }

/** Tools. */
export const Tools = {
  ...Base,
  Inner: { go: () => 1, deep: { far: () => 2 } },
}
`,
  'private/package.json': JSON.stringify({ name: 'hidden', version: '0.0.0', private: true }),
}

let root = ''
let api: ApiPackage = { name: '', dir: '', version: '', modules: [] }

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'api-fixture-'))
  for (const [path, text] of Object.entries(fixture)) {
    mkdirSync(dirname(join(root, 'fixture', path)), { recursive: true })
    writeFileSync(join(root, 'fixture', path), text)
  }
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

const moduleNamed = (slug: string) => {
  const found = api.modules.find(module => module.slug === slug)
  if (found === undefined) throw new Error(`no module ${slug}`)
  return found
}

const exportNamed = (name: string, slug = 'index'): ApiExport => {
  const found = moduleNamed(slug).exports.find(entry => entry.name === name)
  if (found === undefined) throw new Error(`no export ${name}`)
  return found
}

const memberNamed = (entry: ApiExport, name: string) => {
  const found = entry.members.find(member => member.name === name)
  if (found === undefined) throw new Error(`no member ${name} of ${entry.name}`)
  return found
}

describe('packageSource', () => {
  test('reads each TypeScript source entry, and nothing of a private package', () => {
    const source = Option.getOrThrow(packageSource(join(root, 'fixture')))
    expect(source).toMatchObject({ name: 'fixture', dir: 'fixture', version: '1.2.3' })
    expect(source.entries).toEqual([
      { specifier: 'fixture', slug: 'index', file: join(root, 'fixture', 'src/index.ts') },
      {
        specifier: 'fixture/extra/tools',
        slug: 'extra-tools',
        file: join(root, 'fixture', 'src/tools.ts'),
      },
    ])
    expect(packageSource(join(root, 'fixture', 'private'))).toEqual(Option.none())
  })
})

describe('extract', () => {
  beforeAll(async () => {
    const source = Option.getOrThrow(packageSource(join(root, 'fixture')))
    const [only] = await extract(root, [source], {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
    })
    if (only === undefined) throw new Error('no package extracted')
    api = only
  }, 60_000)

  test('names the package and its modules', () => {
    expect(api).toMatchObject({ name: 'fixture', dir: 'fixture', version: '1.2.3' })
    expect(api.modules.map(({ specifier, slug }) => ({ specifier, slug }))).toEqual([
      { specifier: 'fixture', slug: 'index' },
      { specifier: 'fixture/extra/tools', slug: 'extra-tools' },
    ])
  })

  test("lists a module's exports by name, ignoring case, and nothing private", () => {
    expect(moduleNamed('index').exports.map(entry => entry.name)).toEqual([
      'add',
      'Color',
      'Counter',
      'exposed',
      'limit',
      'Pair',
      'Plain',
      'Remote',
      'Shape',
      'starred',
      'sum',
      'Updater',
      'Upper',
      'upper',
      'Widget',
    ])
  })

  test("reads the entry file's own comment as its summary", () => {
    expect(moduleNamed('index').summary).toBe("The fixture's entry, linking `make`.")
    expect(moduleNamed('extra-tools').summary).toBe('')
  })

  test('a function: its header, params, and tags other than @returns', () => {
    expect(exportNamed('add')).toMatchObject({
      kind: 'function',
      summary: 'Adds two numbers.',
      signature: 'function add(a: number, b: number): number',
      params: [
        { name: 'a', summary: 'the first' },
        { name: 'b', summary: 'the second' },
      ],
      tags: [{ name: 'example', text: '```ts\nadd(1, 2)\n```' }],
      typeSignature: Option.none(),
      source: { file: 'fixture/src/index.ts', line: 19 },
    })
  })

  test('an arrow-function const reads as a function, its default as optional', () => {
    expect(exportNamed('sum')).toMatchObject({
      kind: 'function',
      signature: 'function sum(a: number, b?: number): number',
      tags: [{ name: 'deprecated', text: 'Use `add`.' }],
    })
  })

  test('a const keeps its written annotation; one aliasing a private function, its own name', () => {
    expect(exportNamed('limit')).toMatchObject({
      kind: 'const',
      summary: 'The limit.',
      signature: 'const limit: number',
    })
    expect(exportNamed('exposed')).toMatchObject({
      kind: 'const',
      signature: 'const exposed: () => number',
    })
  })

  test('a Bundle: its args, Model, Messages and OutMessages, read from its update', () => {
    const ticks = [
      { name: 'Ticked', fields: [{ name: 'at', type: 'number' }] },
      { name: 'Stopped', fields: [] },
    ]
    expect(exportNamed('Counter').bundle).toEqual(
      Option.some({
        args: [
          { name: 'step', type: 'number' },
          { name: 'label?', type: 'string' },
        ],
        model: [{ name: 'count', type: 'number' }],
        messages: ticks,
        out: [{ name: 'Done', fields: [] }],
      }),
    )
    expect(exportNamed('Plain').bundle).toEqual(
      Option.some({
        args: [],
        model: [{ name: 'count', type: 'number' }],
        messages: ticks,
        out: [],
      }),
    )
    expect(exportNamed('limit').bundle).toEqual(Option.none())
    expect(exportNamed('Updater').bundle).toEqual(Option.none())
  })

  test('a namespace object merges with its type, and its members read what they name', () => {
    const remote = exportNamed('Remote')
    expect(remote).toMatchObject({
      kind: 'namespace',
      slug: 'remote',
      summary: "Remote's operations.",
      signature: 'const Remote = { make, live, version, inline, Codec, size }',
      typeSignature: Option.some('type Remote = typeof Remote'),
    })
    expect(remote.members.map(member => member.name)).toEqual([
      'make',
      'live',
      'version',
      'inline',
      'Codec',
      'size',
    ])
    expect(memberNamed(remote, 'make')).toEqual({
      name: 'make',
      kind: 'function',
      summary: 'Makes a domain.',
      signature: 'make(name: string): {\n  name: string\n}',
      tags: [],
      params: [{ name: 'name', summary: 'its name' }],
      source: { file: 'fixture/src/remote.ts', line: 5 },
    })
    expect(memberNamed(remote, 'live')).toMatchObject({
      kind: 'function',
      summary: 'Opens a live stream.',
      signature: 'live(every: number): number',
      source: { file: 'fixture/src/remote.ts', line: 10 },
    })
    expect(memberNamed(remote, 'version')).toMatchObject({
      kind: 'const',
      summary: 'Its own doc.',
      signature: 'version: 2',
    })
    expect(memberNamed(remote, 'inline')).toMatchObject({
      kind: 'function',
      signature: 'inline(text: string): string',
      source: { file: 'fixture/src/index.ts' },
    })
    expect(memberNamed(remote, 'Codec')).toMatchObject({
      kind: 'const',
      summary: 'The codec.',
      signature: 'Codec: Codec',
      source: { file: 'fixture/src/remote.ts' },
    })
    expect(memberNamed(remote, 'size')).toMatchObject({
      kind: 'const',
      signature: 'size: number',
      source: { file: 'fixture/src/index.ts' },
    })
  })

  test("an interface's and a class's public members", () => {
    const shape = exportNamed('Shape')
    expect(shape.kind).toBe('interface')
    expect(shape.signature).toContain('scale(by: number): Shape')
    expect(shape.signature).not.toContain('Its width')
    expect(shape.members).toMatchObject([
      {
        name: 'width',
        kind: 'property',
        summary: 'Its width.',
        signature: 'readonly width: number',
      },
      {
        name: 'scale',
        kind: 'method',
        summary: 'Scales it.',
        signature: 'scale(by: number): Shape',
      },
    ])
    const widget = exportNamed('Widget')
    expect(widget).toMatchObject({
      kind: 'class',
      summary: 'A widget.',
      signature: 'class Widget {}',
    })
    expect(widget.members).toMatchObject([
      { name: 'label', kind: 'property', summary: 'Its label.', signature: 'label: string' },
      { name: 'render', kind: 'method', signature: 'render(): string' },
    ])
  })

  test('re-exports, `export *` included, read their declarations', () => {
    expect(exportNamed('Widget').source.file).toBe('fixture/src/widget.ts')
    expect(exportNamed('Color')).toMatchObject({
      kind: 'enum',
      summary: 'Colors.',
      signature: 'enum Color {\n  Red,\n}',
    })
    expect(exportNamed('starred').summary).toBe('Starred.')
  })

  test("a value without a doc of its own reads its type's", () => {
    expect(exportNamed('Pair')).toMatchObject({
      kind: 'const',
      summary: 'A pair.',
      signature: 'const Pair: 2',
      typeSignature: Option.some('type Pair = 2'),
    })
  })

  test('names that differ only in case get distinct slugs', () => {
    expect([exportNamed('Upper').slug, exportNamed('upper').slug]).toEqual(['upper', 'upper-2'])
  })

  test('a spread lends its properties; a nested namespace object flattens one level', () => {
    expect(exportNamed('Tools', 'extra-tools').members.map(member => member.name)).toEqual([
      'base',
      'Inner',
      'Inner.go',
      'Inner.deep',
    ])
  })

  test('a module namespace lists the module, types and values', () => {
    const mod = exportNamed('Mod', 'extra-tools')
    // remote.ts opens with `make`'s doc, which is not the file's.
    expect(mod).toMatchObject({
      kind: 'namespace',
      summary: '',
      signature: "export * as Mod from './remote.js'",
    })
    expect(mod.members.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'Codec', kind: 'const' },
      { name: 'live', kind: 'function' },
      { name: 'make', kind: 'function' },
      { name: 'Name', kind: 'type' },
      { name: 'table', kind: 'const' },
      { name: 'twice', kind: 'const' },
    ])
  })

  test('a namespace exported under an interface name keeps the interface', () => {
    const kit = exportNamed('Kit', 'extra-tools')
    expect(kit.kind).toBe('namespace')
    expect(kit.typeSignature).toEqual(Option.some('interface Kit {\n  readonly made: true\n}'))
    expect(kit.members.map(({ name }) => name)).toContain('make')
  })

  test('names no absolute path', () => {
    const json = JSON.stringify(api)
    expect(json).not.toContain(tmpdir().replaceAll('\\', '/'))
    expect(json).not.toContain(JSON.stringify(tmpdir()).slice(1, -1))
  })
})

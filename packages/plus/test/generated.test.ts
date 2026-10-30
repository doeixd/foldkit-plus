/**
 * What `scripts/generate.ts` writes, against the workspace now: a file per
 * entry point and nothing else, the manifest's exports and dependencies, the
 * tsconfigs' references, and the setup guide's lists of adapters and jobs.
 * Each fails until `pnpm --filter foldkit-plus generate` runs after a package
 * or an entry point is added, moved or removed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  fileOf,
  generatedFields,
  included,
  references,
  setupOf,
  writtenFiles,
} from '../scripts/entries.js'
import { adapters, effectPackages, jobs } from '../src/setup.js'

const here = join(import.meta.dirname, '..')
const packages = included(join(here, '../..'))
const json = (name: string) => JSON.parse(readFileSync(join(here, name), 'utf8'))
/** Formatting aside: the generator formats, so compare what the text says. */
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

describe('foldkit-plus, against the workspace', () => {
  it('has a file re-exporting each entry point, and no other', () => {
    const entries = packages.flatMap(each => each.entries)
    expect([...writtenFiles(here)].sort()).toEqual(
      entries.map(entry => `${entry.subpath}.ts`).sort(),
    )
    for (const entry of entries)
      expect(flat(readFileSync(join(here, 'src', `${entry.subpath}.ts`), 'utf8'))).toBe(
        flat(fileOf(entry)),
      )
  })

  it('exports each and depends on each, an adapter as an optional peer', () => {
    const manifest = json('package.json')
    const expected = generatedFields(packages, manifest.devDependencies)
    for (const field of [
      'exports',
      'dependencies',
      'peerDependencies',
      'peerDependenciesMeta',
      'devDependencies',
    ] as const)
      expect(manifest[field], field).toEqual(expected[field])
  })

  it('installs the Foldkit and the Effect tested here', () => {
    expect(json('package.json').setup).toEqual(
      setupOf(json('node_modules/foldkit/package.json'), json('node_modules/effect/package.json')),
    )
  })

  it('references each from both tsconfigs', () => {
    for (const name of ['tsconfig.json', 'tsconfig.build.json'])
      expect(json(name).references, name).toEqual(references(packages))
  })

  it("pins in setup's guide the Effect packages the workspace pins", () => {
    // `effect` itself every package names directly.
    const workspace = readFileSync(join(here, '../../pnpm-workspace.yaml'), 'utf8')
    const overrides = /^overrides:\n((?: {2}.+\n)+)/m.exec(workspace)?.[1] ?? ''
    expect([...effectPackages].sort()).toEqual(
      ['effect', ...[...overrides.matchAll(/^  '([^']+)':/gm)].map(match => match[1])].sort(),
    )
  })

  it("names every adapter in setup's guide, with the libraries that make it one", () => {
    expect(adapters.map(each => [each.name, each.libraries])).toEqual(
      packages
        .filter(each => each.adapter)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(each => [each.name, each.libraries]),
    )
  })

  it("gives every package a job in setup's guide", () => {
    expect(jobs.flatMap(each => each.imports).sort()).toEqual(packages.map(each => each.dir).sort())
  })
})

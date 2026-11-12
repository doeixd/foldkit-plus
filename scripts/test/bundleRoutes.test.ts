// @vitest-environment node
/**
 * The bundle report's per-route figures (#438, decision 6): the modules one
 * route alone reaches, counted in brotli, and a route's first load.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { exclusiveModules, formatRoutes, measure } from '../bundle-report.mjs'

const graph = (edges: Record<string, ReadonlyArray<string>>) =>
  Object.fromEntries(Object.entries(edges).map(([id, imports]) => [id, { imports }]))

describe('exclusiveModules', () => {
  const edges = graph({
    main: ['landing', 'a', 'b', 'shared', 'inEntry'],
    landing: [],
    a: ['aOnly', 'shared', 'both', 'inEntry', 'b'],
    aOnly: ['aDeep'],
    aDeep: [],
    b: ['both', 'shared', 'bOnly'],
    bOnly: [],
    inEntry: [],
    both: [],
    shared: [],
  })
  const roots = new Map([
    ['landing', ['landing']],
    ['a', ['a']],
    ['b', ['b']],
  ])

  test('a route gets what only it reaches, however deep', () => {
    expect(exclusiveModules(edges, ['main'], roots).get('a')).toEqual(['a', 'aOnly', 'aDeep'])
  })

  test('a module two routes reach, or the entry itself does, is no route own', () => {
    const own = exclusiveModules(edges, ['main'], roots)
    expect(own.get('b')).toEqual(['b', 'bOnly'])
    expect(own.get('landing')).toEqual(['landing'])
  })

  test('a route of several roots owns what any of them alone reaches', () => {
    const joined = new Map([
      ['a', ['a', 'aOnly']],
      ['b', ['b']],
    ])
    expect(exclusiveModules(edges, ['main'], joined).get('a')).toEqual(['a', 'aOnly', 'aDeep'])
  })
})

const fixture = resolve(import.meta.dirname, '.bundle-routes-fixture')
afterAll(() => rmSync(fixture, { recursive: true, force: true }))

/** Incompressible text of a known length: brotli keeps about half its characters as bytes. */
const noise = (seed: number, length: number) => {
  let state = seed
  let text = ''
  while (text.length < length) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    text += (state >>> 8).toString(16).padStart(6, '0')
  }
  return text.slice(0, length)
}

const write = (name: string, body: string) => writeFileSync(join(fixture, 'src', name), body)

describe('a build with two routes and a third in its own chunk', () => {
  test('counts what one route alone imports, and the first load of a split one', async () => {
    rmSync(fixture, { recursive: true, force: true })
    mkdirSync(join(fixture, 'src'), { recursive: true })
    writeFileSync(join(fixture, 'package.json'), '{"name":"routes-fixture","private":true}')
    writeFileSync(
      join(fixture, 'vite.config.mjs'),
      `export default { build: { target: 'es2022', rollupOptions: { input: 'src/main.js' } } }`,
    )
    write(
      'main.js',
      `import { landing } from './landing.js'
import { a } from './a.js'
import { b } from './b.js'
console.log(landing(), a(), b())
import('./c.js').then(c => console.log(c.c()))
import('./d.js').then(d => console.log(d.d()))
`,
    )
    write('landing.js', `export const landing = () => 'landing'\n`)
    write(
      'a.js',
      `import { aOnly } from './aOnly.js'
import { shared } from './shared.js'
export const a = () => aOnly + shared
`,
    )
    write('aOnly.js', `export const aOnly = '${noise(1, 4000)}'\n`)
    write(
      'b.js',
      `import { shared } from './shared.js'
export const b = () => 'b' + shared
`,
    )
    write('shared.js', `export const shared = '${noise(2, 4000)}'\n`)
    write(
      'c.js',
      `import { cOnly } from './cOnly.js'
export const c = () => cOnly
`,
    )
    write(
      'd.js',
      `import { cOnly } from './cOnly.js'
export const d = () => cOnly + 'd'
`,
    )
    write('cOnly.js', `export const cOnly = '${noise(3, 4000)}'\n`)

    const report = await measure(fixture, {
      routes: [
        { name: 'landing', module: 'src/landing.js', landing: true },
        { name: 'a', module: 'src/a.js' },
        { name: 'b', module: 'src/b.js' },
        { name: 'c', module: 'src/c.js' },
      ],
    })
    const route = (name: string) =>
      report.routes.find((entry: { name: string }) => entry.name === name)

    // 4,000 hex characters are 2,000 bytes of entropy.
    expect(route('a').aloneBrotli).toBeGreaterThan(1900)
    expect(route('a').aloneBrotli).toBeLessThan(2300)
    expect(route('a').aloneModules.map((key: string) => key.split('/').pop())).toEqual([
      'a',
      'aOnly',
    ])
    // The text a and b both import is neither's.
    expect(route('b').aloneBrotli).toBeLessThan(300)
    expect(route('landing').aloneBrotli).toBeLessThan(300)
    expect(route('landing').landing).toBe(true)
    expect(route('a').landing).toBe(false)
    expect(route('a').split).toBe(false)
    expect(route('a').firstLoadBrotli).toBe(report.total.brotli)

    // c is dynamically imported, and shares cOnly with d: its chunk and that
    // shared chunk are paid for on top of the entry.
    expect(route('c').split).toBe(true)
    expect(route('c').firstLoadBrotli - report.total.brotli).toBeGreaterThan(1900)
    expect(route('c').aloneBrotli).toBeGreaterThan(1900)

    const table = formatRoutes(report)
    expect(table).toContain('decision 6: largest non-landing')
    expect(table).toContain('its own')
  }, 120_000)
})

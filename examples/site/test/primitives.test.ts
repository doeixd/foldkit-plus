/**
 * The Primitives gallery names every primitive the package exports, once: each
 * module a subpath's index re-exports has one card (or is named as part of
 * another primitive), and each card names an export its subpath really has.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { regionsOf } from '../src/content/library.js'
import { families, importPath, partsOf } from '../src/gallery/primitives.js'
import { examples } from '../src/snippets/primitives.js'

const SOURCE = join(import.meta.dirname, '../../../packages/primitives/src')
const manifest: { readonly exports: Readonly<Record<string, unknown>> } = JSON.parse(
  readFileSync(join(SOURCE, '../package.json'), 'utf8'),
)

/** The modules a subpath's index re-exports, by file name without extension. */
const modulesOf = (family: string): ReadonlyArray<string> =>
  [
    ...readFileSync(join(SOURCE, family, 'index.ts'), 'utf8').matchAll(/from '\.\/([^']+)\.js'/g),
  ].map(match => match[1]!)

describe('the primitives gallery', () => {
  it('has a family for every subpath of the package, and no other', () => {
    const subpaths = Object.keys(manifest.exports)
      .filter(key => key !== '.' && key !== './package.json')
      .map(key => key.slice(2))
    expect(families.map(family => family.id).sort()).toEqual(subpaths.sort())
  })

  it.each(families.map(family => [family.id, family] as const))(
    '%s: one card for each module its index re-exports',
    (id, family) => {
      const carded = family.cards.map(card => card.module)
      expect(new Set(carded).size, 'a module has two cards').toBe(carded.length)
      const parts = Object.keys(partsOf)
        .filter(key => key.startsWith(`${id}/`))
        .map(key => key.slice(id.length + 1))
      expect([...carded, ...parts].sort()).toEqual([...modulesOf(id)].sort())
      for (const module of carded) expect(readdirSync(join(SOURCE, id))).toContain(`${module}.ts`)
    },
  )

  it.each(families.map(family => [family.id, family] as const))(
    '%s: each card names an export of the subpath',
    async (id, family) => {
      const exports = await import(/* @vite-ignore */ importPath(id))
      for (const card of family.cards) expect(card.name in exports, `${id}/${card.name}`).toBe(true)
    },
  )

  it('says each card in a sentence of its own, with no card repeating another', () => {
    const abouts = families.flatMap(family => family.cards.map(card => card.about))
    expect(new Set(abouts).size).toBe(abouts.length)
    for (const about of abouts) expect(about.endsWith('.')).toBe(true)
  })

  it('shows each live example with the source that runs, and each source belongs to an example', () => {
    const regions = regionsOf(
      readFileSync(join(import.meta.dirname, '../src/snippets/primitives.ts'), 'utf8'),
    )
    expect([...regions.keys()].sort()).toEqual(examples.map(example => example.id).sort())
    const ids = new Set(families.map(family => family.id))
    for (const example of examples) {
      expect(ids.has(example.family), example.id).toBe(true)
      expect(regions.get(example.id), example.id).toContain(example.draw.name)
    }
  })
})

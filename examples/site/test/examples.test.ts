/**
 * A showcase's examples: each draws with the picked style, names its snippet
 * region, and links to it. The site build prerenders every example with real
 * state; these pin the names and regions without a build.
 */
import { describe, expect, it } from 'vitest'
import { regionsOf } from '../src/content/library.js'
import { showcases } from '../src/gallery/showcases.js'
// The source as Vite serves it, so `pnpm mutate` reaches what the test reads.
import components from '../src/snippets/components.ts?raw'

const regions = regionsOf(components)

describe('showcase examples', () => {
  it('name each example once, in URL-safe fragments', () => {
    for (const showcase of showcases) {
      const names = showcase.examples.map(example => example.name)
      expect(new Set(names).size, showcase.slug).toBe(names.length)
      for (const name of names) expect(name, showcase.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('give every example its snippet region', () => {
    for (const showcase of showcases) {
      for (const example of showcase.examples) {
        const region = `${showcase.slug}-${example.name}`
        const code = regions.get(region)
        expect(code, region).toBeDefined()
        expect(code!.length, region).toBeGreaterThan(0)
      }
    }
  })
})

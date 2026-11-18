/**
 * A showcase's examples: each draws with the picked style, names its code
 * and links to it. An example's code is a region of `snippets/components.ts`
 * or a module of its own, and a page may list either. The site build
 * prerenders every example with real state; these pin the names, the regions
 * and the modules without a build.
 */
import { describe, expect, it } from 'vitest'
import { regionsOf } from '../src/content/library.js'
import type { Example } from '../src/gallery/example.js'
import { showcases } from '../src/gallery/showcases.js'
// The source as Vite serves it, so `pnpm mutate` reaches what the test reads.
import components from '../src/snippets/components.ts?raw'

const regions = regionsOf(components)
const modules = import.meta.glob<Example<unknown>>('../src/examples/*/*.ts', {
  eager: true,
  import: 'default',
})
const sources = import.meta.glob<string>('../src/examples/*/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const pathOf = (slug: string, name: string) => `../src/examples/${slug}/${name}.ts`

describe('showcase examples', () => {
  it('name each example once, in URL-safe fragments', () => {
    for (const showcase of showcases) {
      const names = showcase.examples.map(example => example.name)
      expect(new Set(names).size, showcase.slug).toBe(names.length)
      for (const name of names) expect(name, showcase.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('give every example of the old shape its snippet region', () => {
    const listed = showcases.flatMap(showcase =>
      showcase.examples
        .filter(example => example.code === 'region')
        .map(example => `${showcase.slug}-${example.name}`),
    )
    expect(listed.length).toBeGreaterThan(0)
    for (const region of listed) {
      const code = regions.get(region)
      expect(code, region).toBeDefined()
      expect(code!.length, region).toBeGreaterThan(0)
    }
  })

  it('show for a module example the module its page drew: the file at its name', () => {
    const listed = showcases.flatMap(showcase =>
      showcase.examples
        .filter(example => example.code === 'module')
        .map(example => ({ path: pathOf(showcase.slug, example.name), title: example.title })),
    )
    expect(listed.length).toBeGreaterThan(0)
    for (const { path, title } of listed) {
      // The page imports its examples by hand; the code shown is read by name.
      expect(modules[path]?.title, path).toBe(title)
      expect(sources[path], path).toContain('export default example({')
    }
  })

  it('leave no example module unlisted', () => {
    const listed = new Set(
      showcases.flatMap(showcase =>
        showcase.examples.map(example => pathOf(showcase.slug, example.name)),
      ),
    )
    expect(Object.keys(modules).filter(path => !listed.has(path))).toEqual([])
  })

  it('keep a module example short enough to read whole, with no cast', () => {
    for (const [path, source] of Object.entries(sources)) {
      const body = source.slice(source.indexOf('export default example({'))
      expect(body.split('\n').length, path).toBeLessThanOrEqual(45)
      expect(source, path).not.toMatch(/\bas (unknown|never|any)\b|\bas [A-Z]/)
    }
  })
})

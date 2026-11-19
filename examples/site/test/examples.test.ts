// @vitest-environment jsdom
/**
 * A showcase's examples: each draws with the picked style, names its code
 * and links to it. An example's code is a region of `snippets/components.ts`
 * or a module of its own, and a page may list either. The site build
 * prerenders every example with real state; these pin the names, the regions
 * and the modules without a build. jsdom, since a primitive example's `update`
 * may reach the document when the Command it returns is made (`enterFullscreen`).
 */
import { Schema } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { regionsOf } from '../src/content/library.js'
import type { Example } from '../src/gallery/example.js'
import { listed } from '../src/gallery/primitiveExamples.js'
import { families } from '../src/gallery/primitives.js'
import { showcases } from '../src/gallery/showcases.js'
import { SiteStyle } from '../src/style.js'
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
      const lines = source.split('\n')
      // An import may rename (`Calendar as Dates`); `as const` on a list is no cast.
      const afterImports = lines
        .slice(lines.map(line => /^import |^\} from /.test(line)).lastIndexOf(true) + 1)
        .join('\n')
      const body = source.slice(source.indexOf('export default example({'))
      // The longest are the overlays', which draw each Slot of an adapter by hand (Dialog,
      // Toast with a payload) and a table laid out from `FileUpload.parts`; most are under 25.
      expect(body.split('\n').length, path).toBeLessThanOrEqual(90)
      expect(afterImports, path).not.toMatch(/\bas (unknown|never|any)\b|[)\]}\w] as [A-Z{[(]/)
    }
  })
})

const primitiveSources = import.meta.glob<string>('../src/examples/primitives/*/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})

describe('primitive examples', () => {
  const h = SlotView.inertBuilder<unknown>()
  const slots = SlotView.buildersFor(SiteStyle.slots, [], { input: undefined, h })
  const markup = (html: Html) =>
    JSON.stringify(html, (key, value) => (key === 'elm' ? undefined : value))

  it('stand on a shelf of their family, once each', () => {
    expect(new Set(listed.map(entry => entry.id)).size).toBe(listed.length)
    for (const entry of listed) {
      expect(
        families.some(family => family.id === entry.family),
        entry.id,
      ).toBe(true)
    }
  })

  it.each(listed.map(entry => [entry.id, entry] as const))(
    '%s: starts from a Model that survives the page, draws, and folds a Message',
    (_, { example }) => {
      const { Model, initial, update } = example.state
      // The server writes the Model into the page and the browser starts from it.
      const encoded = Schema.encodeUnknownSync(Model)(initial)
      expect(Schema.decodeUnknownSync(Model)(encoded)).toEqual(initial)
      const sent: Array<unknown> = []
      const drawn = markup(
        example.render(
          slots,
          initial,
          message => {
            sent.push(message)
            return message
          },
          h,
        ),
      )
      expect(drawn.length).toBeGreaterThan(20)
      // A view names the Messages its presses send as it draws; one that sends none
      // (a Mount, a text field) is drawn from its Model alone.
      for (const message of sent.slice(0, 1)) expect(update(initial, message).model).toBeDefined()
    },
  )

  it('keep each module short enough to read whole, with no cast', () => {
    for (const [path, source] of Object.entries(primitiveSources)) {
      const lines = source.split('\n')
      const afterImports = lines
        .slice(lines.map(line => /^import |^\} from /.test(line)).lastIndexOf(true) + 1)
        .join('\n')
      expect(afterImports.split('\n').length, path).toBeLessThanOrEqual(60)
      expect(afterImports, path).not.toMatch(/\bas (unknown|never|any)\b|[)\]}\w] as [A-Z{[(]/)
      expect(source, path).toContain('export default primitiveExample({')
    }
  })
})

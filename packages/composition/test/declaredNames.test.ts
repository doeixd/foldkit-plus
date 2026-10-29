/**
 * Region and appearance names a Block declares, named like `Object.prototype`
 * members, against a stored node that leaves them out.
 */
import { Schema } from 'effect'
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { inertHtml, type Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Block, Catalog, Composition, Content, Region } from '../src/index.js'
import { Appearance } from '../src/appearance/index.js'
import { Renderer } from '../src/foldkit/index.js'

const OddSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const OddLook = Appearance.make(OddSlots, {
  recipe: Style.recipeFor(OddSlots)({
    base: { root: Style.class('odd') },
    variants: {
      constructor: { a: { root: Style.class('c-a') }, b: { root: Style.class('c-b') } },
      toString: { a: { root: Style.class('t-a') }, b: { root: Style.class('t-b') } },
    },
    defaults: { constructor: 'b', toString: 'b' },
  }),
})
const Pair = Block.define('Pair', {
  Props: Schema.Struct({}),
  regions: {
    constructor: Region.many({ accepts: [Content.Flow] }),
    toString: Region.many({ accepts: [Content.Flow] }),
  },
  provides: [Content.Section],
}).pipe(Appearance.attach(OddLook))
const Image = Block.define('Image', {
  Props: Schema.Struct({ alt: Schema.String }),
  provides: [Content.Flow],
})
const Site = Catalog.make({ blocks: [Pair, Image], roots: [Content.Section] })
const SiteRenderer = Renderer.make(Site, {
  Pair: ({ regions, appearance, h }) =>
    h.section(OddLook.draw({ appearance, h }).root.attrs(), [
      h.div([], [...regions.constructor]),
      h.div([], [...regions.toString]),
    ]),
  Image: ({ props, h }) => h.img([h.Alt(props.alt)]),
})

const drawn = (mode: 'view' | 'edit', node: Readonly<Record<string, unknown>> = {}) => {
  const document = Schema.decodeUnknownSync(Composition.Document)({
    format: 1,
    roots: ['p'],
    nodes: {
      p: { block: 'Pair', props: {}, regions: { toString: ['i'] }, ...node },
      i: { block: 'Image', props: { alt: 'a' }, regions: {} },
    },
  })
  const [root] = Renderer.render(SiteRenderer, document, inertHtml, { mode })
  if (root === null || root === undefined || typeof root === 'string') throw new Error('no pair')
  return root
}
const section = (root: Exclude<Html, null>): Exclude<Html, null> => {
  if (root.sel === 'section') return root
  const [inner] = root.children ?? []
  if (inner === undefined || typeof inner === 'string' || inner === null)
    throw new Error('no section')
  return inner
}
const childCounts = (root: Exclude<Html, null>) =>
  (section(root).children ?? []).map(column =>
    typeof column === 'string' || column === null
      ? -1
      : (column.children ?? []).filter(child => typeof child !== 'string' || child !== '').length,
  )
const classes = (root: Exclude<Html, null>) => {
  const node = section(root)
  return Object.keys(node.data?.class ?? {}).filter(name => node.data?.class?.[name] === true)
}

describe('names a Block declares, named like Object.prototype members', () => {
  it('draws a Region the node leaves out as empty', () => {
    expect(childCounts(drawn('view'))).toEqual([0, 1])
  })

  it('draws an axis the node leaves out at its default', () => {
    expect(classes(drawn('view'))).toEqual(['odd', 'c-b', 't-b'])
    expect(classes(drawn('view', { appearance: { constructor: 'a' } }))).toEqual([
      'odd',
      'c-a',
      't-b',
    ])
  })

  it('offers a stored choice on an axis named __proto__', () => {
    const Looks = Block.define('Looks', {
      Props: Schema.Struct({}),
      provides: [Content.Section],
    }).pipe(
      Block.withAppearance({
        ['__proto__']: { kind: 'token', values: ['x'], breakpoints: ['md'] },
      }),
    )
    const offered = (stored: string) => Block.offeredAppearance(Looks, JSON.parse(stored))
    expect(Object.entries(offered('{"__proto__":"x"}'))).toEqual([['__proto__', 'x']])
    expect(Object.entries(offered('{"__proto__":{"md":"x"}}'))).toEqual([
      ['__proto__', { md: 'x' }],
    ])
  })
})

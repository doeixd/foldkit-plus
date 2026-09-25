/**
 * A look: a slot recipe's axes and token axes become a Block's appearance
 * axes, and a node's stored names draw the pieces they pick (its defaults, its
 * compounds, a token's declaration), each compiled once, so the stylesheet
 * made from `look.styles` holds every class a node can be drawn with.
 */
import { Schema } from 'effect'
import { Attributes, Behavior, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Block, Catalog, Composition, Content } from '../src/index.js'
import { Appearance } from '../src/appearance/index.js'
import { Renderer } from '../src/foldkit/index.js'

const HeroSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Base }),
})

const HeroLook = Appearance.make(HeroSlots, {
  recipe: Style.recipeFor(HeroSlots)({
    base: { root: Style.class('hero') },
    variants: {
      tone: {
        plain: {},
        accent: { root: Style.class('accent'), title: Style.self({ fontWeight: '700' }) },
      },
      space: { snug: { root: Style.class('snug') }, roomy: { root: Style.class('roomy') } },
    },
    defaults: { space: 'snug' },
    compound: [
      { when: { tone: 'accent', space: 'roomy' }, style: { root: Style.class('banner') } },
    ],
  }),
  tokens: {
    gap: Appearance.token(
      { s: 'var(--fk-space-s)', m: 'var(--fk-space-m)' },
      {
        slot: 'root',
        property: 'gap',
      },
    ),
  },
})

const Hero = Block.define('Hero', {
  Props: Schema.Struct({ title: Schema.String }),
  provides: [Content.Section],
}).pipe(Appearance.attach(HeroLook))
const Site = Catalog.make({ blocks: [Hero], roots: [Content.Section] })

const SiteRenderer = Renderer.make(Site, {
  Hero: ({ props, appearance, h }) => {
    const slots = HeroLook.draw({ appearance, h })
    return h.section(slots.root.attrs(), [h.h1(slots.title.attrs(), [props.title])])
  },
})

const drawn = (appearance?: Schema.Json) => {
  const document = Schema.decodeUnknownSync(Composition.Document)({
    format: 1,
    roots: ['h'],
    nodes: {
      h: {
        block: 'Hero',
        props: { title: 'Hi' },
        regions: {},
        ...(appearance === undefined ? {} : { appearance }),
      },
    },
  })
  const [root] = Renderer.render(SiteRenderer, document, inertHtml)
  if (root === null || root === undefined || typeof root === 'string') throw new Error('no hero')
  const [title] = root.children ?? []
  if (title === undefined || typeof title === 'string') throw new Error('no title')
  return { root, title }
}
const classes = (node: Exclude<Html, null>) =>
  Object.keys(node.data?.class ?? {}).filter(name => node.data?.class?.[name] === true)

describe('a look', () => {
  it('gives the Block its axes: the recipe’s variants and the token names', () => {
    expect(Hero.appearance).toEqual({
      tone: { kind: 'variant', values: ['plain', 'accent'] },
      space: { kind: 'variant', values: ['snug', 'roomy'] },
      gap: { kind: 'token', values: ['s', 'm'] },
    })
    const bad = Schema.decodeUnknownSync(Composition.Document)({
      format: 1,
      roots: ['h'],
      nodes: {
        h: { block: 'Hero', props: { title: 'x' }, regions: {}, appearance: { gap: 'xl' } },
      },
    })
    expect(Composition.validate(Site, bad).map(found => found.code)).toEqual([
      'composition:unknown-token',
    ])
  })

  it('draws the base and the defaults when nothing is chosen', () => {
    const { root, title } = drawn()
    expect(classes(root)).toEqual(['hero', 'snug'])
    expect(classes(title)).toEqual([])
  })

  it('draws each chosen value, a matching compound, and a token’s declaration', () => {
    const { root, title } = drawn({ tone: 'accent', space: 'roomy', gap: 'm' })
    expect(classes(root)).toEqual(['hero', 'accent', 'roomy', 'banner'])
    expect(root.data?.style).toEqual({ gap: 'var(--fk-space-m)' })
    expect(classes(title)).toHaveLength(1)
  })

  it('leaves out a stored choice the Block does not offer, and draws the rest', () => {
    const { root } = drawn({ tone: 'loud', space: 'roomy', edge: 'round' })
    expect(classes(root)).toEqual(['hero', 'roomy'])
  })

  it('hands a view only the choices its Block offers', () => {
    const Echo = Renderer.make(Site, {
      Hero: ({ appearance, h }) => h.pre([], [JSON.stringify(appearance)]),
    })
    const document = Schema.decodeUnknownSync(Composition.Document)({
      format: 1,
      roots: ['h'],
      nodes: {
        h: {
          block: 'Hero',
          props: { title: 'x' },
          regions: {},
          appearance: { tone: 'loud', space: 'roomy', edge: 'round', gap: 3 },
        },
      },
    })
    const [echoed] = Renderer.render(Echo, document, inertHtml)
    const text = echoed === null || echoed === undefined ? '' : (echoed.children?.[0] ?? '')
    expect(typeof text === 'string' ? text : text.text).toBe('{"space":"roomy"}')
  })

  it('compiles each piece once, so its stylesheet holds every class a node draws', () => {
    const sheet = Style.stylesheet(...HeroLook.styles)
    const { title } = drawn({ tone: 'accent' })
    const [ruled] = classes(title)
    expect(sheet).toContain(`.${ruled}{font-weight:700}`)
  })

  it('draws a responsive token as rules, each breakpoint after the base', () => {
    const Wide = Appearance.make(HeroSlots, {
      tokens: {
        gap: Appearance.token(
          { s: 'var(--fk-space-s)', m: 'var(--fk-space-m)' },
          {
            slot: 'root',
            property: 'gap',
            breakpoints: { md: '(min-width: 48rem)', lg: '(min-width: 64rem)' },
          },
        ),
      },
    })
    expect(Wide.axes['gap']?.breakpoints).toEqual(['md', 'lg'])
    const slots = Wide.draw({ appearance: { gap: { base: 's', lg: 'm' } }, h: inertHtml })
    const root = slots.root.attrs()
    // No inline value: it would beat every breakpoint.
    expect(Attributes.find(root, 'Style')).toBeUndefined()
    const drawnClasses = String(Attributes.find(root, 'Class')?.value ?? '').split(' ')
    expect(drawnClasses).toHaveLength(2)
    const sheet = Style.stylesheet(...Wide.styles)
    const [base, large] = drawnClasses.map(name => sheet.indexOf(`.${name}`))
    expect(sheet).toContain('@media (min-width: 64rem)')
    expect(base).toBeGreaterThanOrEqual(0)
    expect(large).toBeGreaterThan(base ?? 0)
    // One name for every viewport draws only the base rule.
    const one = Wide.draw({ appearance: { gap: 'm' }, h: inertHtml }).root.attrs()
    expect(String(Attributes.find(one, 'Class')?.value ?? '').split(' ')).toHaveLength(1)
  })

  it('attaches more after the look, and a Behavior’s style property conflicts with a choice', () => {
    // A Behavior that writes the gap itself owns it.
    const Spaced = Behavior.forSlots(HeroSlots)<unknown, string>(
      {
        root: Behavior.slot({
          attributes: ({ h }: { readonly input: unknown; readonly h: HtmlBuilder<string> }) => [
            h.Style({ gap: '0' }),
          ],
        }),
      },
      { name: 'Spaced' },
    )
    const h = SlotView.inertBuilder<string>()
    const plain = HeroLook.draw({ appearance: {}, h, with: [Spaced.mixin] })
    expect(Attributes.find(plain.root.attrs(), 'Style')?.value).toEqual({ gap: '0' })
    const chosen = HeroLook.draw({ appearance: { gap: 'm' }, h, with: [Spaced.mixin] })
    expect(() => chosen.root.attrs()).toThrow('two owners for style property "gap"')
  })

  it('refuses a name that is both a recipe axis and a token axis', () => {
    expect(() =>
      Appearance.make(HeroSlots, {
        recipe: Style.recipeFor(HeroSlots)({ variants: { gap: { none: {} } } }),
        tokens: { gap: Appearance.token({ s: '1px' }, { slot: 'root', property: 'gap' }) },
      }),
    ).toThrow('"gap" is both a recipe axis and a token axis')
  })
})

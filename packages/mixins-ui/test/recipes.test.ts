/**
 * The shipped recipes: every selection compiles, every token they reference
 * is one the shipped scales and palette define, bases and variants land in
 * their layers, `extend` adjusts a recipe, and a real `@foldkit/ui` Button
 * resolves with a recipe's class.
 */
import { describe, expect, it } from 'vitest'
import { view as buttonView } from '@foldkit/ui/button'
import {
  Capability,
  Layers,
  Slot,
  Slots,
  Style,
  type SlotAttributes,
  type StyleValues,
} from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import {
  Button,
  ButtonSlots,
  CheckboxSlots,
  DialogSlots,
  InputSlots,
  Recipes,
  SegmentedSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
} from '../src/index.js'
import { attributeOf, h, message, type TestMessage } from './fixture.js'

const palette = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } }))
const defined = new Set([
  ...Object.entries(palette).flatMap(([group, names]) =>
    Object.keys(names).map(name => `${group}-${name}`),
  ),
  // Set by a container drawn in its own color, not by a theme.
  'ink',
])

/** Every selection of a recipe: the defaults, then each value of each axis. */
const selections = (variants: Readonly<Record<string, Readonly<Record<string, unknown>>>>) => [
  {},
  ...Object.entries(variants).flatMap(([axis, values]) =>
    Object.keys(values).map(value => ({ [axis]: value })),
  ),
]

/** Top-level blocks of a stylesheet, split by brace depth. */
const blocks = (css: string): ReadonlyArray<string> => {
  const found: Array<string> = []
  let depth = 0
  let start = 0
  for (let index = 0; index < css.length; index++) {
    if (css[index] === '{') depth++
    if (css[index] === '}' && --depth === 0) {
      found.push(css.slice(start, index + 1))
      start = index + 1
    }
  }
  return found
}

/** Every slot piece of every selection of every recipe. */
const allPieces = [
  ...selections(Recipes.Button.def.variants).map(selection => Recipes.Button(selection)),
  ...selections(Recipes.Input.def.variants).map(selection => Recipes.Input(selection)),
  ...selections(Recipes.Textarea.def.variants).map(selection => Recipes.Textarea(selection)),
  ...selections(Recipes.Checkbox.def.variants).map(selection => Recipes.Checkbox(selection)),
  ...selections(Recipes.Switch.def.variants).map(selection => Recipes.Switch(selection)),
  ...selections(Recipes.Dialog.def.variants).map(selection => Recipes.Dialog(selection)),
  ...selections(Recipes.Tabs.def.variants).map(selection => Recipes.Tabs(selection)),
  ...selections(Recipes.Segmented.def.variants).map(selection => Recipes.Segmented(selection)),
].flatMap(pieces => Object.values(pieces))

const compiled = {
  Button: selections(Recipes.Button.def.variants).map(
    selection => Style.forSlots(ButtonSlots)(Recipes.Button(selection)).css,
  ),
  Input: selections(Recipes.Input.def.variants).map(
    selection => Style.forSlots(InputSlots)(Recipes.Input(selection)).css,
  ),
  Textarea: selections(Recipes.Textarea.def.variants).map(
    selection => Style.forSlots(TextareaSlots)(Recipes.Textarea(selection)).css,
  ),
  Checkbox: selections(Recipes.Checkbox.def.variants).map(
    selection => Style.forSlots(CheckboxSlots)(Recipes.Checkbox(selection)).css,
  ),
  Switch: selections(Recipes.Switch.def.variants).map(
    selection => Style.forSlots(SwitchSlots)(Recipes.Switch(selection)).css,
  ),
  Dialog: selections(Recipes.Dialog.def.variants).map(
    selection => Style.forSlots(DialogSlots)(Recipes.Dialog(selection)).css,
  ),
  Tabs: selections(Recipes.Tabs.def.variants).map(
    selection => Style.forSlots(TabsSlots)(Recipes.Tabs(selection)).css,
  ),
  Segmented: selections(Recipes.Segmented.def.variants).map(
    selection => Style.forSlots(SegmentedSlots)(Recipes.Segmented(selection)).css,
  ),
}

describe('Recipes', () => {
  it.each(Object.entries(compiled))('%s compiles every selection to CSS', (_, sheets) => {
    for (const css of sheets) expect(css.length).toBeGreaterThan(0)
  })

  it.each(Object.entries(compiled))('%s references only defined tokens', (_, sheets) => {
    const references = sheets.flatMap(css =>
      [...css.matchAll(/var\(--fk-([a-z0-9-]+)/g)].map(match => match[1] ?? ''),
    )
    expect(references.length).toBeGreaterThan(0)
    expect(references.filter(reference => !defined.has(reference))).toEqual([])
  })

  it('draws an unfilled button’s text in a band’s --fk-ink before its tone’s', () => {
    for (const variant of ['outline', 'ghost'] as const) {
      const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant })).css
      expect(css).toContain('color:var(--fk-ink, var(--_fk-tone-ink))')
    }
    const solid = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'solid' })).css
    expect(solid).not.toContain('--fk-ink')
  })

  it.each(Object.entries(compiled))('%s emits every rule inside a layer', (_, sheets) => {
    for (const css of sheets) {
      for (const block of blocks(css)) {
        expect(block).toMatch(/^@layer (components|variants)\{/)
      }
    }
  })

  it('writes no inline declarations, so a later layer can override any of them', () => {
    expect(allPieces.length).toBeGreaterThan(0)
    for (const piece of allPieces) {
      expect(piece.style).toEqual({})
      expect(piece.conditions ?? []).toEqual([])
      expect(piece.items ?? []).toEqual([])
    }
  })

  it('yields to an application rule in the app layer', () => {
    const L = Layers.standard
    const Danger = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
    const Override = Style.forSlots(ButtonSlots)(
      { button: Style.self({ background: 'red' }) },
      { layer: L.layer('app') },
    )
    const sheet = Style.stylesheet(L.declare, Danger, Override)

    // The order is declared once, first, with app after components and variants.
    const order = sheet.slice(0, sheet.indexOf(';'))
    expect(order).toBe(`@layer ${L.names.join(', ')}`)
    expect(L.names.indexOf('app')).toBeGreaterThan(L.names.indexOf('variants'))

    // The recipe's background is a layered rule; the override's is in app.
    const layered = blocks(sheet.slice(order.length + 1))
    expect(
      layered.some(block => /^@layer variants\{.*background:var\(--_fk-tone-fill\)/.test(block)),
    ).toBe(true)
    expect(layered.some(block => /^@layer app\{.*background:red/.test(block))).toBe(true)

    // Both classes land on the element and nothing is inline, so the cascade decides.
    let resolved: SlotAttributes<TestMessage> = []
    buttonView<TestMessage>(
      {
        onClick: message('Clicked'),
        toView: attributes => {
          resolved = Button.resolve(attributes, [Danger.mixin, Override.mixin], {
            input: undefined,
            h,
          }).button
          return h.button(resolved, [])
        },
      },
      h,
    )
    const classes = attributeOf(resolved, 'Class')?.value.split(' ') ?? []
    for (const rule of [...Danger.rules, ...Override.rules]) {
      expect(classes).toContain(rule.className)
    }
    expect(attributeOf(resolved, 'Style')).toBeUndefined()
  })

  it('puts the base in components and a selected variant in variants', () => {
    const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' })).css
    const layered = blocks(css)
    expect(layered.some(block => /^@layer components\{.*cursor:pointer/.test(block))).toBe(true)
    expect(layered.some(block => /^@layer variants\{.*background:transparent/.test(block))).toBe(
      true,
    )
  })

  it('applies a compound only to its combination', () => {
    const outline = 'outline-color:var(--fk-error-outline)'
    const css = (tone: 'accent' | 'danger') =>
      Style.forSlots(ButtonSlots)(Recipes.Button({ tone, variant: 'solid' })).css
    expect(css('danger')).toContain(outline)
    expect(css('accent')).not.toContain(outline)
  })

  it('draws primary in ink whatever the tone', () => {
    const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'primary', size: 'sm' })).css
    expect(css).toContain('background:var(--fk-text-overt)')
    expect(css).toContain('color:var(--fk-surface-base)')
    expect(css).toContain('color-mix(in oklch, var(--fk-text-overt) 85%, var(--fk-surface-base))')
  })

  it.each(['outline', 'ghost', 'icon'] as const)(
    'grounds a %s button’s hover on a tint of its own text, which reads on a colored band',
    variant => {
      const css = Style.forSlots(ButtonSlots)(
        Recipes.Button({ tone: 'neutral', variant, size: null }),
      ).css
      expect(css).toMatch(
        /:hover:not\(\[aria-disabled="true"\], :disabled\)\{[^}]*background:color-mix\(in oklab, currentColor 12%, transparent\)/,
      )
    },
  )

  it('draws an icon button square with only its glyph showing', () => {
    const css = Style.forSlots(ButtonSlots)(
      Recipes.Button({ tone: 'neutral', variant: 'icon', size: null }),
    ).css
    expect(css).toContain('width:2rem')
    expect(css).toContain('height:2rem')
    expect(css).toContain('padding:0')
    expect(css).toContain('font-size:0')
    // No gap beside the hidden words, which pushed the glyph off center.
    expect(css).toContain('gap:0')
  })

  describe('Segmented', () => {
    const css = (selection: Parameters<typeof Recipes.Segmented>[0]): string =>
      Style.forSlots(SegmentedSlots)(Recipes.Segmented(selection)).css

    it('tints the pressed option, flat, for text and icon tiles alike', () => {
      // In the variants layer, so an icon button's own background (a variant) does not hide it.
      const pressed = /@layer variants\{[^@]*> \[aria-pressed="true"\]\{([^}]*)\}/.exec(css({}))
      expect(pressed?.[1]).toContain('background:var(--fk-accent-subtle)')
      expect(pressed?.[1]).toContain('color:var(--fk-accent-ink)')
      expect(pressed?.[1]).toContain('box-shadow:none')
      expect(pressed?.[1]).toContain('font-weight:var(--fk-weight-semibold)')
    })

    it('lays a tray or a plain row', () => {
      expect(css({ tray: 'tray' })).toContain('background:var(--fk-surface-muted)')
      expect(css({ tray: 'plain' })).toContain('display:flex')
      expect(css({ tray: 'plain' })).not.toContain('background:var(--fk-surface-muted)')
    })

    it('densities text options without touching the pressed rule', () => {
      expect(css({ size: 'sm' })).toContain('font-size:var(--fk-size-sm)')
      expect(css({ size: 'sm' })).toContain('padding:0.4rem 0.75rem')
      expect(css({ size: 'xs' })).toContain('font-size:var(--fk-size-xs)')
    })
  })

  describe('Dialog', () => {
    const dialogCss = (selection: Parameters<typeof Recipes.Dialog>[0]): string => {
      const piece = Recipes.Dialog(selection).dialog
      return piece === undefined ? '' : Style.forSlots(DialogSlots)({ dialog: piece }).css
    }

    it('puts the modal back in the middle, where the reset left it in the corner', () => {
      expect(dialogCss({})).toContain('margin:auto')
    })

    it('sizes the panel to the selected width', () => {
      const panel = Recipes.Dialog({ size: 'sm' }).panel
      expect(panel === undefined ? '' : Style.forSlots(DialogSlots)({ panel }).css).toContain(
        'max-inline-size:min(24rem, 100% - 2rem)',
      )
    })
  })

  describe('Badge', () => {
    const BadgeSlots = Slots.define({
      badge: Slot.make({ capability: Capability.Container }),
    })
    const tones = { Published: 'success', Changed: 'warning', New: 'info' } as const
    const css = (attribute = 'data-state'): string =>
      Style.forSlots(BadgeSlots)({ badge: Recipes.Badge({ attribute, tones }).badge }).css

    it('compiles the pill, its dot, and one rule per mapped value', () => {
      expect(css()).toContain('border-radius:var(--fk-radius-full)')
      expect(css()).toContain('::before')
      expect(css()).toContain('background:currentColor')
      expect(css()).toContain('[data-state="Published"]')
      expect(css()).toContain('[data-state="Changed"]')
      expect(css()).toContain('[data-state="New"]')
    })

    it('tones a value with its family wash and ink', () => {
      expect(css()).toContain('background:var(--fk-success-subtle)')
      expect(css()).toContain('color:var(--fk-success-ink)')
      expect(css()).toContain('color:var(--fk-warning-ink)')
    })

    it('leaves an unmapped value on the base and takes the attribute', () => {
      expect(css()).not.toContain('[data-state="Archived"]')
      expect(css('data-cms-state')).toContain('[data-cms-state="Published"]')
      expect(css('data-cms-state')).not.toContain('[data-state="Published"]')
    })

    it('references only defined tokens', () => {
      const references = [...css().matchAll(/var\(--fk-([a-z0-9-]+)/g)].map(match => match[1] ?? '')
      expect(references.length).toBeGreaterThan(0)
      expect(references.filter(reference => !defined.has(reference))).toEqual([])
    })

    it('emits every rule inside a layer, base in components and tones in variants', () => {
      for (const block of blocks(css())) {
        expect(block).toMatch(/^@layer (components|variants)\{/)
      }
      const layered = blocks(css())
      expect(layered.some(block => /^@layer components\{/.test(block))).toBe(true)
      expect(layered.some(block => /^@layer variants\{.*data-state/.test(block))).toBe(true)
    })

    it('writes no inline declarations', () => {
      const piece = Recipes.Badge({ attribute: 'data-state', tones }).badge
      expect(piece.style).toEqual({})
      expect(piece.conditions ?? []).toEqual([])
      expect(piece.items ?? []).toEqual([])
    })
  })

  it('extend composes a patch onto a variant and the base', () => {
    const Brand = Recipes.Button.extend({
      base: { button: Style.class('brand-button') },
      variants: { tone: { accent: { button: Style.class('brand-accent') } } },
    })
    const classes = (pieces: StyleValues<typeof ButtonSlots>) => pieces.button?.classes ?? []
    expect(classes(Brand())).toEqual(expect.arrayContaining(['brand-button', 'brand-accent']))
    expect(classes(Brand({ tone: 'danger' }))).toContain('brand-button')
    expect(classes(Brand({ tone: 'danger' }))).not.toContain('brand-accent')
    expect(classes(Recipes.Button())).not.toContain('brand-button')
  })

  it('styles a real @foldkit/ui Button through its adapter', () => {
    const Danger = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
    let resolved: SlotAttributes<TestMessage> = []
    buttonView<TestMessage>(
      {
        onClick: message('Clicked'),
        toView: attributes => {
          resolved = Button.resolve(attributes, [Danger.mixin], { input: undefined, h }).button
          return h.button(resolved, [])
        },
      },
      h,
    )
    const generated = Danger.rules[0]?.className ?? ''
    expect(generated).not.toBe('')
    expect(attributeOf(resolved, 'Class')?.value.split(' ')).toContain(generated)
    expect(attributeOf(resolved, 'OnClick')?.message).toEqual(message('Clicked'))
    expect(Danger.css).toContain('--_fk-tone-fill:var(--fk-error-default)')
  })
})

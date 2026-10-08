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
  AvatarSlots,
  CardSlots,
  AlertSlots,
  SeparatorSlots,
  SkeletonSlots,
  ItemSlots,
  EmptySlots,
  SpinnerSlots,
  KbdSlots,
  BreadcrumbSlots,
  LabelSlots,
  TableSlots,
  CheckboxSlots,
  ComboboxSlots,
  DatePickerSlots,
  DialogSlots,
  FileDropSlots,
  InputSlots,
  ListboxSlots,
  MenuSlots,
  PopoverSlots,
  RadioGroupSlots,
  Recipes,
  SegmentedSlots,
  SelectSlots,
  SliderSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
  ToastSlots,
  TooltipSlots,
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
  ...selections(Recipes.Avatar.def.variants).map(selection => Recipes.Avatar(selection)),
  ...selections(Recipes.Table.def.variants).map(selection => Recipes.Table(selection)),
  ...selections(Recipes.Label.def.variants).map(selection => Recipes.Label(selection)),
  ...selections(Recipes.Breadcrumb.def.variants).map(selection => Recipes.Breadcrumb(selection)),
  ...selections(Recipes.Kbd.def.variants).map(selection => Recipes.Kbd(selection)),
  ...selections(Recipes.Spinner.def.variants).map(selection => Recipes.Spinner(selection)),
  ...selections(Recipes.Empty.def.variants).map(selection => Recipes.Empty(selection)),
  ...selections(Recipes.Item.def.variants).map(selection => Recipes.Item(selection)),
  ...selections(Recipes.Skeleton.def.variants).map(selection => Recipes.Skeleton(selection)),
  ...selections(Recipes.Separator.def.variants).map(selection => Recipes.Separator(selection)),
  ...selections(Recipes.Alert.def.variants).map(selection => Recipes.Alert(selection)),
  ...selections(Recipes.Card.def.variants).map(selection => Recipes.Card(selection)),
  ...selections(Recipes.Input.def.variants).map(selection => Recipes.Input(selection)),
  ...selections(Recipes.Textarea.def.variants).map(selection => Recipes.Textarea(selection)),
  ...selections(Recipes.Checkbox.def.variants).map(selection => Recipes.Checkbox(selection)),
  ...selections(Recipes.Switch.def.variants).map(selection => Recipes.Switch(selection)),
  ...selections(Recipes.Dialog.def.variants).map(selection => Recipes.Dialog(selection)),
  ...selections(Recipes.Tabs.def.variants).map(selection => Recipes.Tabs(selection)),
  ...selections(Recipes.Segmented.def.variants).map(selection => Recipes.Segmented(selection)),
  ...selections(Recipes.Menu.def.variants).map(selection => Recipes.Menu(selection)),
  ...selections(Recipes.Listbox.def.variants).map(selection => Recipes.Listbox(selection)),
  ...selections(Recipes.Combobox.def.variants).map(selection => Recipes.Combobox(selection)),
  ...selections(Recipes.Select.def.variants).map(selection => Recipes.Select(selection)),
  ...selections(Recipes.RadioGroup.def.variants).map(selection => Recipes.RadioGroup(selection)),
  ...selections(Recipes.Slider.def.variants).map(selection => Recipes.Slider(selection)),
  ...selections(Recipes.Toast.def.variants).map(selection => Recipes.Toast(selection)),
  ...selections(Recipes.FileDrop.def.variants).map(selection => Recipes.FileDrop(selection)),
  ...selections(Recipes.DatePicker.def.variants).map(selection => Recipes.DatePicker(selection)),
  ...selections(Recipes.Popover.def.variants).map(selection => Recipes.Popover(selection)),
  ...selections(Recipes.Tooltip.def.variants).map(selection => Recipes.Tooltip(selection)),
].flatMap(pieces => Object.values(pieces))

const compiled = {
  Button: selections(Recipes.Button.def.variants).map(
    selection => Style.forSlots(ButtonSlots)(Recipes.Button(selection)).css,
  ),
  Avatar: selections(Recipes.Avatar.def.variants).map(
    selection => Style.forSlots(AvatarSlots)(Recipes.Avatar(selection)).css,
  ),
  Table: selections(Recipes.Table.def.variants).map(
    selection => Style.forSlots(TableSlots)(Recipes.Table(selection)).css,
  ),
  Label: selections(Recipes.Label.def.variants).map(
    selection => Style.forSlots(LabelSlots)(Recipes.Label(selection)).css,
  ),
  Breadcrumb: selections(Recipes.Breadcrumb.def.variants).map(
    selection => Style.forSlots(BreadcrumbSlots)(Recipes.Breadcrumb(selection)).css,
  ),
  Kbd: selections(Recipes.Kbd.def.variants).map(
    selection => Style.forSlots(KbdSlots)(Recipes.Kbd(selection)).css,
  ),
  Spinner: selections(Recipes.Spinner.def.variants).map(
    selection => Style.forSlots(SpinnerSlots)(Recipes.Spinner(selection)).css,
  ),
  Empty: selections(Recipes.Empty.def.variants).map(
    selection => Style.forSlots(EmptySlots)(Recipes.Empty(selection)).css,
  ),
  Item: selections(Recipes.Item.def.variants).map(
    selection => Style.forSlots(ItemSlots)(Recipes.Item(selection)).css,
  ),
  Skeleton: selections(Recipes.Skeleton.def.variants).map(
    selection => Style.forSlots(SkeletonSlots)(Recipes.Skeleton(selection)).css,
  ),
  Separator: selections(Recipes.Separator.def.variants).map(
    selection => Style.forSlots(SeparatorSlots)(Recipes.Separator(selection)).css,
  ),
  Alert: selections(Recipes.Alert.def.variants).map(
    selection => Style.forSlots(AlertSlots)(Recipes.Alert(selection)).css,
  ),
  Card: selections(Recipes.Card.def.variants).map(
    selection => Style.forSlots(CardSlots)(Recipes.Card(selection)).css,
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
  Menu: selections(Recipes.Menu.def.variants).map(
    selection => Style.forSlots(MenuSlots)(Recipes.Menu(selection)).css,
  ),
  Listbox: selections(Recipes.Listbox.def.variants).map(
    selection => Style.forSlots(ListboxSlots)(Recipes.Listbox(selection)).css,
  ),
  Combobox: selections(Recipes.Combobox.def.variants).map(
    selection => Style.forSlots(ComboboxSlots)(Recipes.Combobox(selection)).css,
  ),
  Select: selections(Recipes.Select.def.variants).map(
    selection => Style.forSlots(SelectSlots)(Recipes.Select(selection)).css,
  ),
  RadioGroup: selections(Recipes.RadioGroup.def.variants).map(
    selection => Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup(selection)).css,
  ),
  Slider: selections(Recipes.Slider.def.variants).map(
    selection => Style.forSlots(SliderSlots)(Recipes.Slider(selection)).css,
  ),
  Toast: selections(Recipes.Toast.def.variants).map(
    selection => Style.forSlots(ToastSlots)(Recipes.Toast(selection)).css,
  ),
  FileDrop: selections(Recipes.FileDrop.def.variants).map(
    selection => Style.forSlots(FileDropSlots)(Recipes.FileDrop(selection)).css,
  ),
  DatePicker: selections(Recipes.DatePicker.def.variants).map(
    selection => Style.forSlots(DatePickerSlots)(Recipes.DatePicker(selection)).css,
  ),
  Popover: selections(Recipes.Popover.def.variants).map(
    selection => Style.forSlots(PopoverSlots)(Recipes.Popover(selection)).css,
  ),
  Tooltip: selections(Recipes.Tooltip.def.variants).map(
    selection => Style.forSlots(TooltipSlots)(Recipes.Tooltip(selection)).css,
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

  describe('Menu', () => {
    const css = (selection: Parameters<typeof Recipes.Menu>[0]): string =>
      Style.forSlots(MenuSlots)(Recipes.Menu(selection)).css

    it('opens a bordered panel over later content', () => {
      expect(css({})).toContain('border-radius:var(--fk-radius-lg)')
      expect(css({})).toContain('box-shadow:var(--fk-shadow-lg)')
      expect(css({})).toContain('z-index:20')
    })

    it('densities rows without changing the panel', () => {
      expect(css({ size: 'sm' })).not.toBe(css({ size: 'md' }))
      expect(css({ size: 'md' })).toContain('border-radius:var(--fk-radius-lg)')
    })
  })

  describe('Listbox', () => {
    const css = (selection: Parameters<typeof Recipes.Listbox>[0]): string =>
      Style.forSlots(ListboxSlots)(Recipes.Listbox(selection)).css

    it('tints the chosen option with the accent wash and ink', () => {
      expect(css({})).toMatch(/\[aria-selected="true"\]\{[^}]*background:var\(--fk-accent-subtle\)/)
      expect(css({})).toMatch(/\[aria-selected="true"\]\{[^}]*color:var\(--fk-accent-ink\)/)
    })
  })

  describe('Combobox', () => {
    const css = (selection: Parameters<typeof Recipes.Combobox>[0]): string =>
      Style.forSlots(ComboboxSlots)(Recipes.Combobox(selection)).css

    it('rings the group while its input has focus and keeps the input borderless', () => {
      expect(css({})).toMatch(/:focus-within\{[^}]*outline:[^}]*var\(--fk-outline-focus\)/)
      expect(css({})).toMatch(/\.style-[a-z0-9]+\{[^}]*border:0[^}]*\}/)
    })

    it('tints the chosen row like the listbox', () => {
      expect(css({})).toMatch(/\[aria-selected="true"\]\{[^}]*background:var\(--fk-accent-subtle\)/)
    })
  })

  describe('Select', () => {
    const css = (selection: Parameters<typeof Recipes.Select>[0]): string =>
      Style.forSlots(SelectSlots)(Recipes.Select(selection)).css

    it('keeps room for the value on every size', () => {
      for (const size of ['sm', 'md', 'lg'] as const) {
        const variantBlocks = blocks(css({ size })).filter(block =>
          block.startsWith('@layer variants'),
        )
        expect(variantBlocks.some(block => /padding-inline:[^;]*2rem/.test(block))).toBe(true)
      }
    })

    it('fills instead of outlining on request', () => {
      expect(css({ variant: 'filled' })).toContain('background:var(--fk-surface-subtle)')
      expect(css({ variant: 'outline' })).not.toContain('background:var(--fk-surface-subtle)')
    })
  })

  describe('RadioGroup', () => {
    const css = (selection: Parameters<typeof Recipes.RadioGroup>[0]): string =>
      Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup(selection)).css

    it('fills the checked circle from the tone', () => {
      expect(css({ tone: 'accent' })).toMatch(
        /\[aria-checked="true"\]::after\{[^}]*background:var\(--_fk-tone-fill\)/,
      )
    })

    it('checks neutral in ink, not the pale surface', () => {
      const neutral = Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({ tone: 'neutral' })).css
      expect(neutral).toContain('--_fk-tone-fill:var(--fk-text-default)')
    })

    it('scales the box by size', () => {
      expect(css({ size: 'lg' })).toContain('--_fk-toggle-size:1.25rem')
    })

    it('sits the checked dot on whole pixels, centered at every size', () => {
      expect(css({})).toMatch(/\[aria-checked="true"\]::after\{[^}]*inset:3px/)
    })
  })

  describe('Slider', () => {
    const css = (selection: Parameters<typeof Recipes.Slider>[0]): string =>
      Style.forSlots(SliderSlots)(Recipes.Slider(selection)).css

    it('fills the track and rims the thumb in the tone', () => {
      expect(css({})).toContain('background:var(--_fk-tone-fill)')
      expect(css({ tone: 'neutral' })).toContain('--_fk-tone-fill:var(--fk-text-default)')
    })

    it('scales the thumb by size', () => {
      expect(css({ size: 'sm' })).toContain('--_fk-slider-size:0.75rem')
    })
  })

  describe('Toast', () => {
    const css = (): string => Style.forSlots(ToastSlots)(Recipes.Toast({})).css

    it('stacks entries bottom-right above the page', () => {
      expect(css()).toContain('position:fixed')
      expect(css()).toContain('z-index:50')
    })

    it('edges each entry with the accent', () => {
      expect(css()).toContain('border-inline-start:')
      expect(css()).toContain('var(--fk-accent-default)')
    })
  })

  describe('FileDrop', () => {
    const css = (): string => Style.forSlots(FileDropSlots)(Recipes.FileDrop({})).css

    it('draws a dashed zone that tints on drag-over', () => {
      expect(css()).toMatch(/border:[^;]*dashed/)
      expect(css()).toContain('[data-drag-over="true"]')
      expect(css()).toContain('background:var(--fk-accent-subtle)')
    })

    it('hides the file input off the root, beside the component class', () => {
      expect(css()).toContain('> input{')
      expect(css()).toContain('clip-path:inset(50%)')
    })
  })

  describe('DatePicker', () => {
    const css = (selection: Parameters<typeof Recipes.DatePicker>[0]): string =>
      Style.forSlots(DatePickerSlots)(Recipes.DatePicker(selection)).css

    it('draws the trigger as a bordered control', () => {
      expect(css({})).toMatch(/border:[^;]*solid[^;]*var\(--fk-outline-default\)/)
    })

    it('densities the trigger by size', () => {
      expect(css({ size: 'sm' })).toContain('font-size:var(--fk-size-sm)')
    })
  })

  describe('Popover', () => {
    const css = (selection: Parameters<typeof Recipes.Popover>[0]): string =>
      Style.forSlots(PopoverSlots)(Recipes.Popover(selection)).css

    it('floats the panel above page content', () => {
      expect(css({})).toContain('box-shadow:var(--fk-shadow-lg)')
      expect(css({})).toContain('z-index:20')
    })

    it('sizes the panel by selection', () => {
      expect(css({ size: 'lg' })).toContain('max-inline-size:min(32rem, 100% - 2rem)')
    })
  })

  describe('Tooltip', () => {
    const css = (): string => Style.forSlots(TooltipSlots)(Recipes.Tooltip({})).css

    it('draws the pill dark on any ground', () => {
      expect(css()).toContain('background:var(--fk-text-overt)')
      expect(css()).toContain('color:var(--fk-surface-base)')
    })

    it('underlines the trigger dotted', () => {
      expect(css()).toContain('text-decoration:underline dotted')
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

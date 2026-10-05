/**
 * Compile-time recipe contracts. Type-checked, not executed.
 */
import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ref } from '../src/recipes/design.js'
import { ButtonSlots, Icons, Recipes, SegmentedSlots, Touch } from '../src/index.js'

void ref.surface.overt
void ref.space.md

// @ts-expect-error a token the palette does not define.
void ref.surface.shiny

// @ts-expect-error a group neither the scales nor the palette have.
void ref.elevation

// The shadow scale, from the scales, and its color, from the palette.
void ref.shadow.md
void ref.shadow.color
// @ts-expect-error a step the shadow scale does not have.
void ref.shadow.huge

Recipes.Button({ tone: 'danger', variant: 'ghost', size: 'sm' })

// @ts-expect-error a tone the recipe does not offer.
Recipes.Button({ tone: 'brand' })

Recipes.Button({ variant: 'primary', size: 'sm' })
Recipes.Button({ tone: 'neutral', variant: 'icon', size: null })

// @ts-expect-error a variant the recipe does not offer.
Recipes.Button({ variant: 'raised' })

Recipes.Segmented({ tray: 'plain', size: 'sm' })

// @ts-expect-error a tray the recipe does not offer.
Recipes.Segmented({ tray: 'box' })

Recipes.Badge({
  attribute: 'data-state',
  tones: { Published: 'success', Changed: 'warning' },
})

// @ts-expect-error a badge tone is one of the four palette families.
Recipes.Badge({ attribute: 'data-state', tones: { Published: 'brand' } })

// @ts-expect-error the badge's attribute is required.
Recipes.Badge({ tones: { Published: 'success' } })

// The README's Badge section, kept compiling.
const EntrySlots = Slots.define({
  badge: Slot.make({ capability: Capability.Container }),
})
const EntryStyle = Style.forSlots(EntrySlots)({
  badge: Recipes.Badge({
    attribute: 'data-state',
    tones: { Published: 'success', Changed: 'warning' },
  }).badge,
})
void EntryStyle

// @ts-expect-error Dialog's recipe has no `open` axis.
Recipes.Dialog({ size: 'md', open: 'yes' })

// The README's Recipes section, kept compiling.
const DeleteStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' }),
)
const L = Layers.standard
const palette = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })
const _sheet: string = Style.stylesheet(
  L.declare,
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(palette)),
  DeleteStyle,
)
void _sheet
const Red = Style.forSlots(ButtonSlots)(
  { button: Style.self({ background: 'red' }) },
  { layer: L.layer('app') },
)
const _overridden: string = Style.stylesheet(L.declare, DeleteStyle, Red)
void _overridden
const _brand = Recipes.Button.extend({
  base: { button: Style.class('brand-button') },
  variants: { size: { lg: { button: Style.class('brand-button-lg') } } },
})
void _brand

// The README's Mechanisms section, kept compiling.
const TileSlots = Slots.define({
  tile: Slot.make({ capability: Capability.Container }),
})
const iconUrl = (name: string): string => `url("${name}")`
const TileStyle = Style.forSlots(TileSlots)(
  {
    tile: Style.compose(
      Touch.target,
      Icons.glyph('1rem'),
      Icons.byAttribute('data-block', { Hero: iconUrl('hero') }),
    ),
  },
  { layer: L.layer('app') },
)
void TileStyle

// The README's Segmented section, kept compiling.
const SegmentedStyle = Style.forSlots(SegmentedSlots)(
  {
    group: Recipes.Segmented({ tray: 'plain', size: 'sm' }).group ?? Style.empty,
    option: Recipes.Segmented({ tray: 'plain', size: 'sm' }).option ?? Style.empty,
  },
  { layer: L.layer('app') },
)
void SegmentedStyle

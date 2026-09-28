/**
 * The todo list's appearance, as `foldkit-mixins` data. `main.ts` publishes
 * the Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, CheckboxSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Blue over near-gray surfaces, as upstream's Tailwind `blue-500` and `gray-*`. */
const palette = Theme.oklch({
  accent: { h: 260, c: 0.214, l: '62.3%' },
  surfaceSaturation: 0.003,
})

/** A white base, so the card stands out from the page's `surface.muted`. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

/** Upstream's `flex items-center`: one line, unlike `Layout.cluster`, which wraps. */
const row = (gap: string): StyleValue => Style.self({ display: 'flex', alignItems: 'center', gap })

// PAGE

export const PageSlots = Slots.define({
  page: container,
  card: container,
  heading: container,
  form: container,
  empty: container,
  list: container,
  item: container,
  editingItem: container,
  checkboxField: container,
  todoText: container,
  footer: container,
  status: container,
  buttonRow: container,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({
      minHeight: '100vh',
      padding: `${t.space.xl} ${t.space.md}`,
      background: t.surface.muted,
      color: t.text.default,
    }),
    card: Style.self({
      maxWidth: '28rem',
      marginInline: 'auto',
      padding: t.space.lg,
      borderRadius: t.radius.xl,
      background: t.surface.base,
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
    }),
    heading: Style.self({
      margin: `0 0 ${t.space.xl}`,
      textAlign: 'center',
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    form: Style.compose(row(t.space.sm), Style.self({ marginBottom: t.space.lg })),
    empty: Style.self({
      padding: `${t.space.xl} 0`,
      textAlign: 'center',
      color: t.text.muted,
    }),
    list: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({ margin: `0 0 ${t.space.lg}`, padding: '0', listStyle: 'none' }),
    ),
    item: Style.compose(
      row(t.space.sm),
      Style.self({ padding: t.space.sm, borderRadius: t.radius.lg }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ),
    editingItem: Style.compose(
      row(t.space.sm),
      Style.self({
        padding: t.space.sm,
        borderRadius: t.radius.lg,
        background: t.surface.subtle,
      }),
    ),
    checkboxField: Style.self({ display: 'flex', alignItems: 'center' }),
    todoText: Style.compose(
      Style.self({ flex: '1', color: t.text.overt }),
      Style.states({ completed: { textDecoration: 'line-through', color: t.text.muted } }),
    ),
    footer: L.in('layouts', Layout.stack({ gap: t.space.md })),
    status: Style.self({ textAlign: 'center', fontSize: t.size.sm, color: t.text.muted }),
    buttonRow: L.in('layouts', Layout.cluster({ gap: t.space.xs, justify: 'center' })),
  },
  { name: 'PageStyle', layer: app },
)

// INPUT

/** The recipe's field, sharing its row with a button: it takes the room the button leaves. */
const inputIn = (paddingInline: string, borderRadius: string) =>
  Recipes.Input.extend({
    base: {
      input: Style.self({ flex: '1', minWidth: '0', paddingInline, borderRadius }),
    },
  })()

export const NewTodoInputStyle = Style.forSlots(InputSlots)(inputIn(t.space.md, t.radius.lg), {
  name: 'NewTodoInputStyle',
  layer: app,
})

export const EditInputStyle = Style.forSlots(InputSlots)(inputIn(t.space.sm, t.radius.sm), {
  name: 'EditInputStyle',
  layer: app,
})

export const CheckboxStyle = Style.forSlots(CheckboxSlots)(Recipes.Checkbox(), {
  name: 'CheckboxStyle',
  layer: app,
})

// BUTTON

/** Upstream's small buttons: `px-3 py-1 rounded`. */
const compact: StyleValue = Style.self({
  paddingBlock: t.space['2xs'],
  paddingInline: t.space.sm,
  borderRadius: t.radius.sm,
})

/** A button filled with `fill`, its text in `ink`, darkened to `hover` under the pointer. */
const filled = (fill: string, ink: string, hover: string): StyleValue =>
  Style.compose(
    Style.self({ background: fill, color: ink }),
    Style.pseudo(':hover', { background: hover }),
  )

export const AddButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.self({ paddingInline: t.space.lg, borderRadius: t.radius.lg }),
    },
  })(),
  { name: 'AddButtonStyle', layer: app },
)

export const SaveButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        compact,
        filled(t.success.default, t.success['on-fill'], t.success.outline),
      ),
    },
  })(),
  { name: 'SaveButtonStyle', layer: app },
)

export const CancelButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: { button: Style.compose(compact, filled(t.text.muted, t.surface.base, t.text.subtle)) },
  })(),
  { name: 'CancelButtonStyle', layer: app },
)

/** Hidden until its row is hovered, as upstream's `group-hover`; shown when focused too. */
export const DeleteButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        Style.self({
          paddingBlock: t.space['2xs'],
          paddingInline: t.space.xs,
          borderRadius: t.radius.sm,
          opacity: '0',
          transitionProperty: 'opacity, background-color',
        }),
        Style.nest(':hover > &', { opacity: '1' }),
        Style.pseudo(':focus-visible', { opacity: '1' }),
      ),
    },
  })({ tone: 'danger', variant: 'ghost' }),
  { name: 'DeleteButtonStyle', layer: app },
)

const CompactButton = Recipes.Button.extend({ base: { button: compact } })

export const FilterButtonStyle = Style.forSlots(ButtonSlots)(CompactButton({ tone: 'neutral' }), {
  name: 'FilterButtonStyle',
  layer: app,
})

export const SelectedFilterButtonStyle = Style.forSlots(ButtonSlots)(CompactButton(), {
  name: 'SelectedFilterButtonStyle',
  layer: app,
})

export const ActionButtonStyle = Style.forSlots(ButtonSlots)(
  CompactButton({ tone: 'neutral', size: 'sm' }),
  { name: 'ActionButtonStyle', layer: app },
)

export const ClearButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        compact,
        filled(
          t.error.subtle,
          t.error.ink,
          `color-mix(in oklch, ${t.error.subtle} 80%, ${t.error.default})`,
        ),
      ),
    },
  })({ tone: 'danger', size: 'sm' }),
  { name: 'ClearButtonStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here. `colorScheme: 'light'`
 * keeps the page light in a dark browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)

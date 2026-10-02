/**
 * The todo list's appearance, as `foldkit-mixins` data. `main.ts` draws the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, CheckboxSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

/**
 * Blue over near-gray surfaces, as upstream's Tailwind `blue-500` and `gray-*`.
 * A white base, so the card stands out from the page's `surface.muted`.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 260, c: 0.214, l: '62.3%' },
      surfaceSaturation: 0.003,
    }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

/** Upstream's `flex items-center`: one line, unlike `Layout.cluster`, which wraps. */
const row = (gap: string): StyleValue => Style.self({ display: 'flex', alignItems: 'center', gap })

// PAGE

export const TodoPage = slots(
  {
    page: [
      U.py('xl'),
      U.px('md'),
      U.bg('surface.muted'),
      U.color('text.default'),
      { minHeight: '100vh' },
    ],
    card: [
      U.p('lg'),
      U.rounded('xl'),
      U.bg('surface.base'),
      {
        maxWidth: '28rem',
        marginInline: 'auto',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
      },
    ],
    heading: [
      U.textCenter,
      U.text('3xl'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space.xl}` },
    ],
    form: [row(t.space.sm), { marginBottom: t.space.lg }],
    empty: [U.textCenter, U.color('text.muted'), { padding: `${t.space.xl} 0` }],
    list: [
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      { margin: `0 0 ${t.space.lg}`, padding: '0', listStyle: 'none' },
    ],
    item: [
      row(t.space.sm),
      U.p('sm'),
      U.rounded('lg'),
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ],
    editingItem: [row(t.space.sm), U.p('sm'), U.rounded('lg'), U.bg('surface.subtle')],
    checkboxField: [U.flex, U.items('center')],
    todoText: [
      U.color('text.overt'),
      { flex: '1' },
      Style.states({ completed: { textDecoration: 'line-through', color: t.text.muted } }),
    ],
    footer: L.in('layouts', Layout.stack({ gap: t.space.md })),
    status: [U.textCenter, U.text('sm'), U.color('text.muted')],
    buttonRow: L.in('layouts', Layout.cluster({ gap: t.space.xs, justify: 'center' })),
  },
  { name: 'PageStyle' },
)

// INPUT

/** The recipe's field, sharing its row with a button: it takes the room the button leaves. */
const inputIn = (paddingInline: string, borderRadius: string) =>
  Recipes.Input.extend({
    base: {
      input: [{ flex: '1', minWidth: '0', paddingInline, borderRadius }],
    },
  })()

export const NewTodoInputStyle = forSlots(InputSlots)(inputIn(t.space.md, t.radius.lg), {
  name: 'NewTodoInputStyle',
})

export const EditInputStyle = forSlots(InputSlots)(inputIn(t.space.sm, t.radius.sm), {
  name: 'EditInputStyle',
})

export const CheckboxStyle = forSlots(CheckboxSlots)(Recipes.Checkbox(), {
  name: 'CheckboxStyle',
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

export const AddButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [{ paddingInline: t.space.lg, borderRadius: t.radius.lg }],
    },
  })(),
  { name: 'AddButtonStyle' },
)

export const SaveButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [compact, filled(t.success.default, t.success['on-fill'], t.success.outline)],
    },
  })(),
  { name: 'SaveButtonStyle' },
)

export const CancelButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: { button: [compact, filled(t.text.muted, t.surface.base, t.text.subtle)] },
  })(),
  { name: 'CancelButtonStyle' },
)

/** Hidden until its row is hovered, as upstream's `group-hover`; shown when focused too. */
export const DeleteButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [
        {
          paddingBlock: t.space['2xs'],
          paddingInline: t.space.xs,
          borderRadius: t.radius.sm,
          opacity: '0',
          transitionProperty: 'opacity, background-color',
        },
        Style.nest(':hover > &', { opacity: '1' }),
        Style.pseudo(':focus-visible', { opacity: '1' }),
      ],
    },
  })({ tone: 'danger', variant: 'ghost' }),
  { name: 'DeleteButtonStyle' },
)

const CompactButton = Recipes.Button.extend({ base: { button: [compact] } })

export const FilterButtonStyle = forSlots(ButtonSlots)(CompactButton({ tone: 'neutral' }), {
  name: 'FilterButtonStyle',
})

export const SelectedFilterButtonStyle = forSlots(ButtonSlots)(CompactButton(), {
  name: 'SelectedFilterButtonStyle',
})

export const ActionButtonStyle = forSlots(ButtonSlots)(
  CompactButton({ tone: 'neutral', size: 'sm' }),
  { name: 'ActionButtonStyle' },
)

export const ClearButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [
        compact,
        filled(
          t.error.subtle,
          t.error.ink,
          `color-mix(in oklch, ${t.error.subtle} 80%, ${t.error.default})`,
        ),
      ],
    },
  })({ tone: 'danger', size: 'sm' }),
  { name: 'ClearButtonStyle' },
)

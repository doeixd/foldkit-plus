/**
 * Appearance and interaction, attached from outside the views.
 *
 * `foldkit-mixins` splits a view into three things:
 *
 * - **Slots**: the points a view is willing to let others customize, named and
 *   typed by capability and by the events they expose.
 * - **Style**: appearance as data. Classes and inline declarations, conditions
 *   read from the view's input at render time, recipes for variants, and
 *   rule-based pieces (`pseudo`, `media`, `nest`) that compile to one
 *   deterministic class plus CSS.
 * - **Behavior**: interaction attached to a slot, built from the view's input
 *   and its builder, so it can only emit Messages the view may emit.
 *
 * - **Theme and layout**: the palette is derived from one accent color by
 *   `Theme.oklch`, and rows, toolbars and the page are `Layout` pieces.
 *   `sheet.ts` ships them in cascade layers, with every style here in `app`,
 *   so an application rule wins over the layouts and the recipe it composes.
 *
 * None of this owns state. The views in `view.ts` publish the slots; this file
 * never sees markup.
 */
import { Option } from 'effect'
import {
  Attr,
  Behavior,
  Capability,
  Event,
  Layers,
  Slot,
  Slots,
  Style,
  type NamedStyle,
  type StyleValue,
} from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { Message, type Filter, type Priority, type Todo } from './app.js'
import type { BoardMessage } from './surface.js'

// --- theme: a palette from one accent color --------------------------------------

/**
 * Every color is derived in the browser from these knobs with relative color
 * syntax and `light-dark()`, so the dark scheme needs no override of its own.
 */
const palette = Theme.oklch({
  accent: { h: 277, c: 0.23, l: '51%', dark: { l: '68%', c: 0.18 } },
  feedback: { info: 220 },
  // Near-neutral surfaces, as the hand-picked grays were.
  surfaceSaturation: 0.006,
})

/** What only this app names, derived from the palette so it follows the scheme too. */
const own = Theme.define({
  radius: { card: '16px', control: '10px' },
  text: {
    done: `color-mix(in oklch, ${Theme.ref(palette).text.muted} 60%, ${Theme.ref(palette).surface.base})`,
  },
})

export const theme = Theme.compose(Theme.compose(Theme.tokens, palette), own)

/** `t.accent.default` is `var(--fk-accent-default)`; a name the theme lacks is a type error. */
export const t = Theme.ref(theme)

const control: StyleValue = Style.inline({
  font: 'inherit',
  borderRadius: t.radius.control,
})

/**
 * Places a slot style in the `app` layer where it is defined, so the value a
 * view attaches is the one the sheet ships. Layering changes a rule's class,
 * so a copy layered later in the sheet would carry classes no view renders.
 */
const app = <S>(style: NamedStyle<S>): NamedStyle<S> => Layers.standard.in('app', style)

// --- the page ------------------------------------------------------------------

export const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

export const PageStyle = app(
  Style.forSlots(PageSlots)(
    {
      root: Style.compose(
        Style.class('app'),
        Layers.standard.in('layouts', Layout.stack({ gap: '1.25rem' })),
        Style.inline({
          width: 'min(40rem, 100%)',
          background: t.surface.base,
          color: t.text.default,
          border: `1px solid ${t.outline.subtle}`,
          borderRadius: t.radius.card,
          padding: '1.75rem',
          boxShadow: '0 12px 40px rgb(0 0 0 / 8%)',
        }),
        Style.media('(max-width: 30rem)', { padding: '1rem', borderRadius: '0' }),
      ),
    },
    { name: 'PageStyle' },
  ),
)

// --- header --------------------------------------------------------------------

export const HeaderSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Change],
    attributes: [Attr.AriaLabel],
  }),
  tally: Slot.make({ capability: Capability.Container }),
})

export const HeaderStyle = app(
  Style.forSlots(HeaderSlots)(
    {
      root: Layers.standard.in(
        'layouts',
        Layout.cluster({ justify: 'space-between', align: 'baseline', gap: '1rem' }),
      ),
      title: Style.compose(
        control,
        Style.inline({
          border: '0',
          background: 'transparent',
          color: 'inherit',
          fontSize: '1.6rem',
          fontWeight: '700',
          letterSpacing: '-0.02em',
          padding: '0.1rem 0.25rem',
          margin: '0 -0.25rem',
          minWidth: '0',
        }),
        Style.pseudo(':focus-visible', {
          outline: `2px solid ${t.outline.focus}`,
          outlineOffset: '2px',
        }),
      ),
      tally: Style.inline({ margin: '0', color: t.text.muted, fontSize: '0.85rem' }),
    },
    { name: 'HeaderStyle' },
  ),
)

// --- composer --------------------------------------------------------------------

export const ComposerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, events: [Event.Submit] }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaLabel],
  }),
})

export const ComposerStyle = app(
  Style.forSlots(ComposerSlots)(
    {
      root: Layers.standard.in('layouts', Layout.cluster({ gap: '0.5rem', align: 'stretch' })),
      input: Style.compose(
        control,
        Style.inline({
          flex: '1',
          padding: '0.7rem 0.85rem',
          border: `1px solid ${t.outline.default}`,
          background: 'transparent',
          color: 'inherit',
        }),
        Style.pseudo(':focus', {
          outline: `2px solid ${t.outline.focus}`,
          outlineOffset: '1px',
        }),
      ),
    },
    { name: 'ComposerStyle' },
  ),
)

/**
 * The Add button is a `@foldkit/ui` Button drawn with the shipped Button
 * recipe. The component builds the accessible attribute bundle and owns the
 * click; the recipe attaches to the contract `foldkit-mixins-ui` publishes for
 * it, and `extend` adjusts it here instead of forking it.
 */
const AddButton = Recipes.Button.extend({
  base: {
    button: Style.inline({
      borderRadius: t.radius.control,
      padding: '0.7rem 1.1rem',
      fontWeight: '600',
    }),
  },
})

export const AddButtonStyle = app(
  Style.forSlots(ButtonSlots)(AddButton(), { name: 'AddButtonStyle' }),
)

// --- filters: one slot, resolved once per filter with the filter as input --------

export interface FilterInput {
  readonly filter: Filter
  readonly active: boolean
}

export const FilterSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaSelected],
  }),
})

export const FilterStyle = app(
  Style.forSlots(FilterSlots)(
    {
      button: Style.compose(
        Style.class('filter'),
        Style.inline({
          padding: '0.3rem 0.75rem',
          border: '1px solid transparent',
          borderRadius: t.radius.full,
          background: 'transparent',
          color: t.text.muted,
          font: 'inherit',
          textTransform: 'capitalize',
          cursor: 'pointer',
        }),
        // A condition read from the input at render time: the same slot, styled
        // per filter without a class per state in the view.
        Style.whenInput<FilterInput>(
          input => input.active,
          Style.inline({
            borderColor: t.outline.subtle,
            background: t.accent.subtle,
            color: t.text.link,
          }),
        ),
        Style.pseudo(':hover', { color: t.text.default }),
      ),
    },
    { name: 'FilterStyle' },
  ),
)

/** Interaction for the same slot: the selected filter announces itself. */
export const FilterBehavior = Behavior.forSlots(FilterSlots)<FilterInput, BoardMessage>(
  {
    button: Behavior.slot({
      requires: { events: [Event.Click], attributes: [Attr.AriaSelected] },
      attributes: ({ input, h }) => [h.AriaSelected(input.active)],
    }),
  },
  { name: 'FilterBehavior' },
)

// --- one todo row --------------------------------------------------------------

export interface ItemInput {
  readonly todo: Todo
  readonly editing: boolean
  readonly editDraft: string
}

export const ItemSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  priority: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  remove: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  editor: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown, Event.Blur],
    attributes: [Attr.AriaLabel],
  }),
})

/** A recipe: the priority badge's appearance as a typed variant selector. */
const badge = Style.recipe({
  base: Style.compose(
    Style.class('badge'),
    Style.inline({
      border: '0',
      borderRadius: t.radius.full,
      padding: '0.1rem 0.55rem',
      font: 'inherit',
      fontSize: '0.75rem',
      cursor: 'pointer',
      background: `color-mix(in srgb, currentColor 12%, transparent)`,
    }),
  ),
  variants: {
    priority: {
      high: Style.inline({ color: t.warning.default }),
      normal: Style.inline({ color: t.text.muted }),
      low: Style.inline({ color: t.info.default }),
    },
  },
  defaults: { priority: 'normal' },
})

const priorities: ReadonlyArray<Priority> = ['high', 'normal', 'low']

export const ItemStyle = app(
  Style.forSlots(ItemSlots)(
    {
      root: Style.compose(
        Style.class('item'),
        Layers.standard.in('layouts', Layout.cluster({ gap: '0.75rem' })),
        Style.inline({
          flexWrap: 'nowrap',
          padding: '0.6rem 0',
          borderTop: `1px solid ${t.outline.subtle}`,
        }),
        // `nest` styles a descendant from the row's own class, so hovering the
        // row reveals its delete button without the view knowing.
        Style.nest(' .item-remove', { opacity: '0' }),
        Style.pseudo(':is(:hover, :focus-within) .item-remove', { opacity: '1' }),
      ),
      title: Style.compose(
        Style.inline({ flex: '1', cursor: 'text' }),
        Style.whenInput<ItemInput>(
          input => input.todo.completed,
          Style.inline({ color: t.text.done, textDecoration: 'line-through' }),
        ),
      ),
      // The recipe picks the variant from the input, one piece per priority.
      priority: Style.compose(
        ...priorities.map(priority =>
          Style.whenInput<ItemInput>(
            input => input.todo.priority === priority,
            badge({ priority }),
          ),
        ),
      ),
      remove: Style.compose(
        Style.class('item-remove'),
        Style.inline({
          border: '0',
          background: 'transparent',
          color: t.text.muted,
          fontSize: '1.2rem',
          lineHeight: '1',
          cursor: 'pointer',
        }),
        Style.pseudo(':hover', { color: t.error.default }),
      ),
      editor: Style.compose(
        control,
        Style.inline({
          flex: '1',
          padding: '0.3rem 0.5rem',
          border: `1px solid ${t.accent.default}`,
          background: 'transparent',
          color: 'inherit',
        }),
      ),
    },
    { name: 'ItemStyle' },
  ),
)

/**
 * The editor's keyboard interaction, attached as a Behavior rather than written
 * into the view: Escape cancels, focus lands on the field as it appears.
 */
export const EditorBehavior = Behavior.forSlots(ItemSlots)<ItemInput, BoardMessage>(
  {
    editor: Behavior.slot({
      requires: { events: [Event.KeyDown] },
      attributes: ({ input, h }) => [
        h.Autofocus(input.editing),
        h.AriaLabel(`Rename "${input.todo.title}"`),
        h.OnKeyDownPreventDefault(key =>
          key === 'Escape' ? Option.some(Message.EditingStopped({})) : Option.none(),
        ),
      ],
    }),
  },
  { name: 'EditorBehavior' },
)

/** The row's checkbox is a `@foldkit/ui` Checkbox; its contract has the slots. */
export const ToggleStyle = app(
  Style.forSlots(CheckboxSlots)(
    {
      checkbox: Style.compose(
        Style.inline({
          width: '1.5rem',
          height: '1.5rem',
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${t.outline.overt}`,
          borderRadius: '50%',
          background: 'transparent',
          color: t.accent.default,
          cursor: 'pointer',
          padding: '0',
        }),
        Style.whenInput<ItemInput>(
          input => input.todo.completed,
          Style.inline({ borderColor: t.accent.default }),
        ),
        Style.pseudo(':focus-visible', {
          outline: `2px solid ${t.outline.focus}`,
          outlineOffset: '2px',
        }),
      ),
    },
    { name: 'ToggleStyle' },
  ),
)

// --- footer ----------------------------------------------------------------------

export const FooterSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
})

export const FooterStyle = app(
  Style.forSlots(FooterSlots)(
    {
      root: Style.compose(
        Layers.standard.in('layouts', Layout.cluster({ justify: 'space-between', gap: '1rem' })),
        Style.inline({
          paddingTop: '1rem',
          borderTop: `1px solid ${t.outline.subtle}`,
          color: t.text.muted,
          fontSize: '0.85rem',
        }),
      ),
      status: Style.inline({ margin: '0' }),
    },
    { name: 'FooterStyle' },
  ),
)

export const ClearButtonStyle = app(
  Style.forSlots(ButtonSlots)(
    {
      button: Style.compose(
        Style.inline({
          border: '0',
          background: 'transparent',
          color: t.text.muted,
          font: 'inherit',
          cursor: 'pointer',
        }),
        Style.pseudo(':disabled', { opacity: '0.5', cursor: 'default' }),
        Style.pseudo(':not(:disabled):hover', { color: t.error.default }),
      ),
    },
    { name: 'ClearButtonStyle' },
  ),
)

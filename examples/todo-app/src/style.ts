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
 * - **Theme and layout**: the palette is derived from a few knobs of
 *   `Theme.make`, and rows, toolbars and the page are `Layout` pieces.
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
  type StyleValue,
} from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { Message, type Filter, type Priority, type SyncState, type Todo } from './app.js'
import type { BoardMessage } from './surface.js'

// --- theme: the shipped one ------------------------------------------------------

/**
 * Every shipped token at the shipped theme's knobs. Every color is derived in
 * the browser with relative color syntax and `light-dark()`, so the dark
 * scheme needs no override of its own.
 */
const shipped = Theme.standard()
const shippedRef = Theme.ref(shipped)

/** What only this app names, derived from the palette so it follows the scheme too. */
const own = Theme.define({
  radius: { card: '16px', control: '10px' },
  text: { done: `color-mix(in oklab, ${shippedRef.text.muted} 60%, ${shippedRef.surface.base})` },
})

export const theme = Theme.compose(shipped, own)

/** `t.accent.default` is `var(--fk-accent-default)`; a name the theme lacks is a type error. */
export const t = Theme.ref(theme)

const control: StyleValue = Style.inline({
  font: 'inherit',
  borderRadius: t.radius.control,
})

/**
 * Every slot style is born in the `app` layer, so the value a view attaches
 * is the one the sheet ships.
 */
const app = Layers.standard.layer('app')

// --- the page ------------------------------------------------------------------

/** Where the app sits in the document: at the top, centred, on the muted surface. */
export const BodyStyle: StyleValue = Layers.standard.in(
  'app',
  Style.global(
    `:where(body){margin:0;min-height:100vh;display:grid;place-items:start center;padding:4rem 1rem 0;background:${t.surface.muted}}`,
  ),
)

export const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    root: Style.compose(
      Style.class('app'),
      Layers.standard.in('layouts', Layout.stack({ gap: '1.25rem' })),
      Style.inline({
        boxSizing: 'border-box',
        width: 'min(40rem, 100%)',
        background: t.surface.base,
        color: t.text.default,
        border: `1px solid ${t.outline.subtle}`,
        boxShadow: '0 12px 40px rgb(0 0 0 / 8%)',
      }),
      // Rules, not inline declarations: `inline` sits outside every layer, so the
      // phone's media rule below could never change what it wrote.
      Style.self({ borderRadius: t.radius.card, padding: '1.75rem' }),
      Style.media('(max-width: 30rem)', { padding: '1rem', borderRadius: '0' }),
    ),
  },
  { name: 'PageStyle', layer: app },
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
  intro: Slot.make({ capability: Capability.Container }),
})

export const HeaderStyle = Style.forSlots(HeaderSlots)(
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
    intro: Style.inline({
      margin: '0',
      flexBasis: '100%',
      color: t.text.muted,
      fontSize: '0.9rem',
      lineHeight: '1.45',
    }),
  },
  { name: 'HeaderStyle', layer: app },
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

export const ComposerStyle = Style.forSlots(ComposerSlots)(
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
  { name: 'ComposerStyle', layer: app },
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

export const AddButtonStyle = Style.forSlots(ButtonSlots)(AddButton(), {
  name: 'AddButtonStyle',
  layer: app,
})

// --- filters: one slot, resolved once per filter with the filter as input --------

export interface FilterInput {
  readonly filter: Filter
  readonly active: boolean
}

export const FilterSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaPressed],
  }),
})

export const FilterStyle = Style.forSlots(FilterSlots)(
  {
    button: Style.compose(
      Style.class('filter'),
      // Rules, not inline declarations: a state written inline as a longhand
      // over an inline shorthand left a black border once it was cleared.
      Style.self({
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
        // The accent's tint and ink, with no line: the pill is one color.
        Style.self({ background: t.accent.subtle, color: t.accent.ink }),
      ),
      // Only an unchosen filter darkens on hover: the chosen one keeps its ink.
      Style.pseudo(':not([aria-pressed="true"]):hover', { color: t.text.default }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.media('(pointer: coarse)', { padding: '0.6rem 1rem' }),
    ),
  },
  { name: 'FilterStyle', layer: app },
)

/** Interaction for the same slot: the chosen filter is a pressed button, and says so. */
export const FilterBehavior = Behavior.forSlots(FilterSlots)<FilterInput, BoardMessage>(
  {
    button: Behavior.slot({
      requires: { events: [Event.Click], attributes: [Attr.AriaPressed] },
      attributes: ({ input, h }) => [h.AriaPressed(input.active ? 'true' : 'false')],
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
      display: 'inline-flex',
      alignItems: 'center',
      font: 'inherit',
      fontSize: '0.75rem',
      cursor: 'pointer',
      background: `color-mix(in srgb, currentColor 12%, transparent)`,
    }),
    // Rules, not inline declarations, so the touch rule below can change them.
    // A finger's target: the chip is as tall as one, its words centred in it.
    Style.self({ padding: '0.1rem 0.55rem', minBlockSize: '1.5rem' }),
    Style.pseudo(':focus-visible', {
      outline: `2px solid ${t.outline.focus}`,
      outlineOffset: '2px',
    }),
    Style.media('(pointer: coarse)', { minBlockSize: '2.5rem', paddingInline: '0.8rem' }),
  ),
  variants: {
    priority: {
      high: Style.inline({ color: t.warning.ink }),
      normal: Style.inline({ color: t.text.muted }),
      low: Style.inline({ color: t.info.ink }),
    },
  },
  defaults: { priority: 'normal' },
})

const priorities: ReadonlyArray<Priority> = ['high', 'normal', 'low']

export const ItemStyle = Style.forSlots(ItemSlots)(
  {
    root: Style.compose(
      Style.class('item'),
      Layers.standard.in('layouts', Layout.cluster({ gap: '0.75rem' })),
      Style.inline({
        flexWrap: 'nowrap',
        padding: '0.6rem 0',
      }),
      // A rule between rows only: the footer draws the line below the last.
      Style.pseudo(':not(:first-child)', { borderTop: `1px solid ${t.outline.subtle}` }),
      // `nest` styles a descendant from the row's own class, so hovering the
      // row reveals its delete button without the view knowing. Only where a
      // pointer can hover: on a touch screen it would never show.
      Style.at('@media (hover: hover)', Style.nest(' .item-remove', { opacity: '0' })),
      Style.pseudo(':is(:hover, :focus-within) .item-remove', { opacity: '1' }),
    ),
    // A button, so Enter renames from the keyboard as a click does.
    title: Style.compose(
      Style.inline({
        flex: '1',
        minWidth: '0',
        cursor: 'text',
        border: '0',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        padding: '0',
        textAlign: 'start',
        overflowWrap: 'anywhere',
      }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.whenInput<ItemInput>(
        input => input.todo.completed,
        Style.inline({ color: t.text.done, textDecoration: 'line-through' }),
      ),
    ),
    // The recipe picks the variant from the input, one piece per priority.
    priority: Style.compose(
      ...priorities.map(priority =>
        Style.whenInput<ItemInput>(input => input.todo.priority === priority, badge({ priority })),
      ),
    ),
    remove: Style.compose(
      Style.class('item-remove'),
      Style.inline({
        border: '0',
        background: 'transparent',
        fontSize: '1.2rem',
        lineHeight: '1',
        // Flush with the row's edge, where the footer's Clear completed ends.
        padding: '0',
        cursor: 'pointer',
      }),
      // A finger's target, however small the ×. The colour is a rule, not inline, so hover can change it.
      Style.self({ inlineSize: '1.5rem', blockSize: '1.5rem', color: t.text.muted }),
      Style.pseudo(':hover', { color: t.error.ink }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.media('(pointer: coarse)', { inlineSize: '2.75rem', blockSize: '2.75rem' }),
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
  { name: 'ItemStyle', layer: app },
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
export const ToggleStyle = Style.forSlots(CheckboxSlots)(
  {
    checkbox: Style.compose(
      // Rules, as the filters are: an inline `borderColor` over an inline
      // `border` left a black ring once a todo was marked not done.
      Style.self({
        width: '1.5rem',
        height: '1.5rem',
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${t.outline.overt}`,
        borderRadius: '50%',
        background: 'transparent',
        color: t.accent.ink,
        cursor: 'pointer',
        padding: '0',
      }),
      Style.whenInput<ItemInput>(
        input => input.todo.completed,
        Style.self({ borderColor: t.accent.default }),
      ),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.media('(pointer: coarse)', { width: '2.25rem', height: '2.25rem' }),
    ),
  },
  { name: 'ToggleStyle', layer: app },
)

// --- footer ----------------------------------------------------------------------

export const FooterSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  undo: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

export const FooterStyle = Style.forSlots(FooterSlots)(
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
    undo: Style.compose(
      Style.inline({
        border: '0',
        background: 'transparent',
        color: t.accent.ink,
        font: 'inherit',
        fontWeight: '600',
        padding: '0 0.35rem',
        cursor: 'pointer',
        textDecoration: 'underline',
      }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.media('(pointer: coarse)', { minBlockSize: '2.5rem' }),
    ),
  },
  { name: 'FooterStyle', layer: app },
)

// --- the connection strip ------------------------------------------------------------

export interface ConnectionInput {
  readonly state: SyncState
}

export const ConnectionSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  dot: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
  toggle: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const stateInk: Record<SyncState, string> = {
  synced: t.success.ink,
  saving: t.warning.ink,
  offline: t.text.muted,
  retrying: t.error.ink,
}

export const ConnectionStyle = Style.forSlots(ConnectionSlots)(
  {
    root: Style.compose(
      Layers.standard.in(
        'layouts',
        Layout.cluster({ justify: 'space-between', align: 'center', gap: '0.5rem' }),
      ),
      Style.inline({
        padding: '0.5rem 0.75rem',
        borderRadius: t.radius.control,
        background: t.surface.muted,
        fontSize: '0.85rem',
      }),
    ),
    dot: Style.compose(
      Style.inline({
        display: 'inline-block',
        inlineSize: '0.6rem',
        blockSize: '0.6rem',
        borderRadius: '50%',
        marginInlineEnd: '0.5rem',
        background: 'currentColor',
      }),
      ...(Object.keys(stateInk) as ReadonlyArray<SyncState>).map(state =>
        Style.whenInput<ConnectionInput>(
          input => input.state === state,
          Style.inline({ color: stateInk[state] }),
        ),
      ),
    ),
    text: Style.inline({ margin: '0', color: t.text.default }),
    toggle: Style.compose(
      // Rules, so hover can change the background.
      Style.self({
        border: `1px solid ${t.outline.default}`,
        borderRadius: t.radius.full,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
      }),
      Style.self({ padding: '0.2rem 0.8rem' }),
      Style.pseudo(':hover', { background: t.surface.base }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.media('(pointer: coarse)', { minBlockSize: '2.5rem', paddingInline: '1rem' }),
    ),
  },
  { name: 'ConnectionStyle', layer: app },
)

export const ClearButtonStyle = Style.forSlots(ButtonSlots)(
  {
    button: Style.compose(
      // Rules, so the disabled and hover states can change the cursor and colour.
      Style.self({
        border: '0',
        background: 'transparent',
        color: t.text.muted,
        font: 'inherit',
        padding: '0',
        cursor: 'pointer',
      }),
      Style.pseudo(':disabled', { opacity: '0.5', cursor: 'default' }),
      Style.pseudo(':not(:disabled):hover', { color: t.error.ink }),
    ),
  },
  { name: 'ClearButtonStyle', layer: app },
)

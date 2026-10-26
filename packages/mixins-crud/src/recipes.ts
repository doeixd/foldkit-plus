/**
 * Looks for this package's views over the shipped tokens, as `foldkit-mixins-ui`'s
 * `Recipes` are for its components, from `foldkit-mixins-crud/recipes`:
 * `Style.forSlots(ListSlots)(List({}))`.
 */
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ConfirmSlots, EditorSlots, ToolbarSlots } from './editor.js'
import { ListSlots, Loading } from './index.js'

const ref = Theme.ref(Theme.standard())
const component = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('components', Style.compose(...pieces))
const variant = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('variants', Style.compose(...pieces))

/** The list's own buttons (more, try again): quiet, beside the rows rather than over them. */
const quiet = Style.compose(
  Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    minBlockSize: '2rem',
    paddingInline: ref.space.md,
    border: `${ref.border.thin} solid ${ref.outline.default}`,
    borderRadius: ref.radius.md,
    background: ref.surface.base,
    color: ref.text.default,
    font: 'inherit',
    fontSize: ref.size.sm,
    fontWeight: ref.weight.medium,
    cursor: 'pointer',
  }),
  Style.pseudo(':hover:not(:disabled)', { background: ref.surface.muted }),
  Style.pseudo(':disabled', { opacity: '0.5', cursor: 'default' }),
  Style.pseudo(':focus-visible', {
    outline: `${ref.border.thick} solid ${ref.outline.focus}`,
    outlineOffset: '2px',
  }),
)

/**
 * A list as a quiet table: small uppercase headings over rows divided by a
 * line, each row lit under the pointer. `open: 'row'` (the default) stretches
 * the way into a row across it, so a press anywhere on the row opens it, as
 * the row's highlight promises; `open: 'link'` keeps it to its words, drawn as a
 * link, for a row whose other cells hold controls of their own. A list with
 * nothing in it says so in a dashed box; one still loading says so plainly,
 * and only once the wait is noticeable (`Loading.shown`).
 */
export const List = Style.recipeFor(ListSlots)({
  base: {
    table: component(
      Style.self({ borderCollapse: 'collapse', inlineSize: '100%', fontSize: ref.size.sm }),
    ),
    headCell: component(
      Style.self({
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        color: ref.text.muted,
        fontSize: ref.size.xs,
        fontWeight: ref.weight.semibold,
        letterSpacing: '0.04em',
        padding: `${ref.space.xs} ${ref.space.sm}`,
        textAlign: 'start',
        textTransform: 'uppercase',
      }),
    ),
    // A heading that sorts: the heading's own words, pressable, a finger's height.
    sort: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        minBlockSize: '1.5rem',
        padding: '0',
        border: '0',
        background: 'none',
        color: 'inherit',
        font: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        cursor: 'pointer',
      }),
      Style.pseudo(':hover', { color: ref.text.overt }),
    ),
    row: component(Style.pseudo(':hover', { background: ref.surface.muted })),
    cell: component(
      Style.self({
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        padding: `${ref.space.sm} ${ref.space.sm}`,
        verticalAlign: 'middle',
      }),
    ),
    open: component(
      Style.self({
        minBlockSize: '1.5rem',
        padding: '0',
        border: '0',
        background: 'none',
        color: ref.text.default,
        font: 'inherit',
        fontWeight: ref.weight.semibold,
        textAlign: 'start',
        cursor: 'pointer',
      }),
      Style.pseudo(':hover', { color: ref.accent.ink }),
    ),
    status: component(
      Style.self({
        margin: `${ref.space.md} 0 0`,
        padding: `${ref.space['2xl']} ${ref.space.lg}`,
        border: `${ref.border.thin} dashed ${ref.outline.default}`,
        borderRadius: ref.radius.lg,
        color: ref.text.muted,
        fontSize: ref.size.sm,
        textAlign: 'center',
      }),
      // A wait is not an empty list: no box around it.
      Style.nest('&[aria-busy="true"]', { borderColor: 'transparent' }),
      Loading.shown,
    ),
    more: component(quiet, Style.self({ marginBlockStart: ref.space.sm })),
    retry: component(quiet, Style.self({ marginInlineStart: ref.space.sm })),
  },
  variants: {
    open: {
      // The way in reaches across the row: its overlay covers the row, which holds it.
      row: {
        row: variant(Style.self({ position: 'relative' })),
        open: variant(Style.nest('&::after', { content: '""', position: 'absolute', inset: '0' })),
      },
      link: {
        open: variant(
          Style.self({
            color: ref.text.link,
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
          }),
        ),
      },
    },
  },
  defaults: { open: 'row' },
})

/** A delete's yes: the error's fill, for the one action that cannot be taken back. */
const danger = Style.compose(
  quiet,
  Style.self({
    borderColor: ref.error.default,
    background: ref.error.default,
    color: ref.surface.base,
  }),
  Style.pseudo(':hover:not(:disabled)', { background: ref.error.ink }),
)

/** A line the view says (loading, saved, a failure), muted, or in the error's ink when it is an alert. */
const said = component(
  Style.self({ margin: '0', color: ref.text.muted, fontSize: ref.size.sm }),
  Style.nest('&[role="alert"]', { color: ref.error.ink, fontWeight: ref.weight.medium }),
  Loading.shown,
)

const actions = component(
  Style.self({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: ref.space.xs }),
)

/**
 * An editor as a card: its title over what it says and its form, its actions
 * below, on the page's raised surface.
 */
export const Editor = Style.recipeFor(EditorSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gap: ref.space.md,
        padding: ref.space.lg,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: ref.surface.subtle,
      }),
    ),
    title: component(
      Style.self({
        margin: '0',
        fontSize: ref.size.lg,
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    status: said,
    actions,
    close: component(quiet),
    retry: component(quiet),
  },
})

/** A delete's question: the question, then its two answers, the yes in the error's fill. */
export const Confirm = Style.recipeFor(ConfirmSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space.sm })),
    question: component(Style.self({ margin: '0', fontWeight: ref.weight.medium })),
    status: said,
    actions,
    confirm: component(danger),
    cancel: component(quiet),
  },
})

/** A list's controls in a row that wraps: the search first and widest, the actions at the end. */
export const Toolbar = Style.recipeFor(ToolbarSlots)({
  base: {
    root: component(
      Style.self({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: ref.space.sm }),
    ),
    search: component(Style.self({ flex: '1 1 12rem', minInlineSize: '0' })),
    filters: actions,
    sort: component(Style.self({ display: 'flex', alignItems: 'center' })),
    actions: component(actions, Style.self({ marginInlineStart: 'auto' })),
  },
})

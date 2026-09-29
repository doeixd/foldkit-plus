/**
 * The mixins' own Slots as the CMS dresses them: the post and page forms, the
 * inspector's forms, and the worklist's table.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { ListSlots, Loading } from 'foldkit-mixins-crud'
import { FieldSlots, FormSlots, type FieldInput } from 'foldkit-mixins-form'
import { Layout } from 'foldkit-mixins/layout'
import { app, button, control, field, L, serif, stateBadge, t, visuallyHidden } from './style.js'

// --- the form, the worklist, and the Builder --------------------------------------

/** A field with no box, focused or not: the page itself is where one writes. */
const bare = Style.compose(
  Style.self({
    background: 'transparent',
    border: '0',
    borderRadius: '0',
    boxShadow: 'none',
    // As tall as what is written: a page does not scroll inside itself.
    fieldSizing: 'content',
    outline: 'none',
    overflow: 'hidden',
    padding: '0',
    resize: 'none',
  }),
  Style.pseudo(':focus-visible', { outline: 'none' }),
)

const keyIs =
  (...keys: ReadonlyArray<string>) =>
  (input: FieldInput) =>
    keys.includes(input.control.key)
const onKey = (keys: ReadonlyArray<string>, piece: StyleValue) =>
  Style.whenInput(keyIs(...keys), piece)

/**
 * A post's form as a page to write on: the title large, the excerpt beneath it
 * as a standfirst, the body in a serif with room to think, and the address and
 * cover set apart at the end. Each is placed by its key with `order`, since the
 * form draws its keys in the order it declares them.
 */
export const WritingFieldStyle = Style.forSlots(FieldSlots)(
  {
    root: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
      onKey(['title'], Style.self({ order: '1' })),
      onKey(['excerpt'], Style.self({ order: '2' })),
      onKey(['body'], Style.self({ marginBlockStart: t.space.md, order: '3' })),
      onKey(
        ['slug'],
        Style.self({
          borderBlockStart: `1px solid ${t.outline.subtle}`,
          marginBlockStart: t.space.xl,
          order: '4',
          paddingBlockStart: t.space.lg,
        }),
      ),
      onKey(['cover'], Style.self({ order: '5' })),
    ),
    group: Style.self({ alignItems: 'center', display: 'flex' }),
    affix: Style.self({ color: t.text.muted, paddingInlineEnd: t.space['3xs'] }),
    label: Style.compose(
      Style.self({ fontSize: t.size.sm, fontWeight: t.weight.semibold }),
      onKey(['title', 'excerpt', 'body'], visuallyHidden),
    ),
    description: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
      onKey(['title', 'excerpt', 'body'], visuallyHidden),
    ),
    error: Style.self({ color: t.error.ink, fontSize: t.size.sm, margin: '0' }),
    text: field,
    multiline: Style.compose(
      field,
      Style.self({ minHeight: '5rem', resize: 'vertical' }),
      onKey(
        ['title'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.overt,
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: t.weight.bold,
            letterSpacing: '-0.025em',
            lineHeight: '1.15',
            minHeight: '0',
          }),
        ),
      ),
      onKey(
        ['excerpt'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.muted,
            fontSize: t.size.lg,
            lineHeight: '1.5',
            minHeight: '0',
          }),
        ),
      ),
      onKey(
        ['body'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.default,
            fontFamily: serif,
            fontSize: '1.2rem',
            lineHeight: '1.8',
            minHeight: '55vh',
          }),
        ),
      ),
    ),
  },
  { name: 'WritingFieldStyle', layer: app },
)

/**
 * A page's form: its title and address side by side above the Builder, which
 * takes the whole width. The Builder's field has no label of its own: it is the
 * page.
 */
export const PageFieldStyle = Style.forSlots(FieldSlots)(
  {
    root: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['3xs'] })),
      onKey(['document'], Style.self({ gridColumn: '1 / -1', marginBlockStart: t.space.sm })),
    ),
    group: Style.self({ alignItems: 'center', display: 'flex' }),
    affix: Style.self({ color: t.text.muted, paddingInlineEnd: t.space['3xs'] }),
    label: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.xs, fontWeight: t.weight.semibold }),
      onKey(['document'], visuallyHidden),
    ),
    description: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    error: Style.self({ color: t.error.ink, fontSize: t.size.sm, margin: '0' }),
    text: Style.compose(
      field,
      onKey(['title'], Style.self({ fontSize: t.size.lg, fontWeight: t.weight.semibold })),
    ),
  },
  { name: 'PageFieldStyle', layer: app },
)

export const PageFormStyle = Style.forSlots(FormSlots)(
  {
    root: Style.compose(
      Style.self({
        alignItems: 'start',
        display: 'grid',
        gap: t.space.md,
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
      }),
      Style.media('(max-width: 52rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ),
    errors: Style.self({ color: t.error.ink, gridColumn: '1 / -1' }),
  },
  { name: 'PageFormStyle', layer: app },
)

export const FormStyle = Style.forSlots(FormSlots)(
  {
    root: L.in('layouts', Layout.stack({ gap: t.space.md })),
    errors: Style.self({ color: t.error.ink }),
    submit: Style.compose(
      button({ tone: 'accent', variant: 'solid', size: 'md' }),
      // A stack's children are full width unless they say otherwise.
      Layout.intrinsic,
    ),
  },
  { name: 'FormStyle', layer: app },
)

export const ListStyle = Style.forSlots(ListSlots)(
  {
    table: Style.self({ borderCollapse: 'collapse', fontSize: t.size.sm, width: '100%' }),
    badge: stateBadge('data-cms-state'),
    headCell: Style.self({
      borderBottom: `1px solid ${t.outline.subtle}`,
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.04em',
      padding: '0.4rem 0.5rem',
      textAlign: 'start',
      textTransform: 'uppercase',
    }),
    // The whole row opens its entry: the title's button reaches across it.
    row: Style.compose(
      Style.self({ position: 'relative' }),
      Style.pseudo(':hover', { background: t.surface.muted }),
    ),
    cell: Style.self({
      borderBottom: `1px solid ${t.outline.subtle}`,
      padding: '0.95rem 0.5rem',
      verticalAlign: 'middle',
    }),
    open: Style.compose(
      Style.self({
        background: 'none',
        border: '0',
        color: t.text.default,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: t.size.md,
        fontWeight: t.weight.semibold,
        padding: '0',
        textAlign: 'start',
      }),
      Style.nest('&::after', { content: '""', inset: '0', position: 'absolute' }),
      Style.pseudo(':hover', { color: t.accent.ink }),
    ),
    // An empty list as a block of its own rather than a stray line.
    status: Style.compose(
      Style.self({
        border: `1px dashed ${t.outline.default}`,
        borderRadius: t.radius.lg,
        color: t.text.muted,
        fontSize: t.size.sm,
        margin: `${t.space.md} 0 0`,
        padding: `${t.space['2xl']} ${t.space.lg}`,
        textAlign: 'center',
      }),
      // Loading is a wait, not an empty list: no box around it.
      Style.nest('&[aria-busy="true"]', { borderColor: 'transparent' }),
      Loading.shown,
    ),
    more: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  },
  { name: 'ListStyle', layer: app },
)

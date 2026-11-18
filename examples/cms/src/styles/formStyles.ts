/**
 * The mixins' own Slots as the CMS dresses them: the post and page forms, the
 * inspector's forms, and the worklist's table. Each form starts from the
 * package's recipe (`Field`, `Form`, `List`) and says only where it differs.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { ListSlots } from 'foldkit-mixins-crud'
import { List } from 'foldkit-mixins-crud/recipes'
import { FieldSlots, FormSlots, type FieldInput } from 'foldkit-mixins-form'
import { Field, Form } from 'foldkit-mixins-form/recipes'
import { Recipes } from 'foldkit-mixins-ui'
import { Layout } from 'foldkit-mixins/layout'
import { Prose } from 'foldkit-mixins/prose'
import { Theme } from 'foldkit-mixins/theme'
import { app, button, field, L, phone, serif, stateBadge, t, visuallyHidden } from './style.js'

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
/** One height for the page form's boxes, so the title and the address beside it line up. */
const fieldHeight = '3rem'

const onKey = (keys: ReadonlyArray<string>, piece: StyleValue) =>
  Style.whenInput(keyIs(...keys), piece)

/**
 * The address's input inside its group, borderless, the group drawing the
 * box. `Recipes.InputGroup.control` says the same in the variants layer; the
 * text slot's `field` is in `app`, which would win over it, so here it is.
 */
const inGroup = Style.compose(
  Style.self({
    background: 'transparent',
    border: '0',
    flex: '1',
    minInlineSize: '0',
    paddingInlineStart: t.space['3xs'],
  }),
  Style.pseudo(':focus-visible', { outline: 'none' }),
)

/**
 * A post's form as a page to write on: the title large, the excerpt beneath it
 * as a standfirst, the body in a serif with room to think, and the address and
 * cover set apart at the end. Each is placed by its key with `order`, since the
 * form draws its keys in the order it declares them.
 */
export const WritingFieldStyle = Style.forSlots(FieldSlots)(
  {
    ...Field({}),
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
    // The body's rich-text editor, written on as the page reads: the site's own prose
    // (`siteStyle`'s `body`), so what is written is what is read.
    control: onKey(
      ['body'],
      Style.compose(
        L.in('components', Prose.style({ measure: 'none', leading: '1.75' })),
        Style.self({
          color: t.text.default,
          fontFamily: serif,
          fontSize: '1.2rem',
          minBlockSize: '55vh',
        }),
        Style.nest('[contenteditable]', { minBlockSize: '55vh', outline: 'none' }),
        // The editor's own selection, drawn while a tool of the bar has the focus: a tint of the
        // accent over the text's own ink, so it reads in the light and the dark scheme.
        Style.nest('[data-decoration="selection"]', {
          background: `color-mix(in oklab, ${t.accent.default} 30%, transparent)`,
        }),
        // The blocks are the editable's children, a level below where the prose piece spaces them.
        Style.nest('[contenteditable] > * + *', { marginBlockStart: '1em' }),
        Style.nest('[contenteditable] > h2', { marginBlockStart: '1.6em' }),
        Style.nest('h2', { color: t.text.overt, fontSize: '1.35rem', letterSpacing: '-0.01em' }),
        Style.nest(':not(pre) > code', {
          background: t.surface.muted,
          borderRadius: t.radius.sm,
          fontFamily: t.font.mono,
          fontSize: '0.8em',
          padding: '0.1em 0.3em',
        }),
        Style.nest('pre', {
          background: t.surface.muted,
          border: `1px solid ${t.outline.subtle}`,
          borderRadius: t.radius.md,
          fontFamily: t.font.mono,
          fontSize: '0.95rem',
          padding: `${t.space.sm} ${t.space.md}`,
        }),
        // A blank document says what to write, where the placeholder option marks its block.
        Style.nest('[data-placeholder]::before', {
          color: t.text.muted,
          content: 'attr(data-placeholder)',
          pointerEvents: 'none',
          position: 'absolute',
        }),
      ),
    ),
    // An address's `/` inside the field, as one box: the recipe's pieces, as
    // tall as a text field beside it.
    group: Style.compose(Recipes.InputGroup.group, Style.self({ minBlockSize: fieldHeight })),
    label: Style.compose(
      Style.self({ fontSize: t.size.sm, fontWeight: t.weight.semibold }),
      onKey(['title', 'excerpt', 'body'], visuallyHidden),
    ),
    description: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
      onKey(['title', 'excerpt', 'body'], visuallyHidden),
    ),
    text: Style.compose(field, onKey(['slug'], inGroup)),
    multiline: Style.compose(
      field,
      Style.self({ minHeight: '5rem', resize: 'vertical' }),
      onKey(
        ['title'],
        Style.compose(
          bare,
          Style.self({
            color: t.text.overt,
            fontSize: Theme.fluidType({ min: '2rem', max: '2.75rem' }),
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
    ...Field({}),
    root: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['3xs'] })),
      onKey(['document'], Style.self({ gridColumn: '1 / -1', marginBlockStart: t.space.sm })),
    ),
    // An address's `/` inside the field, as one box: the recipe's pieces, as
    // tall as a text field beside it.
    group: Style.compose(Recipes.InputGroup.group, Style.self({ minBlockSize: fieldHeight })),
    label: Style.compose(
      Style.self({ color: t.text.muted, fontSize: t.size.xs, fontWeight: t.weight.semibold }),
      onKey(['document'], visuallyHidden),
    ),
    description: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    text: Style.compose(
      field,
      onKey(['slug'], inGroup),
      onKey(
        ['title'],
        Style.self({
          fontSize: t.size.lg,
          fontWeight: t.weight.semibold,
          minBlockSize: fieldHeight,
        }),
      ),
    ),
  },
  { name: 'PageFieldStyle', layer: app },
)

const form = Form({})

export const PageFormStyle = Style.forSlots(FormSlots)(
  {
    ...form,
    root: Style.compose(
      Style.self({
        alignItems: 'start',
        display: 'grid',
        gap: t.space.md,
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
      }),
      Style.media('(max-width: 52rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ),
    errors: Style.compose(form.errors, Style.self({ gridColumn: '1 / -1' })),
  },
  { name: 'PageFormStyle', layer: app },
)

export const FormStyle = Style.forSlots(FormSlots)(
  {
    ...form,
    root: L.in('layouts', Layout.stack({ gap: t.space.md })),
    submit: Style.compose(
      button({ tone: 'accent', variant: 'solid', size: 'md' }),
      // A stack's children are full width unless they say otherwise.
      Layout.intrinsic,
    ),
  },
  { name: 'FormStyle', layer: app },
)

// The package's list look, roomier: taller rows, and titles at body size.
export const ListStyle = Style.forSlots(ListSlots)(
  {
    ...List.extend({
      base: {
        // The button in the cell is already a finger tall, so a phone's padding is thin.
        cell: Style.compose(
          Style.self({ padding: '0.95rem 0.5rem' }),
          Style.media(phone, { paddingBlock: '0.3rem' }),
        ),
        open: { fontSize: t.size.md },
      },
    })({}),
    badge: stateBadge,
  },
  { name: 'ListStyle', layer: app },
)

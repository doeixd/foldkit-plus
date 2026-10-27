/**
 * The page's look: the demos' theme (`demoStyle`), the frame and the name box
 * from `foldkit-mixins-ui`, the rows and the rename editor from
 * `foldkit-mixins-crud/recipes`, and the forms from `foldkit-mixins-form/recipes`.
 */
import { Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { EditorSlots, Loading, RowListSlots } from 'foldkit-mixins-crud'
import { Editor, RowList } from 'foldkit-mixins-crud/recipes'
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'
import { Field, Form } from 'foldkit-mixins-form/recipes'
import { AppShellSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { demoStyle } from 'foldkit-example-site/demo-style'

const { t, L } = demoStyle

export const stylesheet = demoStyle.stylesheet

export const ShellStyle = demoStyle.forSlots(AppShellSlots)(
  Recipes.AppShell({ width: 'contained' }),
  { name: 'ShellStyle' },
)
export const RowsStyle = demoStyle.forSlots(RowListSlots)(RowList({}), { name: 'RowsStyle' })
export const EditorStyle = demoStyle.forSlots(EditorSlots)(Editor({}), { name: 'EditorStyle' })
export const FieldStyle = demoStyle.forSlots(FieldSlots)(Field({}), { name: 'TodoField' })
export const FormStyle = demoStyle.forSlots(FormSlots)(Form({}), { name: 'TodoForm' })
export const NameStyle = demoStyle.forSlots(InputSlots)(Recipes.Input({ size: 'sm' }), {
  name: 'NameStyle',
})

/** A small button beside words: the status line's dismiss, a row's delete. */
const small = (tone: 'neutral' | 'danger') =>
  Recipes.Button({ tone, variant: 'ghost', size: 'sm' }).button ?? Style.empty

export const Page = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    heading: Style.self({ margin: '0', fontSize: t.size['2xl'], color: t.text.overt }),
    lede: Style.self({ margin: '0', maxInlineSize: '38rem', color: t.text.muted }),
    actor: Style.self({
      display: 'grid',
      gap: t.space['2xs'],
      maxInlineSize: '16rem',
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
    }),
    // Its line is held from the first paint, so a save's words appearing move nothing.
    status: Style.compose(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: t.space.xs,
        margin: '0',
        minBlockSize: '1.75rem',
        fontSize: t.size.sm,
        color: t.text.muted,
      }),
      Style.nest('&[role="alert"]', { color: t.error.ink }),
      Loading.shown,
    ),
    dismiss: small('neutral'),
    done: Style.self({
      flexShrink: '0',
      inlineSize: '1.125rem',
      blockSize: '1.125rem',
      margin: '0',
      accentColor: t.accent.default,
    }),
    // The title opens the rename editor; a finger's height, across what the row leaves.
    title: Style.compose(
      Style.self({
        flex: '1',
        minInlineSize: '0',
        minBlockSize: '2.5rem',
        padding: `0 ${t.space['2xs']}`,
        border: '0',
        borderRadius: t.radius.sm,
        background: 'none',
        color: t.text.default,
        font: 'inherit',
        textAlign: 'start',
        overflowWrap: 'anywhere',
        cursor: 'pointer',
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.nest('&[data-done="true"]', { color: t.text.muted, textDecoration: 'line-through' }),
    ),
    remove: small('danger'),
  },
  { name: 'Page' },
)

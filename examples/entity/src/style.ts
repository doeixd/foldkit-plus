/**
 * The page's look: the demos' theme (`demoStyle`), the frame and controls from
 * `foldkit-mixins-ui`, the list, editor and delete question from
 * `foldkit-mixins-crud/recipes`, and the form's parts over the theme's tokens.
 */
import { Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { ConfirmSlots, EditorSlots, ListSlots, ToolbarSlots } from 'foldkit-mixins-crud'
import { Confirm, Editor, List, Toolbar } from 'foldkit-mixins-crud/recipes'
import { FieldSlots, FormSlots, type FieldInput } from 'foldkit-mixins-form'
import { AppShellSlots, CheckboxSlots, InputSlots, Recipes, SelectSlots } from 'foldkit-mixins-ui'
import { demoStyle } from 'foldkit-example-site/demo-style'

const { t, L } = demoStyle

export const stylesheet = demoStyle.stylesheet

export const ShellStyle = demoStyle.forSlots(AppShellSlots)(
  Recipes.AppShell({ width: 'contained' }),
  { name: 'ShellStyle' },
)
export const ListStyle = demoStyle.forSlots(ListSlots)(List({}), { name: 'ListStyle' })
export const EditorStyle = demoStyle.forSlots(EditorSlots)(Editor({}), { name: 'EditorStyle' })
export const ConfirmStyle = demoStyle.forSlots(ConfirmSlots)(Confirm({}), { name: 'ConfirmStyle' })
export const ToolbarStyle = demoStyle.forSlots(ToolbarSlots)(Toolbar({}), { name: 'ToolbarStyle' })
export const SearchStyle = demoStyle.forSlots(InputSlots)(Recipes.Input({}), {
  name: 'SearchStyle',
})

/** What `UiForm.renderers` draws each control with. */
export const controlStyles = {
  input: demoStyle.forSlots(InputSlots)(Recipes.Input({}), { name: 'FormInput' }),
  select: demoStyle.forSlots(SelectSlots)(Recipes.Select({}), { name: 'FormSelect' }),
  checkbox: demoStyle.forSlots(CheckboxSlots)(Recipes.Checkbox({}), { name: 'FormCheckbox' }),
}

/**
 * A field: its label over its control, then what it says about it. A grid, not
 * `Layout.stack`, whose full-width children would stretch the checkbox into a bar.
 */
export const FieldStyle = Style.forSlots(FieldSlots)(
  {
    root: L.in('layouts', Style.self({ display: 'grid', gap: t.space['2xs'] })),
    search: Recipes.Input({}).input ?? Style.empty,
    more: Style.compose(
      Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }).button ?? Style.empty,
      Style.self({ justifySelf: 'start' }),
    ),
    label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium, color: t.text.overt }),
    description: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    checking: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    error: Style.compose(
      Style.self({ margin: '0', fontSize: t.size.sm, color: t.error.ink }),
      Style.whenInput<FieldInput>(input => !input.invalid, Style.self({ display: 'none' })),
    ),
  },
  { name: 'EntityField', layer: L.layer('app') },
)

export const FormStyle = Style.forSlots(FormSlots)(
  {
    root: L.in('layouts', Layout.stack({ gap: t.space.md })),
    submit: Recipes.Button({}).button ?? Style.empty,
  },
  { name: 'EntityForm', layer: L.layer('app') },
)

export const Page = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    heading: Style.self({ margin: '0', fontSize: t.size['2xl'], color: t.text.overt }),
    hint: Style.self({ margin: '0', color: t.text.muted }),
    side: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    // The shipped button's look, on an element of the page's own that keeps its id.
    remove: Recipes.Button({ tone: 'danger', variant: 'outline' }).button ?? Style.empty,
  },
  { name: 'Page' },
)

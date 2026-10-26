/**
 * The page's look: the demos' theme (`demoStyle`), the frame and controls from
 * `foldkit-mixins-ui`, the list, editor and delete question from
 * `foldkit-mixins-crud/recipes`, and the form's from `foldkit-mixins-form/recipes`.
 */
import { Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { ConfirmSlots, EditorSlots, ListSlots, ToolbarSlots } from 'foldkit-mixins-crud'
import { Confirm, Editor, List, Toolbar } from 'foldkit-mixins-crud/recipes'
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'
import { Field, Form } from 'foldkit-mixins-form/recipes'
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

export const FieldStyle = demoStyle.forSlots(FieldSlots)(Field({}), { name: 'EntityField' })
export const FormStyle = demoStyle.forSlots(FormSlots)(Form({}), { name: 'EntityForm' })

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

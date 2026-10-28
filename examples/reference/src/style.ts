/**
 * The look: the shipped theme (`AppStyle.make({})`), the shipped recipes for
 * the frame, the controls and the forms, and a few Slots of the page's own
 * for what no component draws.
 */
import { Style } from 'foldkit-plus/mixins'
import { AppStyle } from 'foldkit-plus/mixins/app'
import { Layout } from 'foldkit-plus/mixins/layout'
import { FieldSlots, FormSlots } from 'foldkit-plus/mixins-form'
import { Field, Form } from 'foldkit-plus/mixins-form/recipes'
import {
  AlertSlots,
  AppShellSlots,
  ButtonSlots,
  CardSlots,
  InputSlots,
  PasswordInputSlots,
  Recipes,
} from 'foldkit-plus/mixins-ui'

export const { t, L, slots, forSlots, stylesheet } = AppStyle.make({})

export const ShellStyle = forSlots(AppShellSlots)(Recipes.AppShell({ width: 'contained' }), {
  name: 'Shell',
})
export const CardStyle = forSlots(CardSlots)(Recipes.Card({}), { name: 'NoteCard' })
export const InputStyle = forSlots(InputSlots)(Recipes.Input({}), { name: 'Input' })
export const PasswordStyle = forSlots(PasswordInputSlots)(Recipes.PasswordInput({}), {
  name: 'Password',
})
export const PrimaryStyle = forSlots(ButtonSlots)(Recipes.Button({}), { name: 'Primary' })
export const QuietStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
  { name: 'Quiet' },
)
export const DangerStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', variant: 'outline' }),
  { name: 'Danger' },
)
export const NoticeStyle = forSlots(AlertSlots)(Recipes.Alert({ tone: 'error' }), {
  name: 'Notice',
})
export const FieldStyle = forSlots(FieldSlots)(Field({}), { name: 'Field' })
export const FormStyle = forSlots(FormSlots)(Form({}), { name: 'Form' })

export const Page = slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    heading: Style.self({ margin: '0', fontSize: t.size['2xl'], color: t.text.overt }),
    nav: L.in('layouts', Layout.cluster({ gap: t.space.md, align: 'center' })),
    link: Style.self({ color: t.text.link, fontWeight: t.weight.medium }),
    status: Style.self({ margin: '0', color: t.text.muted }),
    form: L.in('layouts', Layout.stack({ gap: t.space.md })),
    field: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium, color: t.text.overt }),
    notes: Style.compose(
      Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
    ),
    note: L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'baseline' })),
    byline: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    body: Style.self({ margin: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }),
    actions: L.in('layouts', Layout.cluster({ gap: t.space.sm })),
  },
  { name: 'Page' },
)

/**
 * The page's look: the demos' theme (`demoStyle`), the shipped recipes for the
 * frame and every control, and a few Slots of the page's own for what no
 * component draws, such as the line that says who this tab is.
 */
import { Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { Utilities as U } from 'foldkit-mixins/utilities'
import {
  AlertSlots,
  AppShellSlots,
  BadgeSlots,
  ButtonSlots,
  CardSlots,
  InputSlots,
  PasswordInputSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { demoStyle } from 'foldkit-example-site/demo-style'

const { t, L } = demoStyle

/** The foundations `vite.config.ts` writes into the served page, so its first paint is styled. */
export const stylesheet = demoStyle.stylesheet

export const ShellStyle = demoStyle.forSlots(AppShellSlots)(
  Recipes.AppShell({ width: 'contained' }),
  { name: 'ShellStyle' },
)
export const CardStyle = demoStyle.forSlots(CardSlots)(Recipes.Card({}), { name: 'CardStyle' })
export const FieldStyle = demoStyle.forSlots(InputSlots)(Recipes.Input({}), { name: 'FieldStyle' })
export const PasswordStyle = demoStyle.forSlots(PasswordInputSlots)(Recipes.PasswordInput({}), {
  name: 'PasswordStyle',
})
export const PrimaryButtonStyle = demoStyle.forSlots(ButtonSlots)(Recipes.Button({}), {
  name: 'PrimaryButtonStyle',
})
export const QuietButtonStyle = demoStyle.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
  { name: 'QuietButtonStyle' },
)
export const NoticeStyle = demoStyle.forSlots(AlertSlots)(Recipes.Alert({ tone: 'error' }), {
  name: 'NoticeStyle',
})
/** One style for every badge: its tone comes from the word it carries. */
export const BadgeStyle = demoStyle.forSlots(BadgeSlots)(
  Recipes.Badge({ attribute: 'data-tone', tones: { member: 'success', admin: 'info' } }),
  { name: 'BadgeStyle' },
)

export const Page = demoStyle.slots(
  {
    content: L.in('layouts', Layout.stack({ gap: t.space.lg })),
    heading: [U.m('0'), U.font('bold'), U.color('text.overt'), { fontSize: t.size['2xl'] }],
    links: L.in('layouts', Layout.cluster({ gap: t.space.md })),
    link: [U.font('medium'), { color: t.text.link }],
    form: L.in('layouts', Layout.stack({ gap: t.space.md })),
    field: L.in('layouts', Layout.stack({ gap: t.space['2xs'] })),
    label: [U.text('sm'), U.font('medium'), U.color('text.overt')],
    who: [
      U.m('0'),
      U.color('text.default'),
      Style.nest('&[data-failed]', { color: t.error.default, fontWeight: t.weight.medium }),
    ],
    account: L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' })),
    status: [U.m('0'), U.color('text.muted')],
    notes: [
      U.m('0'),
      { paddingInlineStart: t.space.lg },
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
    ],
  },
  { name: 'Page' },
)

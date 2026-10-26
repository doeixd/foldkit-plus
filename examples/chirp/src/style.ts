/**
 * Chirp's look, as `foldkit-mixins` data: one theme, the page's own slots, and
 * the shipped recipes the components draw with. `AppStyle` compiles every
 * style into the `app` layer, the last of the standard order, so these
 * override the recipes by layer order rather than by specificity.
 */
import { Capability, Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'
import { AvatarSlots, ButtonSlots, CardSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'

// #region theme
export const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  theme: Theme.make({ accent: { hue: 265, chroma: 0.21, lightness: 62 } }),
})
// #endregion

const rule = `${t.border.thin} solid ${t.outline.subtle}`

/** A link in the nav: the text's own colour, the current page marked. */
const navLink = Style.slot({ capability: Capability.Focusable }, [
  U.p('sm'),
  U.rounded('md'),
  U.color('text.muted'),
  U.font('medium'),
  { textDecoration: 'none' },
  Style.pseudo(':hover', { color: t.text.overt, background: t.surface.subtle }),
  Style.states({ page: { color: t.text.overt, fontWeight: '700' } }, 'aria-current'),
])

export const ChirpPage = slots(
  {
    page: [U.bg('surface.base'), U.color('text.default'), { minHeight: '100vh' }],
    frame: [
      {
        display: 'grid',
        gridTemplateColumns: 'minmax(12rem, 16rem) minmax(0, 38rem)',
        justifyContent: 'center',
        gap: t.space.xl,
        padding: `0 ${t.space.lg}`,
      },
      Style.media('(max-width: 48rem)', { gridTemplateColumns: 'minmax(0, 1fr)', gap: '0' }),
    ],
    nav: [
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      { position: 'sticky', top: '0', alignSelf: 'start', paddingBlock: t.space.lg },
      Style.media('(max-width: 48rem)', { position: 'static', borderBottom: rule }),
    ],
    brand: [U.text('xl'), U.font('bold'), U.color('text.overt'), { paddingBlock: t.space.sm }],
    navLink,
    who: [U.text('sm'), U.color('text.muted'), { marginTop: t.space.lg }],
    people: [L.in('layouts', Layout.cluster({ gap: t.space.xs }))],
    main: [{ borderInline: rule, minHeight: '100vh' }],
    header: [
      U.text('lg'),
      U.font('bold'),
      U.color('text.overt'),
      { padding: t.space.md, borderBottom: rule, margin: '0' },
    ],
    section: [U.p('md'), { borderBottom: rule }],
    feed: [L.in('layouts', Layout.stack({ gap: t.space.sm })), U.p('md')],
    post: [L.in('layouts', Layout.stack({ gap: t.space.xs }))],
    actions: [L.in('layouts', Layout.cluster({ gap: t.space.xs }))],
    note: [U.text('sm'), U.color('text.muted'), { margin: '0' }],
    link: Style.slot({ capability: Capability.Focusable }, [
      U.color('text.overt'),
      U.font('semibold'),
    ]),
  },
  { name: 'ChirpPage' },
)

export const CardStyle = forSlots(CardSlots)(Recipes.Card({ surface: 'outlined' }), {
  name: 'ChirpCard',
})
export const AvatarStyle = forSlots(AvatarSlots)(Recipes.Avatar({ color: 'name' }), {
  name: 'ChirpAvatar',
})
export const LikeStyle = forSlots(ButtonSlots)(Recipes.Button({ variant: 'ghost', size: 'sm' }), {
  name: 'ChirpLike',
})
export const QuietButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button({ variant: 'outline', tone: 'neutral', size: 'sm' }),
  { name: 'ChirpQuietButton' },
)

/** A form's field: its label quiet above the control, its error under it. */
export const FieldStyle = forSlots(FieldSlots)(
  {
    root: [L.in('layouts', Layout.stack({ gap: t.space.xs }))],
    label: [U.text('sm'), U.color('text.muted')],
    error: [U.text('sm'), { color: t.error.default }],
  },
  { name: 'ChirpField' },
)

/** A form: its fields, then the submit at the end of the row. */
export const FormStyle = forSlots(FormSlots)(
  {
    root: [L.in('layouts', Layout.stack({ gap: t.space.sm }))],
    submit: [
      U.font('semibold'),
      U.rounded('full'),
      {
        alignSelf: 'flex-end',
        width: 'fit-content',
        border: '0',
        cursor: 'pointer',
        padding: `${t.space.xs} ${t.space.lg}`,
        background: t.accent.default,
        color: t.accent['on-fill'],
      },
      Style.pseudo(':disabled', { opacity: '0.5', cursor: 'default' }),
    ],
  },
  { name: 'ChirpForm' },
)

export const TextareaStyle = forSlots(TextareaSlots)(Recipes.Textarea({}), {
  name: 'ChirpTextarea',
})

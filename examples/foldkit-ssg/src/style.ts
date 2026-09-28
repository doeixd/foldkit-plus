/**
 * The example's appearance, as `foldkit-mixins` data. `main.ts` draws the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the `Layout` pieces by layer order rather
 * than by specificity.
 */
import { Capability, Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'

/**
 * A colorless, near-black accent, so the button is black on white like
 * upstream's. `colorScheme: 'light'` keeps the page white in a dark browser,
 * as upstream's is.
 */
const { t, L, slots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 0, c: 0, l: '12%' } }),
  colorScheme: 'light',
})

export { stylesheet }

// PAGE

export const PageStyle = slots(
  {
    // Upstream's `mx-auto grid min-h-screen max-w-3xl content-center gap-10 p-8`.
    page: [
      L.in('layouts', Layout.stack({ gap: t.space['2xl'] })),
      U.mx('auto'),
      U.justify('center'),
      U.p('xl'),
      { boxSizing: 'border-box', maxWidth: '48rem', minHeight: '100vh' },
    ],
    nav: L.in('layouts', Layout.cluster({ gap: t.space.md })),
    navLink: { color: 'inherit', textDecoration: 'underline' },
    section: L.in('layouts', Layout.stack({ gap: t.space.md })),
    heading: [U.m('0'), U.text('4xl'), U.font('bold'), U.color('text.overt')],
    text: U.m('0'),
    button: Style.slot({ capability: Capability.Focusable }, [
      U.bg('accent.default'),
      U.color('accent.on-fill'),
      U.pointer,
      {
        width: 'fit-content',
        padding: `${t.space.xs} ${t.space.md}`,
        border: '0',
        font: 'inherit',
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
    ]),
  },
  { name: 'PageStyle' },
)

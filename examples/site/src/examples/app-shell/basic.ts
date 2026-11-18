import {
  AppShell,
  AppShellSlots,
  Badge,
  BadgeSlots,
  Button,
  ButtonSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Live = forSlots(BadgeSlots)(Recipes.Badge())
const Quiet = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// The page's frame, with no state and no Message: a skip link, the header (the
// banner) with its status and actions, the main region and the footer. Shown
// in a box here; on a page it is the whole window, and its header stays in view.
export default example({
  title: 'Header, main and footer',
  slots: AppShellSlots,
  recipe: Recipes.AppShell,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ blockSize: '22rem', overflow: 'auto', inlineSize: 'min(100%, 40rem)' })],
      [
        AppShell.view(
          {
            title: 'Acme',
            status: [Badge.view({ text: 'Live', tone: 'live', style: Live }, h)],
            actions: [Button.view({ label: 'Sign out', style: Quiet }, h)],
            footer: [h.span([], ['Acme, 2026'])],
            main: [h.h2([], ['Orders']), h.p([], ['Nothing is waiting for you.'])],
            style,
          },
          h,
        ),
      ],
    ),
})

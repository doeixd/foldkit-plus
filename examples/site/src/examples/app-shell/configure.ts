import { AppShell, AppShellSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Contained = Recipes.AppShell.style({ width: 'contained' })

// Every page's frame said once: the look and the skip link's words. A page
// passes only what is its own, its title and content.
const Frame = AppShell.configure({
  base: { style: Contained, words: { skip: 'Go to the content' } },
})

export default example({
  title: 'Configure once',
  slots: AppShellSlots,
  recipe: Recipes.AppShell,
  view: ({ h }) =>
    h.div(
      [h.Style({ blockSize: '22rem', overflow: 'auto', inlineSize: 'min(100%, 40rem)' })],
      [
        Frame.view(
          {
            title: 'Settings',
            main: [h.h2([], ['Account']), h.p([], ['Your name and email.'])],
          },
          h,
        ),
      ],
    ),
})

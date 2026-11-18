import { AppShell, AppShellSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SECTIONS = ['Install', 'Your first page', 'Styling', 'Deploying']

// `aside` is a column at the main region's end, an `aside` landmark named by
// `asideLabel`: here the page's contents. Below the theme's `md` breakpoint it
// follows the main region.
export default example({
  title: 'A column at the end',
  slots: AppShellSlots,
  recipe: Recipes.AppShell,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ blockSize: '22rem', overflow: 'auto', inlineSize: 'min(100%, 40rem)' })],
      [
        AppShell.view(
          {
            title: 'Guide',
            main: [
              h.h2([], ['Getting started']),
              ...SECTIONS.map(section => h.p([], [`${section}: a few words on it.`])),
            ],
            aside: [
              h.ul(
                [h.Style({ margin: '0', paddingInlineStart: '1rem' })],
                SECTIONS.map(section => h.li([], [section])),
              ),
            ],
            asideLabel: 'On this page',
            style,
          },
          h,
        ),
      ],
    ),
})

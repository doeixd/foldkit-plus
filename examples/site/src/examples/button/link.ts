import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Quiet = forSlots(ButtonSlots)(Recipes.Button({ variant: 'link' }))

// `href` draws an anchor in place of the button, with the same look: it has
// no `type` and no click, and `external` opens a new tab and says so aloud.
// `variant: 'link'` is the look of a link in running text.
export default example({
  title: 'As a link',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  view: ({ style, h }) =>
    row(h, [
      Button.view({ label: 'Read the guide', href: '#link', style }, h),
      Button.view(
        { label: 'Open the repository', href: 'https://example.com', external: true, style },
        h,
      ),
      Button.view({ label: 'Not available yet', href: '#link', disabled: true, style }, h),
      Button.view({ label: 'Release notes', href: '#link', style: Quiet }, h),
    ]),
})

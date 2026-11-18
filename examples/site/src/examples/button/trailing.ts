import { Button, ButtonSlots, Kbd, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { row } from '../../snippets/layout.js'

// `trailing` draws after the label: a chevron, a count, a shortcut. It is
// read as drawn, so the decorative chevron carries its own `aria-hidden`.
export default example({
  title: 'Trailing content',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  view: ({ style, h }) =>
    row(h, [
      Button.view(
        {
          label: 'Continue',
          trailing: h.span([h.AriaHidden(true)], [outline(h, 'M6 4l4 4-4 4')]),
          style,
        },
        h,
      ),
      Button.view({ label: 'Stars', trailing: h.span([], ['1,240']), style }, h),
      Button.view({ label: 'Search', trailing: Kbd.combo({ keys: ['⌘', 'K'] }, h), style }, h),
    ]),
})

import { Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { icons } from '../../view/iconData.js'

// An icon is data (here from `icons.json`, built by the icons plugin). With a
// `label` it is an image that has a name; without one it is ornament and a
// screen reader skips it. Two copies of one icon on a page need a `key`.
export default example({
  title: 'Named and decorative',
  slots: IconSlots,
  recipe: Recipes.Icon,
  view: ({ style, h }) =>
    row(h, [
      Icon.view({ icon: icons.check, label: 'Saved', style }, h),
      Icon.view({ icon: icons.link, label: 'Linked', key: 'link', style }, h),
      h.span([], ['Copy ', Icon.view({ icon: icons.copy, key: 'copy', style }, h)]),
    ]),
})

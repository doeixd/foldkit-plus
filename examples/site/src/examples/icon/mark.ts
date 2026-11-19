import { Badge, Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { icons } from '../../view/iconData.js'

const Count = Recipes.Badge.style({ appearance: 'solid', size: 'sm' })

// A `mark` sits on the corner of the box. It is inside the image, so what it
// means goes into the `label` too.
export default example({
  title: 'A corner mark',
  slots: IconSlots,
  recipe: Recipes.Icon,
  pins: { surface: 'outline', tone: 'neutral', size: 'lg' },
  view: ({ style, h }) =>
    Icon.view(
      {
        icon: icons.link,
        label: 'Links, 3 broken',
        mark: Badge.view({ text: '3', tone: 'danger', style: Count }, h),
        style,
      },
      h,
    ),
})

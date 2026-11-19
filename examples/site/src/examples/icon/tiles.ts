import { Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { icons } from '../../view/iconData.js'

const Surfaces = (['outline', 'soft', 'solid', 'raised'] as const).map(surface =>
  Recipes.Icon.style({ surface, tone: 'accent', size: 'lg' }),
)

// A `surface` makes the box a tile around the icon, twice its size; `tone`
// inks the icon and colours the tile. Pick a surface and a tone above.
export default example({
  title: 'Tiles',
  slots: IconSlots,
  recipe: Recipes.Icon,
  pins: { surface: 'soft', size: 'lg' },
  view: ({ style, h }) =>
    row(h, [
      Icon.view({ icon: icons.check, key: 'tile', label: 'Saved', style }, h),
      ...Surfaces.map((tile, index) =>
        Icon.view({ icon: icons.link, key: `surface-${index}`, style: tile }, h),
      ),
    ]),
})

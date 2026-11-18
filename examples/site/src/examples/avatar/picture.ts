import { Schema } from 'effect'
import { ImageAsset, Provider } from 'foldkit-media'
import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'

const asset = Schema.decodeUnknownSync(ImageAsset)({
  key: 'ada.jpg',
  width: 512,
  height: 512,
  alpha: false,
  hash: null,
  placeholder: null,
})

// Where the variants live: here, one file at each width the avatar may ask for.
const provider = Provider.fromFiles(
  [40, 80, 160].map(width => ({ width, format: 'webp' as const, url: portrait(width) })),
  { sources: [], fallback: 'webp' },
)

// `picture` is a value: `Avatar.picture` brings `foldkit-media` with it, so a
// page that passes `src` as text never ships it. It asks the provider for the
// widths that cover a 2.5rem avatar at 1x and 2x.
export default example({
  title: 'A picture from foldkit-media',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    Avatar.view(
      {
        name: 'Ada Lovelace',
        picture: Avatar.picture({ asset, provider, width: Avatar.widthOf('md') }),
        style,
      },
      h,
    ),
})

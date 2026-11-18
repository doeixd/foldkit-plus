import { Option } from 'effect'
import {
  Avatar,
  AvatarSlots,
  Bundles,
  FileUpload,
  FileUploadSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'lg' }))

// `picture` draws the picker's face from the first file's image, here with
// the Avatar the application already has. No list is drawn.
export default example({
  title: 'Avatar',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'avatar' },
  state: Bundles.FileUpload.with({ id: 'photo', accept: ['image/*'], maxSize: 2_000_000 }),
  view: ({ style, model, onMessage, h }) =>
    FileUpload.view(
      {
        model,
        onMessage,
        label: 'Change photo',
        picture: url =>
          Avatar.view(
            {
              name: 'Ada Lovelace',
              ...Option.match(url, { onNone: () => ({}), onSome: src => ({ src }) }),
              style: Face,
            },
            h,
          ),
        style,
      },
      h,
    ),
})

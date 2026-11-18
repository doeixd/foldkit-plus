import { Bundles, Card, CardSlots, FileUpload, FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Panel = forSlots(CardSlots)(Recipes.Card({}))

// Composition is nesting: the field is the card's content.
export default example({
  title: 'In a card',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'zone' },
  state: Bundles.FileUpload.with({ id: 'attachments', multiple: true }),
  view: ({ style, model, onMessage, h }) =>
    Card.view(
      {
        title: 'Attachments',
        description: 'Anything the reviewer should see beside the request.',
        content: FileUpload.view(
          { model, onMessage, label: 'browse', words: { prompt: 'Drop files here or' }, style },
          h,
        ),
        style: Panel,
      },
      h,
    ),
})

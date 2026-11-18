import { Item, ItemSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { t } from '../../snippets/theme.js'

// A status mark in the success colour as the media, a title, a time, and a
// line of content at the end.
export default example({
  title: 'Basic',
  slots: ItemSlots,
  recipe: Recipes.Item,
  view: ({ style, h }) =>
    Item.view(
      {
        media: h.span(
          [
            h.AriaHidden(true),
            h.Style({
              display: 'block',
              inlineSize: '0.5rem',
              blockSize: '0.5rem',
              borderRadius: '50%',
              background: t.success.default,
            }),
          ],
          [],
        ),
        title: 'Deploy finished',
        description: '2 minutes ago',
        content: h.span([], ['Production is live.']),
        style,
      },
      h,
    ),
})

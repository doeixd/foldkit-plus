import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, ButtonGroup, ButtonGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Square = Recipes.Button.style({ tone: 'neutral', variant: 'outline', shape: 'square' })

const pages = 12
const Model = Schema.Struct({ page: Schema.Number })
const Message = defineMessageUnion({ ChosePage: { page: Schema.Number } })

// A page count between two steps, drawn in the `text` box. The page is the
// Model's; each step is disabled at its end.
export default example({
  title: 'Pagination',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  state: {
    Model,
    Message,
    init: () => ({ model: { page: 3 } }),
    update: (model, { page }) => ({
      model: page === model.page ? model : { page: Math.min(pages, Math.max(1, page)) },
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    ButtonGroup.view(
      {
        label: 'Pages',
        items: [
          Button.view(
            {
              label: 'Previous page',
              icon: outline(h, 'M10 4L6 8l4 4'),
              disabled: model.page <= 1,
              onClick: onMessage(Message.ChosePage({ page: model.page - 1 })),
              style: Square,
            },
            h,
          ),
          `Page ${model.page} of ${pages}`,
          Button.view(
            {
              label: 'Next page',
              icon: outline(h, 'M6 4l4 4-4 4'),
              disabled: model.page >= pages,
              onClick: onMessage(Message.ChosePage({ page: model.page + 1 })),
              style: Square,
            },
            h,
          ),
        ],
        style,
      },
      h,
    ),
})

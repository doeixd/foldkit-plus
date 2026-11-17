import type { NamedStyle } from 'foldkit-mixins'
import { RatingSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'
import type { Live } from '../showcase.js'

const ratingBasic = <Message>(style: NamedStyle<typeof RatingSlots>, live: Live<Message>) =>
  Snippet.rating(
    style,
    live.widgets.stay,
    value => live.onWidget(Widgets.Message.RatedStay({ value })),
    live.h,
  )

export const showcase = fromRecipe(
  about('rating'),
  RatingSlots,
  Recipes.Rating,
  ratingBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: ratingBasic },
    {
      name: 'half',
      title: 'Half stars, cleared by a second press',
      draw: (style, live) =>
        Snippet.ratingHalf(
          style,
          live.widgets.film,
          value => live.onWidget(Widgets.Message.RatedFilm({ value })),
          () => live.onWidget(Widgets.Message.ClearedFilm()),
          live.h,
        ),
    },
    {
      name: 'fraction',
      title: 'A read-only average',
      draw: style => Snippet.ratingFraction(style, inert),
    },
    {
      name: 'hearts',
      title: 'Hearts',
      draw: (style, live) =>
        Snippet.ratingHearts(
          style,
          live.widgets.hearts,
          value => live.onWidget(Widgets.Message.RatedHearts({ value })),
          live.h,
        ),
      pins: { glyph: 'heart', tone: 'error', size: 'lg' },
    },
    {
      name: 'labels',
      title: 'A word per value',
      draw: (style, live) =>
        Snippet.ratingLabels(
          style,
          live.widgets.support,
          value => live.onWidget(Widgets.Message.RatedSupport({ value })),
          live.h,
        ),
    },
  ],
)

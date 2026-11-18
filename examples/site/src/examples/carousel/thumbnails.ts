import { Bundles, Carousel, CarouselSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const shots = ['Dunes', 'Coast', 'Ridge', 'Valley', 'Delta']

// A small copy of each slide in place of the dots; the one shown is ringed.
export default example({
  title: 'Thumbnails',
  slots: CarouselSlots,
  recipe: Recipes.Carousel,
  state: Bundles.Carousel.with({ id: 'car-thumbs', count: shots.length }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        Carousel.view(
          {
            label: 'Places',
            model,
            onMessage,
            slides: shots.map(place =>
              h.div(
                [
                  h.Style({
                    display: 'grid',
                    placeItems: 'center',
                    blockSize: '10rem',
                    background: 'color-mix(in oklab, currentColor 8%, transparent)',
                  }),
                ],
                [place],
              ),
            ),
            thumbnails: shots.map(place =>
              h.span(
                [h.Style({ display: 'grid', placeItems: 'center', fontSize: '0.625rem' })],
                [place],
              ),
            ),
            style,
          },
          h,
        ),
      ],
    ),
})

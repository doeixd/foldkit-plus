import { Bundles, Carousel, CarouselSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const shots = ['Dunes', 'Coast', 'Ridge', 'Valley', 'Delta']

// Moves on every four seconds, the current dot filling as it waits. A pointer
// on it pauses it, focus from the keys stops it, and the button in its corner,
// first in the tab order, stops and starts it.
export default example({
  title: 'Autoplay',
  slots: CarouselSlots,
  recipe: Recipes.Carousel,
  state: Bundles.Carousel.with({ id: 'car-auto', count: shots.length, loop: true, autoplay: true }),
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
            style,
          },
          h,
        ),
      ],
    ),
})

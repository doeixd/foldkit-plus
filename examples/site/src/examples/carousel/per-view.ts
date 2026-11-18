import { Bundles, Carousel, CarouselSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const shots = ['Dunes', 'Coast', 'Ridge', 'Valley', 'Delta']

// Two slides at once, a dot per place the track can rest: four for five slides.
// `perView` is an arg, so the Bundle and the view agree on it without being told twice.
export default example({
  title: 'Two per view',
  slots: CarouselSlots,
  recipe: Recipes.Carousel,
  pins: { peek: 'none' },
  state: Bundles.Carousel.with({ id: 'car-two', count: shots.length, perView: 2 }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(32rem, 100%)' })],
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

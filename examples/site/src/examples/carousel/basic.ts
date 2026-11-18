import { Bundles, Carousel, CarouselSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const places = ['Dunes', 'Coast', 'Ridge', 'Valley']

// The slide shown is the Bundle's Model. The layout (how many slides, how many
// at once, looping) is its args, kept in the Model, so `update` and the view
// read it from one place; the Bundle hears a swipe settle as well as the buttons.
export default example({
  title: 'Basic',
  slots: CarouselSlots,
  recipe: Recipes.Carousel,
  state: Bundles.Carousel.with({ id: 'car-basic', count: places.length }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        Carousel.view(
          {
            label: 'Places',
            model,
            onMessage,
            slides: places.map(place =>
              h.div(
                [
                  h.Style({
                    display: 'grid',
                    placeItems: 'center',
                    blockSize: '10rem',
                    // A fill, not a border: the slide rounds its corners by clipping.
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

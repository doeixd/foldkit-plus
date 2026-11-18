import { Bundles, Carousel, CarouselSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const shots = ['Dunes', 'Coast', 'Ridge']

// What every carousel of an application starts from: its words, said once (here
// in French). `words` merge key by key, so a use may change one and keep the rest.
const AppCarousel = Carousel.configure({
  base: {
    words: {
      slide: 'Diapositive {index} sur {count}',
      previous: 'Précédente',
      next: 'Suivante',
      picker: 'Choisir une diapositive',
    },
  },
})

export default example({
  title: 'Configure once',
  slots: CarouselSlots,
  recipe: Recipes.Carousel,
  state: Bundles.Carousel.with({ id: 'car-conf', count: shots.length }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        AppCarousel.view(
          {
            label: 'Lieux',
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

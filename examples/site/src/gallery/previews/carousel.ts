import { CarouselSlots, Recipes } from 'foldkit-mixins-ui'
import autoplay from '../../examples/carousel/autoplay.js'
import basic from '../../examples/carousel/basic.js'
import configure from '../../examples/carousel/configure.js'
import perView from '../../examples/carousel/per-view.js'
import thumbnails from '../../examples/carousel/thumbnails.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('carousel'),
  CarouselSlots,
  Recipes.Carousel,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'autoplay', example: autoplay },
    { name: 'thumbnails', example: thumbnails },
    { name: 'per-view', example: perView },
    { name: 'configure', example: configure },
  ],
)

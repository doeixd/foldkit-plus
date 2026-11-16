import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { CarouselSlots, Recipes, type Carousel } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const carouselAt =
  (
    example: Widgets.CarouselExample,
    draw: <Message>(
      style: NamedStyle<typeof CarouselSlots>,
      model: Carousel.Model,
      onMessage: (message: Carousel.Message) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) =>
  <Message>(style: NamedStyle<typeof CarouselSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.carousels[example],
      message => live.onWidget(Widgets.Message.GotCarousel({ example, message })),
      live.h,
    )

export const showcase = fromRecipe(
  about('carousel'),
  CarouselSlots,
  Recipes.Carousel,
  carouselAt('places', Snippet.carousel),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: carouselAt('places', Snippet.carousel) },
    {
      name: 'autoplay',
      title: 'Autoplay',
      draw: carouselAt('autoplay', Snippet.carouselAutoplay),
    },
    {
      name: 'thumbnails',
      title: 'Thumbnails',
      draw: carouselAt('thumbnails', Snippet.carouselThumbnails),
    },
    {
      name: 'per-view',
      title: 'Two per view',
      draw: carouselAt('perView', Snippet.carouselPerView),
      pins: { peek: 'none' },
    },
  ],
)

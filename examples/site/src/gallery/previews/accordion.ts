import type { NamedStyle } from 'foldkit-mixins'
import { AccordionSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const accordionBasic = <Message>(style: NamedStyle<typeof AccordionSlots>, live: Live<Message>) =>
  Snippet.accordion(
    style,
    live.widgets.faq,
    id => live.onWidget(Widgets.Message.ToggledFaq({ id })),
    live.h,
  )

export const showcase = fromRecipe(
  about('accordion'),
  AccordionSlots,
  Recipes.Accordion,
  accordionBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: accordionBasic },
    {
      name: 'plus',
      title: 'Cards with a plus',
      pins: { variant: 'separated', indicator: 'plus', indicatorPosition: 'start' },
      draw: (style, live) =>
        Snippet.accordionPlus(
          style,
          live.widgets.faqPlus,
          id => live.onWidget(Widgets.Message.ToggledFaqPlus({ id })),
          live.h,
        ),
    },
    {
      name: 'active',
      title: 'Ghost, the open one tinted',
      pins: { variant: 'ghost', separators: 'off', active: 'item' },
      draw: (style, live) =>
        Snippet.accordionActive(
          style,
          live.widgets.faqActive,
          id => live.onWidget(Widgets.Message.ToggledFaqActive({ id })),
          live.h,
        ),
    },
  ],
)

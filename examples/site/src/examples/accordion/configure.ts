import { Accordion, AccordionSlots, Bundles, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Cards = Recipes.Accordion.style({
  variant: 'separated',
  indicator: 'plus',
  indicatorPosition: 'start',
})

// What every accordion of an application starts from: its look and its
// heading level, said once. Which sections open stays the Bundle's.
const AppAccordion = Accordion.configure({
  base: { style: Cards, headingLevel: 4 },
  presets: { page: { headingLevel: 2 } },
})

export default example({
  title: 'Configure once',
  slots: AccordionSlots,
  recipe: Recipes.Accordion,
  state: Bundles.Accordion.with({ open: ['one'], multiple: true }),
  view: ({ model, onMessage, h }) =>
    AppAccordion.view(
      {
        id: 'acc-configure',
        preset: 'page',
        items: [
          { id: 'one', title: 'One look', content: 'Every accordion draws as cards.' },
          { id: 'two', title: 'Many sections', content: 'Open as many as you like.' },
        ],
        ...Accordion.controls(model, onMessage),
      },
      h,
    ),
})

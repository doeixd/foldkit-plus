import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, SliderSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const sliderBasic = <Message>(style: NamedStyle<typeof SliderSlots>, live: Live<Message>) =>
  Snippet.slider(
    style,
    { volume: live.widgets.volume, price: live.widgets.priceRange },
    {
      onVolume: value => live.onWidget(Widgets.Message.TurnedVolume({ value })),
      onPrice: value => live.onWidget(Widgets.Message.MovedPriceRange({ value })),
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('slider'),
  SliderSlots,
  Recipes.Slider,
  sliderBasic,
  undefined,
  [
    { name: 'basic', title: 'A number and a range', draw: sliderBasic },
    {
      name: 'commit',
      title: 'Saved on release',
      draw: (style, live) =>
        Snippet.sliderCommit(
          style,
          live.widgets.fields.brightness,
          {
            onChange: value => fields(live, Fields.Message.MovedBrightness({ value })),
            onCommit: value => fields(live, Fields.Message.CommittedBrightness({ value })),
          },
          live.h,
        ),
    },
    {
      name: 'vertical',
      title: 'Vertical',
      draw: (style, live) =>
        Snippet.sliderVertical(
          style,
          live.widgets.level,
          value => live.onWidget(Widgets.Message.TurnedLevel({ value })),
          live.h,
        ),
    },
    {
      name: 'marks',
      title: 'Marks and ticks',
      pins: { value: 'end' },
      draw: (style, live) =>
        Snippet.sliderMarks(
          style,
          live.widgets.budget,
          value => live.onWidget(Widgets.Message.MovedBudget({ value })),
          live.h,
        ),
    },
  ],
)

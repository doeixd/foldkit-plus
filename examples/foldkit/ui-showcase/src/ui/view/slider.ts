import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Slider as UiSlider } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Slider } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { DemoSliderStyle, SliderPageSlots, SliderPageStyle } from '../style/slider.js'

type Slots = SlotBuilders<typeof SliderPageSlots, UiMessage>

const ratingFormatted = (value: number): string => `${value} of 10`
const volumeFormatted = (value: number): string => `${Math.round(value * 100)}%`

type SliderDemo = Readonly<{
  slider: UiSlider.Model
  value: number
  label: string
  shownValue: string
  formatValue: (value: number) => string
  orientation: UiSlider.Orientation
  toParentMessage: (message: UiSlider.Message) => UiMessage
}>

const sliderDemo = (demo: SliderDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.submodel({
    slotId: demo.slider.id,
    model: demo.slider,
    view: UiSlider.view,
    viewInputs: {
      value: demo.value,
      formatValue: demo.formatValue,
      orientation: demo.orientation,
      toView: render => {
        const slider = Slider.resolve(render, [DemoSliderStyle.mixin], { input: undefined, h })

        return h.div(slots.row.attrs(), [
          h.div(slots.header.attrs(), [
            h.label(slider.label, [demo.label]),
            h.span(slots.value.attrs(), [demo.shownValue]),
          ]),
          h.div(slider.root, [
            h.div(slider.track, [h.div(slider.filledTrack)]),
            h.div(slider.thumb),
          ]),
        ])
      },
    },
    toParentMessage: demo.toParentMessage,
  })

const SliderPage = SlotView.forMessages<UiMessage>()
  .define(SliderPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Slider']),

      h.h3(slots.section.attrs(), ['Horizontal']),
      sliderDemo(
        {
          slider: model.sliderRatingDemo,
          value: model.sliderRatingValue,
          label: 'Rating',
          shownValue: ratingFormatted(model.sliderRatingValue),
          formatValue: value => `${value} of 10`,
          orientation: 'Horizontal',
          toParentMessage: message => UiMessage.GotSliderRatingDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Vertical']),
      sliderDemo(
        {
          slider: model.sliderVolumeDemo,
          value: model.sliderVolumeValue,
          label: 'Volume',
          shownValue: volumeFormatted(model.sliderVolumeValue),
          formatValue: value => `${Math.round(value * 100)} percent`,
          orientation: 'Vertical',
          toParentMessage: message => UiMessage.GotSliderVolumeDemoMessage({ message }),
        },
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(SliderPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(SliderPage)

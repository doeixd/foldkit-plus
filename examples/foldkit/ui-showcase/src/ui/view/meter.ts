import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Meter } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import type { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { MeterPageSlots, MeterPageStyle } from '../style/meter.js'

type Slots = SlotBuilders<typeof MeterPageSlots, UiMessage>

type MeterDemo = Readonly<{
  config: Omit<Meter.ViewConfig<UiMessage>, 'toView'>
  label: string
  shownValue: string
  tone: 'success' | 'warning'
}>

/** No `foldkit-mixins-ui` adapter covers a Meter, so its bundles take the page's Slots. */
const meterDemo = (demo: MeterDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  Meter.view(
    {
      ...demo.config,
      toView: ({ meter, label, fill }) =>
        h.div(slots.row.attrs(), [
          h.div(slots.header.attrs(), [
            h.span(slots.label.attrs(label), [demo.label]),
            h.span(slots.value.attrs(), [demo.shownValue]),
          ]),
          h.div(slots.track.attrs(meter), [
            h.div(slots.bar.attrs([...fill, h.DataAttribute('tone', demo.tone)])),
          ]),
        ]),
    },
    h,
  )

const MeterPage = SlotView.forMessages<UiMessage>()
  .define(MeterPageSlots, (_model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Meter']),
      h.h3(slots.section.attrs(), ['Scalar value']),
      meterDemo(
        {
          config: { id: 'health-meter', value: 75, valueText: '75 of 100 health' },
          label: 'Health',
          shownValue: '75 / 100',
          tone: 'success',
        },
        slots,
        h,
      ),
      h.h3(slots.section.attrs(), ['Thresholds']),
      meterDemo(
        {
          config: {
            id: 'storage-meter',
            value: 82,
            low: 30,
            high: 80,
            optimum: 20,
            valueText: '82 percent used',
          },
          label: 'Storage',
          shownValue: '82%',
          tone: 'warning',
        },
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(MeterPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(MeterPage)

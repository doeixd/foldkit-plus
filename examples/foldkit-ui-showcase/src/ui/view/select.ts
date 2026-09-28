import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Select as UiSelect } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Select } from 'foldkit-mixins-ui'

import * as Icon from '../../icon.js'
import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { DemoSelectStyle, SelectPageSlots, SelectPageStyle } from '../style/select.js'

type Slots = SlotBuilders<typeof SelectPageSlots, UiMessage>

const countries: ReadonlyArray<readonly [value: string, label: string]> = [
  ['us', 'United States'],
  ['ca', 'Canada'],
  ['gb', 'United Kingdom'],
  ['au', 'Australia'],
]

const countryField = (
  attributes: UiSelect.SelectAttributes<UiMessage>,
  description: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const field = Select.resolve(attributes, [DemoSelectStyle.mixin], { input: undefined, h })

  return h.div(slots.field.attrs(), [
    h.label(field.label, ['Country']),
    h.div(slots.selectFrame.attrs(), [
      h.select(
        field.select,
        countries.map(([value, label]) => h.option(slots.option.attrs([h.Value(value)]), [label])),
      ),
      h.span(slots.chevron.attrs(), [Icon.chevronDown(slots.chevronIcon.attrs(), h)]),
    ]),
    h.span(field.description, [description]),
  ])
}

const SelectPage = SlotView.forMessages<UiMessage>()
  .define(SelectPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Select']),

      h.h3(slots.section.attrs(), ['Basic']),
      h.div(slots.demo.attrs(), [
        UiSelect.view(
          {
            id: 'select-basic-demo',
            value: model.selectDemoValue,
            hasDescription: true,
            onChange: value => UiMessage.UpdatedSelectDemoValue({ value }),
            toView: attributes => countryField(attributes, 'Where you currently reside.', slots, h),
          },
          h,
        ),
      ]),

      h.h3(slots.section.attrs(), ['Disabled']),
      h.div(slots.demo.attrs(), [
        UiSelect.view(
          {
            id: 'select-disabled-demo',
            isDisabled: true,
            hasDescription: true,
            value: 'us',
            toView: attributes => countryField(attributes, 'This select is disabled.', slots, h),
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(SelectPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(SelectPage)

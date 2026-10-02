import { Submodel } from 'foldkit'

import { Progress } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'

import type { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { ProgressPageSlots, ProgressPageStyle } from '../style/progress.js'

/** No `foldkit-mixins-ui` adapter covers Progress, so its bundles take the page's Slots. */
const ProgressPage = SlotView.forMessages<UiMessage>()
  .define(ProgressPageSlots, (_model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Progress']),
      h.h3(slots.section.attrs(), ['Determinate']),
      Progress.view(
        {
          id: 'upload-progress',
          value: 42,
          valueText: '42 percent',
          toView: ({ progress, label, track, indicator }) =>
            h.div(slots.row.attrs(), [
              h.div(slots.header.attrs(), [
                h.span(slots.label.attrs(label), ['Upload']),
                h.span(slots.value.attrs(), ['42%']),
              ]),
              h.div(slots.track.attrs(progress), [
                h.div(slots.fill.attrs(track), [h.div(slots.bar.attrs(indicator))]),
              ]),
            ]),
        },
        h,
      ),
      h.h3(slots.section.attrs(), ['Indeterminate']),
      // No `value`: the bar has no fill to report, only that work is under way.
      Progress.view(
        {
          id: 'sync-progress',
          valueText: 'Syncing files',
          toView: ({ progress, label, indicator }) =>
            h.div(slots.row.attrs(), [
              h.span(slots.label.attrs(label), ['Syncing']),
              h.div(slots.track.attrs(progress), [h.div(slots.bar.attrs(indicator))]),
            ]),
        },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(ProgressPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(ProgressPage)

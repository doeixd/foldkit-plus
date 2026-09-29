import { Submodel } from 'foldkit'
import { SlotView, Style } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { AddEntryButtonStyle, StepPart } from '../../style.js'
import * as Entry from './entry/index.js'
import { Message, type Model } from './workHistory.js'

export const WorkHistoryView = SlotView.forMessages<Message>()
  .define(StepPart.slots, (model: Model, slots, h) =>
    h.div(slots.step.attrs(), [
      h.p(slots.intro.attrs(), [
        'Add your relevant work experience, starting with the most recent.',
      ]),
      h.div(
        slots.entries.attrs(),
        model.entries.map(entry =>
          h.submodel({
            slotId: entry.id,
            model: entry,
            view: Entry.view,
            toParentMessage: message => Message.GotEntryMessage({ entryId: entry.id, message }),
          }),
        ),
      ),
      Button.view(
        { label: '+ Add Position', style: AddEntryButtonStyle, onClick: Message.ClickedAddEntry() },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(StepPart.style))

export const view = Submodel.defineView<Model, Message>(WorkHistoryView)

import { Submodel } from 'foldkit'
import type { CalendarDate } from 'foldkit/calendar'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'

import { AddEntryButtonStyle, StepSlots, StepStyle } from '../../style.js'
import { Button } from '../../view/index.js'
import { Message, type Model } from './education.js'
import * as Entry from './entry/index.js'

const lazyEntry = createKeyedLazy()

const entryView = (entry: Entry.Model, today: CalendarDate, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: entry.id,
    model: entry,
    view: Entry.view,
    viewInputs: { today },
    toParentMessage: message => Message.GotEntryMessage({ entryId: entry.id, message }),
  })

export const EducationView = SlotView.forMessages<Message>()
  .define(StepSlots, (model: Model, slots, h) =>
    h.div(slots.step.attrs(), [
      h.p(slots.intro.attrs(), ['Add your educational background.']),
      h.div(
        slots.entries.attrs(),
        model.entries.map(entry => lazyEntry(entry.id, entryView, [entry, model.today, h])),
      ),
      Button.view(
        {
          label: '+ Add Education',
          style: AddEntryButtonStyle,
          onClick: Message.ClickedAddEntry(),
        },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(StepStyle))

export const view = Submodel.defineView<Model, Message>(EducationView)

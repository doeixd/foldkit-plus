import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import type { Session } from '../../../domain/session.js'
import { DashboardPart } from '../../../style.js'
import type { Message } from '../message.js'

type Slots = SlotBuilders<typeof DashboardPart.slots, Message>

const statCard = (title: string, value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.stat.attrs(), [
    h.h2(slots.statTitle.attrs(), [title]),
    h.p(slots.statValue.attrs(), [value]),
  ])

export const view = SlotView.forMessages<Message>()
  .define(DashboardPart.slots, (session: Session, slots, h) =>
    h.div(slots.content.attrs(), [
      h.h1(slots.heading.attrs(), [`Welcome back, ${session.name}!`]),
      h.p(slots.lead.attrs(), ['Here is your dashboard.']),
      h.div(slots.stats.attrs(), [
        statCard('Total Sessions', '42', slots, h),
        statCard('Active Projects', '7', slots, h),
        statCard('Tasks Completed', '128', slots, h),
      ]),
    ]),
  )
  .pipe(Style.attach(DashboardPart.style))

import * as UiButton from '@foldkit/ui/button'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import type { Session } from '../../../domain/session.js'
import { SettingsPart, SignOutButtonStyle } from '../../../style.js'
import { Message } from '../message.js'

// VIEW

type Slots = SlotBuilders<typeof SettingsPart.slots, Message>

const infoRow = (label: string, value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.row.attrs(), [
    h.p(slots.rowLabel.attrs(), [label]),
    h.p(slots.rowValue.attrs(), [value]),
  ])

export const view = SlotView.forMessages<Message>()
  .define(SettingsPart.slots, (session: Session, slots, h) =>
    h.div(slots.content.attrs(), [
      h.h1(slots.heading.attrs(), ['Settings']),
      h.div(slots.card.attrs(), [
        h.h2(slots.cardTitle.attrs(), ['Account Information']),
        h.div(slots.rows.attrs(), [
          infoRow('User ID', session.userId, slots, h),
          infoRow('Email', session.email, slots, h),
          infoRow('Name', session.name, slots, h),
        ]),
      ]),
      h.div(slots.card.attrs(), [
        h.h2(slots.cardTitle.attrs(), ['Actions']),
        UiButton.view(
          {
            onClick: Message.ClickedLogout(),
            toView: attributes =>
              h.button(
                Button.resolve<undefined, Message>(attributes, [SignOutButtonStyle.mixin], {
                  input: undefined,
                  h,
                }).button,
                ['Sign Out'],
              ),
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(SettingsPart.style))

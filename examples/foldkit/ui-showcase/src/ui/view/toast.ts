import { Option } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { EntryHandlers } from '@foldkit/ui/toast'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import * as Icon from '../../icon.js'
import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { ToastPageSlots, ToastPageStyle } from '../style/toast.js'
import { Toast } from '../toast.js'

type Entry = typeof Toast.Entry.Type

type Slots = SlotBuilders<typeof ToastPageSlots, UiMessage>

/** The text a swipe does not start from, so it can be selected. */
const swipeIgnored = (text: string, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.span(slots.swipeIgnore.attrs([h.DataAttribute('toast-swipe-ignore', '')]), [text])

/** The entry's colors follow its variant, which its `data-variant` carries to the Style. */
const renderToastEntry = (
  entry: Entry,
  handlers: EntryHandlers,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  h.div(slots.toast.attrs([h.DataAttribute('variant', entry.variant)]), [
    h.p(slots.toastTitle.attrs(), [swipeIgnored(entry.payload.title, slots, h)]),
    ...Option.match(entry.payload.maybeDescription, {
      onNone: () => [],
      onSome: description => [
        h.p(slots.toastDescription.attrs(), [swipeIgnored(description, slots, h)]),
      ],
    }),
    h.button(slots.dismissButton.attrs(handlers.dismiss), [
      Icon.xMark(slots.dismissIcon.attrs(), h),
    ]),
  ])

const demoButton = (
  label: string,
  message: UiMessage,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => h.button(slots.demoButton.attrs([h.OnClick(message)]), [label])

const ToastPage = SlotView.forMessages<UiMessage>()
  .define(ToastPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Toast']),
      h.p(slots.intro.attrs(), [
        'A stack of transient notifications that auto-dismiss. Hover over a toast to pause its timer.',
      ]),

      h.h3(slots.section.attrs(), ['Variants']),
      h.div(slots.buttons.attrs(), [
        demoButton('Info', UiMessage.ClickedShowInfoToast(), slots, h),
        demoButton('Success', UiMessage.ClickedShowSuccessToast(), slots, h),
        demoButton('Warning', UiMessage.ClickedShowWarningToast(), slots, h),
        demoButton('Error', UiMessage.ClickedShowErrorToast(), slots, h),
      ]),

      h.h3(slots.section.attrs(), ['Sticky']),
      h.p(slots.intro.attrs(), [
        'Pass ',
        h.span(slots.code.attrs(), ['sticky: true']),
        ' to skip the auto-dismiss timer. The user must close it manually.',
      ]),
      h.div(slots.buttons.attrs(), [
        demoButton('Show sticky toast', UiMessage.ClickedShowStickyToast(), slots, h),
        demoButton('Dismiss all', UiMessage.ClickedDismissAllToasts(), slots, h),
      ]),

      h.submodel({
        slotId: model.toastDemo.id,
        model: model.toastDemo,
        view: Toast.view,
        viewInputs: {
          position: 'BottomRight',
          entryToView: (entry, handlers) => renderToastEntry(entry, handlers, slots, h),
        },
        toParentMessage: message => UiMessage.GotToastDemoMessage({ message }),
      }),
    ]),
  )
  .pipe(Style.attach(ToastPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(ToastPage)

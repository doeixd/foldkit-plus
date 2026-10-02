import { Option } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Combobox, Dialog as UiDialog } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/combobox'
import { SlotView, Style, type NamedStyle, type SlotBuilders } from 'foldkit-mixins'
import { Dialog, type DialogSlots } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { City, UiModel } from '../model.js'
import {
  AnimatedDialogStyle,
  ConfirmDialogStyle,
  DemoDialogStyle,
  DialogPageSlots,
  DialogPageStyle,
} from '../style/dialog.js'
import { CityCombobox, comboboxInputs } from './combobox.js'

const OVERLAY_COMBOBOX_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 8,
  padding: 8,
  portal: false,
}

type Slots = SlotBuilders<typeof DialogPageSlots, UiMessage>

type Resolved = ReturnType<typeof Dialog.resolve<undefined, UiMessage>>

// PANEL CONTENT

const trigger = (
  label: string,
  message: UiMessage,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  h.div(slots.triggers.attrs(), [h.button(slots.trigger.attrs([h.OnClick(message)]), [label])])

const confirmContent = (dialog: Resolved, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.content.attrs(), [
    h.h2(dialog.title, ['Confirm Action']),
    h.p(dialog.description, [
      'Are you sure you want to proceed? This action demonstrates the Dialog component with focus trapping, backdrop click, and Escape key handling.',
    ]),
    h.div(slots.actions.attrs(), [
      h.button(slots.cancelButton.attrs(dialog.closeButton), ['Cancel']),
      h.button(slots.confirmButton.attrs(dialog.closeButton), ['Confirm']),
    ]),
  ])

const editFiltersContent = (
  dialog: Resolved,
  comboboxModel: Combobox.Model,
  maybeSelectedCity: Option.Option<City>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  h.h2(dialog.title, ['Edit filters']),
  h.p(dialog.description, [
    'With portal: false, the combobox panel stays inside the dialog instead of rendering behind it.',
  ]),
  h.submodel({
    slotId: comboboxModel.id,
    model: comboboxModel,
    view: CityCombobox.view,
    viewInputs: {
      ...comboboxInputs(
        {
          inputValue: comboboxModel.inputValue,
          restingInputValue: Option.getOrElse(maybeSelectedCity, () => ''),
          anchor: OVERLAY_COMBOBOX_ANCHOR,
          wrapper: slots.fieldCombobox,
        },
        slots,
        h,
      ),
      maybeSelectedValue: maybeSelectedCity,
    },
    toParentMessage: message => UiMessage.GotOverlayComboboxDemoMessage({ message }),
  }),
]

const projectSettingsContent = (
  dialog: Resolved,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  h.h2(dialog.title, ['Project settings']),
  h.p(dialog.description, [
    'Deleting the project removes all of its data. The confirmation opens as a second dialog stacked on top of this one.',
  ]),
  h.div(slots.actions.attrs(), [
    h.button(slots.cancelButton.attrs(dialog.closeButton), ['Close']),
    h.button(slots.dangerButton.attrs([h.OnClick(UiMessage.ClickedDeleteProject())]), [
      'Delete project',
    ]),
  ]),
]

const deleteProjectContent = (
  dialog: Resolved,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  h.h2(dialog.title, ['Delete project?']),
  h.p(dialog.description, [
    'This permanently deletes the project and cannot be undone. Escape closes this confirmation first, then the settings dialog.',
  ]),
  h.div(slots.actions.attrs(), [
    h.button(slots.cancelButton.attrs(dialog.closeButton), ['Cancel']),
    h.button(slots.dangerButton.attrs(dialog.closeButton), ['Delete']),
  ]),
]

// DEMOS

type DialogDemo = Readonly<{
  dialog: UiDialog.Model
  style: NamedStyle<typeof DialogSlots>
  /** Drawn only while the dialog is open. */
  content: (dialog: Resolved) => ReadonlyArray<Html>
  toParentMessage: (message: UiDialog.Message) => UiMessage
}>

/** A native `<dialog>` holding a backdrop and a panel while it is open. */
const dialogDemo = (demo: DialogDemo, h: HtmlBuilder<UiMessage>): Html =>
  h.submodel({
    slotId: demo.dialog.id,
    model: demo.dialog,
    view: UiDialog.view,
    viewInputs: {
      hasDescription: true,
      toView: render => {
        const dialog = Dialog.resolve(render, [demo.style.mixin], { input: undefined, h })

        return h.dialog(
          dialog.dialog,
          dialog.isVisible
            ? [h.div(dialog.backdrop), h.div(dialog.panel, demo.content(dialog))]
            : [],
        )
      },
    },
    toParentMessage: demo.toParentMessage,
  })

// VIEW

const DialogPage = SlotView.forMessages<UiMessage>()
  .define(DialogPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Dialog']),

      h.h3(slots.section.attrs(), ['Basic']),
      trigger('Open Dialog', UiMessage.ClickedOpenDialog(), slots, h),
      dialogDemo(
        {
          dialog: model.dialogDemo,
          style: DemoDialogStyle,
          content: dialog => [confirmContent(dialog, slots, h)],
          toParentMessage: message => UiMessage.GotDialogDemoMessage({ message }),
        },
        h,
      ),

      h.h3(slots.section.attrs(), ['Animated']),
      trigger('Open Animated Dialog', UiMessage.ClickedOpenAnimatedDialog(), slots, h),
      dialogDemo(
        {
          dialog: model.dialogAnimatedDemo,
          style: AnimatedDialogStyle,
          content: dialog => [confirmContent(dialog, slots, h)],
          toParentMessage: message => UiMessage.GotDialogAnimatedDemoMessage({ message }),
        },
        h,
      ),

      h.h3(slots.section.attrs(), ['Field']),
      h.div(slots.demo.attrs(), [
        trigger('Edit filters', UiMessage.ClickedEditFilters(), slots, h),
        dialogDemo(
          {
            dialog: model.overlayDialogDemo,
            style: DemoDialogStyle,
            content: dialog =>
              editFiltersContent(
                dialog,
                model.overlayComboboxDemo,
                model.maybeOverlayComboboxDemoSelectedCity,
                slots,
                h,
              ),
            toParentMessage: message => UiMessage.GotOverlayDialogDemoMessage({ message }),
          },
          h,
        ),
      ]),

      h.h3(slots.section.attrs(), ['Stacked']),
      h.div(slots.demo.attrs(), [
        trigger('Open project settings', UiMessage.ClickedOpenProjectSettings(), slots, h),
        dialogDemo(
          {
            dialog: model.nestedDialogParentDemo,
            style: DemoDialogStyle,
            content: dialog => projectSettingsContent(dialog, slots, h),
            toParentMessage: message => UiMessage.GotNestedDialogParentDemoMessage({ message }),
          },
          h,
        ),
        dialogDemo(
          {
            dialog: model.nestedDialogChildDemo,
            style: ConfirmDialogStyle,
            content: dialog => deleteProjectContent(dialog, slots, h),
            toParentMessage: message => UiMessage.GotNestedDialogChildDemoMessage({ message }),
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(DialogPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(DialogPage)

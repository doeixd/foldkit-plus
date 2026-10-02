import * as UiButton from '@foldkit/ui/button'
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'
import { Button, Dialog as DialogAdapter } from 'foldkit-mixins-ui'

import { Dialog } from '@foldkit/ui'

import { Message } from '../message.js'
import { DangerButtonStyle, DialogContentPart, DialogStyle } from '../style.js'

const define = SlotView.forMessages<Message>().define

// SUBMODEL CONTENT

// What each Dialog draws, a view of its own, so a test can draw it without a
// runtime: `h.submodel` needs one.

/** The export error: its message and Dismiss. */
export const ErrorDialogContent = define(
  DialogContentPart.slots,
  (
    input: Readonly<{ render: Dialog.RenderInfo; maybeExportError: Option.Option<string> }>,
    _,
    h,
  ) => {
    const dialog = DialogAdapter.resolve<undefined, Message>(input.render, [DialogStyle.mixin], {
      input: undefined,
      h,
    })
    return h.dialog(
      dialog.dialog,
      dialog.isVisible
        ? [
            h.div(dialog.backdrop, []),
            h.div(
              dialog.panel,
              Option.match(input.maybeExportError, {
                onNone: () => [],
                onSome: error => [
                  h.h2([...dialog.title, h.DataAttribute('tone', 'error')], ['Export Failed']),
                  h.p(dialog.description, [error]),
                  h.button(dialog.closeButton, ['Dismiss']),
                ],
              }),
            ),
          ]
        : [],
    )
  },
).pipe(Style.attach(DialogContentPart.style))

/** The grid size change: what it clears, Cancel, and Clear and Resize. */
export const GridSizeConfirmDialogContent = define(
  DialogContentPart.slots,
  (
    input: Readonly<{ render: Dialog.RenderInfo; maybePendingGridSize: Option.Option<number> }>,
    slots,
    h,
  ) => {
    const dialog = DialogAdapter.resolve<undefined, Message>(input.render, [DialogStyle.mixin], {
      input: undefined,
      h,
    })
    return h.dialog(
      dialog.dialog,
      dialog.isVisible
        ? [
            h.div(dialog.backdrop, []),
            h.div(
              dialog.panel,
              Option.match(input.maybePendingGridSize, {
                onNone: () => [],
                onSome: pendingSize => [
                  h.h2(dialog.title, [`Change to ${pendingSize}×${pendingSize}?`]),
                  h.p(dialog.description, ['This will clear your canvas and reset undo history.']),
                  h.div(slots.actions.attrs(), [
                    h.button(dialog.closeButton, ['Cancel']),
                    UiButton.view(
                      {
                        onClick: Message.ConfirmedGridSizeChange(),
                        toView: attributes =>
                          h.button(
                            Button.resolve<undefined, Message>(
                              attributes,
                              [DangerButtonStyle.mixin],
                              { input: undefined, h },
                            ).button,
                            ['Clear and Resize'],
                          ),
                      },
                      h,
                    ),
                  ]),
                ],
              }),
            ),
          ]
        : [],
    )
  },
).pipe(Style.attach(DialogContentPart.style))

// SUBMODEL

export type ErrorDialogInput = Readonly<{
  errorDialog: Dialog.Model
  maybeExportError: Option.Option<string>
}>

export const errorDialogView = (input: ErrorDialogInput, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: input.errorDialog.id,
    model: input.errorDialog,
    view: Dialog.view,
    viewInputs: {
      hasDescription: true,
      toView: render => ErrorDialogContent({ render, maybeExportError: input.maybeExportError }, h),
    },
    toParentMessage: message => Message.GotErrorDialogMessage({ message }),
  })

export type GridSizeConfirmDialogInput = Readonly<{
  gridSizeConfirmDialog: Dialog.Model
  maybePendingGridSize: Option.Option<number>
}>

export const gridSizeConfirmDialogView = (
  input: GridSizeConfirmDialogInput,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: input.gridSizeConfirmDialog.id,
    model: input.gridSizeConfirmDialog,
    view: Dialog.view,
    viewInputs: {
      hasDescription: true,
      toView: render =>
        GridSizeConfirmDialogContent(
          { render, maybePendingGridSize: input.maybePendingGridSize },
          h,
        ),
    },
    toParentMessage: message => Message.GotGridSizeConfirmDialogMessage({ message }),
  })

import * as UiButton from '@foldkit/ui/button'
import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { VISIBLE_HISTORY_COUNT } from '../constant.js'
import { Message } from '../message.js'
import type { Grid } from '../model.js'
import { type PaletteTheme, resolveColor } from '../palette.js'
import { HistoryPart, ShortcutButtonStyle } from '../style.js'

type Slots = SlotBuilders<typeof HistoryPart.slots, Message>

export type HistoryPanelInput = Readonly<{
  /** The undo steps, oldest first. */
  past: ReadonlyArray<Grid>
  /** The redo steps, the next one first. */
  future: ReadonlyArray<Grid>
  /** The grid the Current entry shows. */
  shownGrid: Grid
  gridSize: number
  theme: PaletteTheme
}>

const historyButton = (
  config: Readonly<{ onClick: Message; isDisabled: boolean; label: string; shortcut: string }>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  UiButton.view(
    {
      onClick: config.onClick,
      isDisabled: config.isDisabled,
      toView: attributes =>
        h.button(
          Button.resolve<undefined, Message>(attributes, [ShortcutButtonStyle.mixin], {
            input: undefined,
            h,
          }).button,
          [
            h.span(slots.buttonText.attrs(), [config.label]),
            h.span(slots.shortcut.attrs(), [config.shortcut]),
          ],
        ),
    },
    h,
  )

const thumbnailEntry = (
  grid: Grid,
  gridSize: number,
  label: string,
  maybeOnClick: Option.Option<Message>,
  theme: PaletteTheme,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    slots.entry.attrs([
      h.DataAttribute('entry', Option.isSome(maybeOnClick) ? 'Step' : 'Current'),
      ...Option.match(maybeOnClick, {
        onNone: () => [],
        onSome: clickMessage => [
          h.OnClick(clickMessage),
          h.OnKeyDownPreventDefault(key =>
            key === 'Enter' || key === ' ' ? Option.some(clickMessage) : Option.none(),
          ),
          h.Role('button'),
          h.Tabindex(0),
        ],
      }),
    ]),
    [
      h.div(
        slots.thumbnail.attrs([h.Style({ '--grid-size': String(gridSize) })]),
        Array.flatMap(grid, row =>
          Array.map(row, cell =>
            h.div(slots.pixel.attrs([h.Style({ '--pixel-color': resolveColor(cell, theme) })])),
          ),
        ),
      ),
      h.span(slots.entryLabel.attrs(), [label]),
    ],
  )

/** Undo, Redo, and a thumbnail per step: the redo steps above the current grid, the undo steps below. */
export const HistoryPanel = SlotView.forMessages<Message>()
  .define(HistoryPart.slots, (input: HistoryPanelInput, slots, h) => {
    const { past, future, shownGrid, gridSize, theme } = input
    const undoCount = past.length
    const redoCount = future.length
    const visibleUndoEntries = Array.takeRight(past, VISIBLE_HISTORY_COUNT)
    const hiddenUndoCount = undoCount - visibleUndoEntries.length

    return h.div(slots.panel.attrs(), [
      h.div(slots.label.attrs(), ['History']),
      h.div(slots.controls.attrs(), [
        historyButton(
          {
            onClick: Message.ClickedUndo(),
            isDisabled: undoCount === 0,
            label: 'Undo',
            shortcut: '⌘Z',
          },
          slots,
          h,
        ),
        historyButton(
          {
            onClick: Message.ClickedRedo(),
            isDisabled: redoCount === 0,
            label: 'Redo',
            shortcut: '⌘⇧Z',
          },
          slots,
          h,
        ),
      ]),
      h.div(slots.entries.attrs(), [
        // The farthest redo step first, so the list reads in time from the top.
        ...Array.map(Array.reverse(future), (entryGrid, index) => {
          const stepIndex = redoCount - 1 - index
          return thumbnailEntry(
            entryGrid,
            gridSize,
            `Forward ${stepIndex + 1}`,
            Option.some(Message.ClickedRedoStep({ stepIndex })),
            theme,
            slots,
            h,
          )
        }),
        thumbnailEntry(shownGrid, gridSize, 'Current', Option.none(), theme, slots, h),
        ...Array.map(Array.reverse(visibleUndoEntries), (entryGrid, index) =>
          thumbnailEntry(
            entryGrid,
            gridSize,
            `Back ${index + 1}`,
            Option.some(Message.ClickedHistoryStep({ stepIndex: undoCount - 1 - index })),
            theme,
            slots,
            h,
          ),
        ),
        ...(hiddenUndoCount > 0 ? [h.div(slots.more.attrs(), [`${hiddenUndoCount} more…`])] : []),
      ]),
    ])
  })
  .pipe(Style.attach(HistoryPart.style))

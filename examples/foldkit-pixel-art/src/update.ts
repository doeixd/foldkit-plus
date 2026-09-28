import { Array, Match, Option } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'
import { History, type HistoryModel } from 'foldkit-primitives/state'

import { Dialog, Listbox, RadioGroup } from '@foldkit/ui'

import { ExportPng } from './command.js'
import { DEFAULT_COLOR_INDEX, MAX_HISTORY } from './constant.js'
import {
  createEmptyGrid,
  erasePixels,
  floodFill,
  getMirroredPositions,
  isGridEmpty,
  setPixels,
} from './grid.js'
import { Message } from './message.js'
import {
  type Grid,
  type Model,
  type PaletteIndex,
  type Tool,
  paletteIndexFromValue,
} from './model.js'
import { PALETTE_THEMES } from './palette.js'
import {
  GridSizeRadioGroup,
  PaletteRadioGroup,
  ThemeListbox,
  ToolRadioGroup,
} from './view/toolbar.js'

type UpdateReturn = Update.Return<Model, Message>

const withUpdateReturn = Match.withReturnType<UpdateReturn>()

// HISTORY

/** The group a brush or eraser stroke pushes under, so the whole stroke is one undo step. */
const STROKE = 'Stroke'

/** A step of its own: a fill, a clear, or the first cell of a stroke. */
const record = (model: Model, grid: Grid): HistoryModel<Grid> =>
  History.push(model.history, grid, { capacity: MAX_HISTORY })

/**
 * The first cell of a stroke. Closing first makes it a new step even when the
 * last stroke's release never arrived (the button let go outside the window).
 */
const startStroke = (model: Model, grid: Grid): HistoryModel<Grid> =>
  History.push(History.close(model.history), grid, { capacity: MAX_HISTORY, group: STROKE })

/** A later cell of the stroke: joins its step. */
const continueStroke = (model: Model, grid: Grid): HistoryModel<Grid> =>
  History.push(model.history, grid, { capacity: MAX_HISTORY, group: STROKE })

/** `step` applied `count` times: a jump through history is that many undos or redos. */
const repeat = (
  history: HistoryModel<Grid>,
  count: number,
  step: (history: HistoryModel<Grid>) => HistoryModel<Grid>,
): HistoryModel<Grid> => (count <= 0 ? history : repeat(step(history), count - 1, step))

// TOOL

const applyEraser = (model: Model, x: number, y: number) => {
  const positions = getMirroredPositions(x, y, model.gridSize, model.mirrorMode)
  return erasePixels(model.history.present, positions)
}

const applyBrush = (model: Model, x: number, y: number) => {
  const positions = getMirroredPositions(x, y, model.gridSize, model.mirrorMode)
  return setPixels(model.history.present, positions, model.selectedColorIndex)
}

const applyFill = (model: Model, x: number, y: number) => {
  const positions = getMirroredPositions(x, y, model.gridSize, 'None')
  return Array.reduce(positions, model.history.present, (currentGrid, [fillX, fillY]) =>
    floodFill(currentGrid, fillX, fillY, model.selectedColorIndex),
  )
}

// SUBMODEL

const foldErrorDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({
    model: modifyFields(model, { maybeExportError: () => Option.none() }),
  }),
})

const foldErrorDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.errorDialog),
  write: (model, nextErrorDialog) => modifyFields(model, { errorDialog: () => nextErrorDialog }),
  toParentMessage: message => Message.GotErrorDialogMessage({ message }),
  foldOutMessage: foldErrorDialogOutMessage,
})

const foldErrorDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.errorDialog),
  write: (model, nextErrorDialog) => modifyFields(model, { errorDialog: () => nextErrorDialog }),
  toParentMessage: message => Message.GotErrorDialogMessage({ message }),
  foldOutMessage: foldErrorDialogOutMessage,
})

const foldThemeListboxOutMessage = Listbox.OutMessage.match<Update.Step<Model, Message>>({
  Selected:
    ({ value }) =>
    model => {
      const themeIndex = Number(value)
      const maybeNextTheme = Array.get(PALETTE_THEMES, themeIndex)
      if (Option.isNone(maybeNextTheme)) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          paletteThemeIndex: () => themeIndex,
          selectedColorIndex: () => DEFAULT_COLOR_INDEX,
        }),
      }
    },
})

const foldThemeListbox = Update.foldChild({
  update: ThemeListbox.update,
  read: (model: Model) => Option.some(model.themeListbox),
  write: (model, nextThemeListbox) => modifyFields(model, { themeListbox: () => nextThemeListbox }),
  toParentMessage: message => Message.GotThemeListboxMessage({ message }),
  foldOutMessage: foldThemeListboxOutMessage,
})

const foldGridSizeConfirmDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({
    model: modifyFields(model, { maybePendingGridSize: () => Option.none() }),
  }),
})

const foldGridSizeConfirmDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.gridSizeConfirmDialog),
  write: (model, nextGridSizeConfirmDialog) =>
    modifyFields(model, {
      gridSizeConfirmDialog: () => nextGridSizeConfirmDialog,
    }),
  toParentMessage: message => Message.GotGridSizeConfirmDialogMessage({ message }),
  foldOutMessage: foldGridSizeConfirmDialogOutMessage,
})

const foldGridSizeConfirmDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.gridSizeConfirmDialog),
  write: (model, nextGridSizeConfirmDialog) =>
    modifyFields(model, {
      gridSizeConfirmDialog: () => nextGridSizeConfirmDialog,
    }),
  toParentMessage: message => Message.GotGridSizeConfirmDialogMessage({ message }),
  foldOutMessage: foldGridSizeConfirmDialogOutMessage,
})

const foldGridSizeConfirmDialogClose = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.gridSizeConfirmDialog),
  write: (model, nextGridSizeConfirmDialog) =>
    modifyFields(model, {
      gridSizeConfirmDialog: () => nextGridSizeConfirmDialog,
    }),
  toParentMessage: message => Message.GotGridSizeConfirmDialogMessage({ message }),
  foldOutMessage: foldGridSizeConfirmDialogOutMessage,
})

const selectTool = (model: Model, tool: Tool): UpdateReturn => ({
  model: modifyFields(model, { tool: () => tool }),
})

const selectColor = (model: Model, colorIndex: PaletteIndex): UpdateReturn => ({
  model: modifyFields(model, { selectedColorIndex: () => colorIndex }),
})

const foldToolRadioGroupOutMessage = RadioGroup.OutMessage.match<
  Update.Step<Model, Message>,
  RadioGroup.OutMessage<Tool>
>({
  Selected:
    ({ value }) =>
    model =>
      selectTool(model, value),
})

const foldToolRadioGroup = Update.foldChild({
  update: ToolRadioGroup.update,
  read: (model: Model) => Option.some(model.toolRadioGroup),
  write: (model, nextToolRadioGroup) =>
    modifyFields(model, { toolRadioGroup: () => nextToolRadioGroup }),
  toParentMessage: message => Message.GotToolRadioGroupMessage({ message }),
  foldOutMessage: foldToolRadioGroupOutMessage,
})

const foldGridSizeRadioGroupOutMessage = RadioGroup.OutMessage.match<Update.Step<Model, Message>>({
  Selected:
    ({ value }) =>
    model =>
      requestGridSizeChange(model, Number(value)),
})

const foldGridSizeRadioGroup = Update.foldChild({
  update: GridSizeRadioGroup.update,
  read: (model: Model) => Option.some(model.gridSizeRadioGroup),
  write: (model, nextGridSizeRadioGroup) =>
    modifyFields(model, { gridSizeRadioGroup: () => nextGridSizeRadioGroup }),
  toParentMessage: message => Message.GotGridSizeRadioGroupMessage({ message }),
  foldOutMessage: foldGridSizeRadioGroupOutMessage,
})

const foldPaletteRadioGroupOutMessage = RadioGroup.OutMessage.match<Update.Step<Model, Message>>({
  Selected:
    ({ value }) =>
    model =>
      selectColor(model, paletteIndexFromValue(value, model.selectedColorIndex)),
})

const foldPaletteRadioGroup = Update.foldChild({
  update: PaletteRadioGroup.update,
  read: (model: Model) => Option.some(model.paletteRadioGroup),
  write: (model, nextPaletteRadioGroup) =>
    modifyFields(model, { paletteRadioGroup: () => nextPaletteRadioGroup }),
  toParentMessage: message => Message.GotPaletteRadioGroupMessage({ message }),
  foldOutMessage: foldPaletteRadioGroupOutMessage,
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    PressedCell: ({ x, y }) =>
      Match.value(model.tool).pipe(
        withUpdateReturn,
        Match.when('Brush', () => ({
          model: modifyFields(model, {
            history: () => startStroke(model, applyBrush(model, x, y)),
            isDrawing: () => true,
          }),
        })),
        Match.when('Fill', () => ({
          model: modifyFields(model, {
            history: () => record(model, applyFill(model, x, y)),
          }),
        })),
        Match.when('Eraser', () => ({
          model: modifyFields(model, {
            history: () => startStroke(model, applyEraser(model, x, y)),
            isDrawing: () => true,
          }),
        })),
        Match.exhaustive,
      ),

    EnteredCell: ({ x, y }) => {
      const withHover = modifyFields(model, {
        maybeHoveredCell: () => Option.some({ x, y }),
      })

      if (!model.isDrawing) {
        return { model: withHover }
      }

      return Match.value(model.tool).pipe(
        withUpdateReturn,
        Match.when('Brush', () => ({
          model: modifyFields(withHover, {
            history: () => continueStroke(model, applyBrush(model, x, y)),
          }),
        })),
        Match.when('Eraser', () => ({
          model: modifyFields(withHover, {
            history: () => continueStroke(model, applyEraser(model, x, y)),
          }),
        })),
        Match.when('Fill', () => ({ model: withHover })),
        Match.exhaustive,
      )
    },

    LeftCanvas: () => ({
      model: modifyFields(model, { maybeHoveredCell: () => Option.none() }),
    }),

    ReleasedMouse: () =>
      model.isDrawing ? { model: modifyFields(model, { isDrawing: () => false }) } : { model },

    SelectedColor: ({ colorIndex }) => selectColor(model, colorIndex),

    SelectedTool: ({ tool }) => selectTool(model, tool),

    SelectedGridSize: ({ size }) => requestGridSizeChange(model, size),

    GotToolRadioGroupMessage: ({ message }) => foldToolRadioGroup(model, message),

    GotGridSizeRadioGroupMessage: ({ message }) => foldGridSizeRadioGroup(model, message),

    GotPaletteRadioGroupMessage: ({ message }) => foldPaletteRadioGroup(model, message),

    ToggledMirrorHorizontal: () => {
      const nextMirrorMode = Match.value(model.mirrorMode).pipe(
        Match.when('None', () => 'Horizontal' as const),
        Match.when('Horizontal', () => 'None' as const),
        Match.when('Vertical', () => 'Both' as const),
        Match.when('Both', () => 'Vertical' as const),
        Match.exhaustive,
      )
      return {
        model: modifyFields(model, { mirrorMode: () => nextMirrorMode }),
      }
    },

    ToggledMirrorVertical: () => {
      const nextMirrorMode = Match.value(model.mirrorMode).pipe(
        Match.when('None', () => 'Vertical' as const),
        Match.when('Vertical', () => 'None' as const),
        Match.when('Horizontal', () => 'Both' as const),
        Match.when('Both', () => 'Horizontal' as const),
        Match.exhaustive,
      )
      return {
        model: modifyFields(model, { mirrorMode: () => nextMirrorMode }),
      }
    },

    ClickedUndo: () =>
      History.canUndo(model.history)
        ? { model: modifyFields(model, { history: History.undo }) }
        : { model },

    ClickedRedo: () =>
      History.canRedo(model.history)
        ? { model: modifyFields(model, { history: History.redo }) }
        : { model },

    ClickedHistoryStep: ({ stepIndex }) =>
      Option.match(Array.get(model.history.past, stepIndex), {
        onNone: () => ({ model }),
        onSome: () => ({
          model: modifyFields(model, {
            history: history => repeat(history, history.past.length - stepIndex, History.undo),
          }),
        }),
      }),

    ClickedRedoStep: ({ stepIndex }) =>
      Option.match(Array.get(model.history.future, stepIndex), {
        onNone: () => ({ model }),
        onSome: () => ({
          model: modifyFields(model, {
            history: history => repeat(history, stepIndex + 1, History.redo),
          }),
        }),
      }),

    ClickedClear: () => ({
      model: modifyFields(model, {
        history: () => record(model, createEmptyGrid(model.gridSize)),
      }),
    }),

    ClickedExport: () => ({
      model,
      commands: [
        ExportPng({
          grid: model.history.present,
          gridSize: model.gridSize,
          paletteThemeIndex: model.paletteThemeIndex,
        }),
      ],
    }),

    SucceededExportPng: () => ({ model }),

    FailedExportPng: ({ error }) =>
      Update.combine(model, [
        stepModel => ({
          model: modifyFields(stepModel, {
            maybeExportError: () => Option.some(error),
          }),
        }),
        foldErrorDialogOpen,
      ]),

    GotErrorDialogMessage: ({ message }) => foldErrorDialog(model, message),

    GotThemeListboxMessage: ({ message }) => foldThemeListbox(model, message),

    ConfirmedGridSizeChange: () =>
      Option.match(model.maybePendingGridSize, {
        onNone: () => ({ model }),
        onSome: pendingSize =>
          Update.combine(model, [
            stepModel => applyGridSizeChange(stepModel, pendingSize),
            foldGridSizeConfirmDialogClose,
          ]),
      }),

    GotGridSizeConfirmDialogMessage: ({ message }) => foldGridSizeConfirmDialog(model, message),
  })

const applyGridSizeChange = (model: Model, size: number): UpdateReturn => ({
  model: modifyFields(model, {
    history: () => History.start(createEmptyGrid(size)),
    gridSize: () => size,
    isDrawing: () => false,
    maybeHoveredCell: () => Option.none(),
  }),
})

const requestGridSizeChange = (model: Model, size: number): UpdateReturn => {
  if (size === model.gridSize) {
    return { model }
  }

  if (isGridEmpty(model.history.present)) {
    return applyGridSizeChange(model, size)
  }

  return Update.combine(model, [
    stepModel => ({
      model: modifyFields(stepModel, {
        maybePendingGridSize: () => Option.some(size),
      }),
    }),
    foldGridSizeConfirmDialogOpen,
  ])
}

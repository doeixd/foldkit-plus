/**
 * A title field with a rename action and undo and redo. Each shortcut is one
 * pattern: the same string is matched against a press in `update`, drawn as the
 * label beside its button, and written as that button's `aria-keyshortcuts`,
 * so the three cannot disagree. The history keeps a labelled step per edit, so
 * the buttons read "Undo rename"; typing is one step until a pause.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { matchHotkey, type KeyPress } from 'foldkit-primitives/events'
import { Platform } from 'foldkit-primitives/media'
import { History, HistoryModel } from 'foldkit-primitives/state'

export const UNDO = 'mod+z'
export const REDO = 'mod+shift+z'
export const RENAME = 'mod+e'

/** Typing that pauses longer than this starts a new undo step. */
export const WITHIN_MS = 800

const CAPACITY = 50

export const Step = Schema.Struct({ title: Schema.String, label: Schema.String })
export type Step = typeof Step.Type

export const Model = Schema.Struct({
  platform: Schema.Literals(Platform),
  history: HistoryModel(Step),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Pressed: {
    key: Schema.String,
    code: Schema.String,
    typing: Schema.Boolean,
    repeat: Schema.Boolean,
    ctrl: Schema.Boolean,
    shift: Schema.Boolean,
    alt: Schema.Boolean,
    meta: Schema.Boolean,
  },
  Typed: { text: Schema.String, at: Schema.Number },
  Renamed: {},
  Undone: {},
  Redone: {},
})
export type Message = typeof Message.Type

/** The Message a press is a shortcut for, if any: the one place the patterns are matched. */
export const chordOf = (platform: Platform, press: KeyPress): Option.Option<Message> => {
  const is = (pattern: string) => matchHotkey(pattern, press, { platform })
  if (is(UNDO)) return Option.some(Message.Undone())
  if (is(REDO)) return Option.some(Message.Redone())
  if (is(RENAME)) return Option.some(Message.Renamed())
  return Option.none()
}

export const initialOf = (platform: Platform): { readonly model: Model } => ({
  model: {
    platform,
    history: History.start({ title: 'Untitled', label: 'start' }),
  },
})

export const titleOf = (model: Model): string => model.history.present.title

/** The step an undo would take back, named; a bare "Undo" when there is none. */
export const undoLabel = (model: Model): string =>
  History.canUndo(model.history) ? `Undo ${model.history.present.label}` : 'Undo'

export const redoLabel = (model: Model): string =>
  Option.match(Option.fromNullishOr(model.history.future[0]), {
    onNone: () => 'Redo',
    onSome: step => `Redo ${step.label}`,
  })

const withHistory = (model: Model, history: Model['history']) =>
  history === model.history ? { model } : { model: modifyFields(model, { history: () => history }) }

export const update = (model: Model, message: Message): { readonly model: Model } =>
  Match.valueTags(message, {
    Pressed: press =>
      Option.match(chordOf(model.platform, press), {
        onNone: () => ({ model }),
        onSome: shortcut => update(model, shortcut),
      }),
    Typed: ({ text, at }) =>
      withHistory(
        model,
        History.push(
          model.history,
          { title: text, label: 'typing' },
          {
            capacity: CAPACITY,
            group: 'typing',
            at,
            within: WITHIN_MS,
            equals: (present, next) => present.title === next.title,
          },
        ),
      ),
    Renamed: () =>
      withHistory(
        model,
        History.push(
          model.history,
          { title: `Title ${model.history.past.length + 1}`, label: 'rename' },
          { capacity: CAPACITY },
        ),
      ),
    Undone: () => withHistory(model, History.undo(model.history)),
    Redone: () => withHistory(model, History.redo(model.history)),
  })

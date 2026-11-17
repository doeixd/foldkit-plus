/**
 * The Primitives gallery's live examples. Each region is a view that runs on
 * the gallery page, over the primitive placed in the gallery's own Model
 * (`gallery/primitiveBundles.ts`), and the page shows its text as the source.
 * `slots` are the page's own: the code is the code that runs.
 */
import type { Html } from 'foldkit/html'
import { TweenMessage } from 'foldkit-primitives/motion'
import { TimerMessage } from 'foldkit-primitives/time'

import { NoteHistory } from '../gallery/primitiveBundles.js'
import { Message, type Model } from '../main.js'
import type { H, Slots } from '../view/layout.js'

// #region time-timer
export const timerExample = (model: Model, slots: Slots, h: H): Html =>
  h.p(
    [],
    [
      `${model.ticks.count} ${model.ticks.count === 1 ? 'tick' : 'ticks'}, one a second. `,
      h.button(
        slots.liveButton.attrs([
          h.Type('button'),
          h.OnClick(
            Message.GotTicksMessage({
              message: model.ticks.running ? TimerMessage.Stopped() : TimerMessage.Started(),
            }),
          ),
        ]),
        [model.ticks.running ? 'Stop' : 'Start'],
      ),
    ],
  )
// #endregion

// #region media-prefers-dark
export const prefersDarkExample = (model: Model, _slots: Slots, h: H): Html =>
  h.p([], [`Your system asks for a ${model.dark.matches ? 'dark' : 'light'} color scheme.`])
// #endregion

// #region net-online
export const onlineExample = (model: Model, _slots: Slots, h: H): Html =>
  h.p([], [model.online.online ? 'Online.' : 'Offline: the browser reports no connection.'])
// #endregion

// #region events-window-size
export const windowSizeExample = (model: Model, _slots: Slots, h: H): Html =>
  h.p([], [`The window is ${model.windowSize.width} by ${model.windowSize.height} pixels.`])
// #endregion

// #region motion-tween
export const tweenExample = (model: Model, slots: Slots, h: H): Html =>
  h.div(
    [],
    [
      h.div(slots.liveBar.attrs([h.Style({ '--filled': `${model.fade.value}%` })]), []),
      h.button(
        slots.liveButton.attrs([
          h.Type('button'),
          h.OnClick(Message.GotFadeMessage({ message: TweenMessage.Started() })),
        ]),
        [model.fade.running ? 'Running' : 'Run'],
      ),
    ],
  )
// #endregion

// #region state-history
export const historyExample = (model: Model, slots: Slots, h: H): Html =>
  h.div(
    [],
    [
      h.input(
        slots.liveField.attrs([
          h.Type('text'),
          h.AriaLabel('Note'),
          h.Value(model.note.present),
          h.OnInput(value =>
            Message.GotNoteMessage({
              message: NoteHistory.Message.Push({ value, group: 'typing' }),
            }),
          ),
        ]),
      ),
      h.button(
        slots.liveButton.attrs([
          h.Type('button'),
          h.Disabled(model.note.past.length === 0),
          h.OnClick(Message.GotNoteMessage({ message: NoteHistory.Message.Undo() })),
        ]),
        ['Undo'],
      ),
      h.button(
        slots.liveButton.attrs([
          h.Type('button'),
          h.Disabled(model.note.future.length === 0),
          h.OnClick(Message.GotNoteMessage({ message: NoteHistory.Message.Redo() })),
        ]),
        ['Redo'],
      ),
      h.p([], [`${model.note.past.length} to undo, ${model.note.future.length} to redo.`]),
    ],
  )
// #endregion

export interface PrimitiveExample {
  /** The family it belongs to, and the region of this file that holds its source. */
  readonly family: string
  readonly id: string
  readonly title: string
  readonly text: string
  readonly draw: (model: Model, slots: Slots, h: H) => Html
}

export const examples: ReadonlyArray<PrimitiveExample> = [
  {
    family: 'media',
    id: 'media-prefers-dark',
    title: 'PrefersDark',
    text: 'The site places `PrefersDark` once in its Model; the view reads `model.dark.matches`. Change your system’s scheme and the line follows.',
    draw: prefersDarkExample,
  },
  {
    family: 'net',
    id: 'net-online',
    title: 'Online',
    text: '`Online` keeps `online` in the Model, from the window’s online and offline events. Switch your network off and on to watch it.',
    draw: onlineExample,
  },
  {
    family: 'time',
    id: 'time-timer',
    title: 'Timer',
    text: 'A `Timer` placed with `{ intervalMs: 1000 }` starts stopped; `Started` and `Stopped` are Messages, and only `Ticked` advances the count.',
    draw: timerExample,
  },
  {
    family: 'state',
    id: 'state-history',
    title: 'History',
    text: 'An undo stack as a bundle. Each keystroke is a `Push` in the group `typing`, so a run of typing is one step to undo.',
    draw: historyExample,
  },
  {
    family: 'motion',
    id: 'motion-tween',
    title: 'Tween',
    text: 'A number animated from 0 to 100 over 1.5 seconds on Effect’s clock. The view only reads `model.fade.value`; under reduced motion it jumps to the end.',
    draw: tweenExample,
  },
  {
    family: 'events',
    id: 'events-window-size',
    title: 'WindowSize',
    text: '`WindowSize` keeps the window’s width and height in the Model. Resize the window to watch it.',
    draw: windowSizeExample,
  },
]

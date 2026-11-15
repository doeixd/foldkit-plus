/**
 * Where focus goes when the screen under it changes. A Message that opens or
 * closes an editor removes the control that held focus (a row's button, the
 * back button), and the browser then leaves it on the body: a keyboard reader
 * starts again from the top of the page. Focus caused by a Message is a
 * Command, run after the next render (`Dom.focus`).
 */
import { Effect } from 'effect'
import type { EditorStatus } from 'foldkit-cms'
import * as Dom from 'foldkit/dom'

/** Whether the editor has an entry's form to show: not closed, loading, missing or unreadable. */
export const hasForm = (status: EditorStatus): boolean =>
  !['Closed', 'Loading', 'NotFound', 'LoadFailed'].includes(status)

/** Moves focus to `selector`, answering `done` (the application's Message for nothing). */
export const focusOn = <M>(selector: string, done: M) => ({
  name: 'Focus',
  args: { selector },
  // The scripted run drives `update` in Node, where there is no page to focus.
  effect: Effect.suspend(() =>
    typeof document === 'undefined'
      ? Effect.succeed(done)
      : Dom.focus(selector, { makeFocusable: true }).pipe(Effect.ignore, Effect.as(done)),
  ),
})

/**
 * The commands for an editor that began to show a form between two Models: focus
 * goes to the entry's title, where writing begins.
 */
export const opened = <M>(
  before: EditorStatus,
  after: EditorStatus,
  titleId: string,
  done: M,
): ReadonlyArray<ReturnType<typeof focusOn<M>>> =>
  !hasForm(before) && hasForm(after) ? [focusOn(`#${titleId}`, done)] : []

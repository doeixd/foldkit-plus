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

/**
 * Moves focus to `selector`, answering `done` (the application's Message for nothing).
 * An element that is not focusable by itself (a list's region) is made so; one that is
 * (an editable) is left as it is, since a `tabindex` of -1 would take it out of the Tab order.
 */
export const focusOn = <M>(selector: string, done: M, makeFocusable = true) => ({
  name: 'Focus',
  args: { selector },
  // The scripted run drives `update` in Node, where there is no page to focus.
  effect: Effect.suspend(() =>
    typeof document === 'undefined'
      ? Effect.succeed(done)
      : Dom.focus(selector, { makeFocusable }).pipe(Effect.ignore, Effect.as(done)),
  ),
})

/**
 * Returns focus to the row of `list` that held entry `entry` (its button, found by the row's
 * `data-row-key`), or to the list itself when that row is gone: deleted, or filtered out.
 */
export const focusRow = <M>(list: string, entry: string, done: M) => ({
  name: 'FocusRow',
  args: { list, entry },
  effect: Effect.suspend((): Effect.Effect<M> =>
    typeof document === 'undefined'
      ? Effect.succeed(done)
      : Dom.focus(`[data-row-key="${CSS.escape(entry)}"] button`).pipe(
          Effect.catch(() => Dom.focus(list, { makeFocusable: true })),
          Effect.ignore,
          Effect.as(done),
        ),
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

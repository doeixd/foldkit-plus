import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

type Editable = Element & {
  readonly value?: string
  readonly focus?: () => void
  readonly setSelectionRange?: (start: number, end: number) => void
  readonly showPicker?: () => void
}

/**
 * Focuses what the grid draws over itself while it is open (a cell's editor,
 * with the caret after its text, or a column's menu) and hands focus back to
 * the grid when it goes, so closing it leaves the keyboard on the grid rather
 * than on the page's body. Focus the user moved elsewhere stays there. A
 * choice's `select` also opens its list, so a double-click on the cell shows
 * the choices at once rather than asking for another click.
 */
export const HoldFocus = Mount.defineStream('DataGridHoldFocus', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const editor = element as Editable
          const grid = element.closest('[role="grid"]') as (Element & { focus?: () => void }) | null
          editor.focus?.()
          const end = editor.value?.length ?? 0
          editor.setSelectionRange?.(end, end)
          if (element.tagName === 'SELECT') {
            try {
              editor.showPicker?.()
            } catch {
              // Refused without a user's gesture to answer: the select is focused,
              // and its list opens with a click or Alt+ArrowDown.
            }
          }
          return grid
        }),
        grid =>
          Effect.sync(() => {
            const active = typeof document === 'undefined' ? null : document.activeElement
            if (active === null || active === element || active === document.body) grid?.focus?.()
          }),
      ),
    ),
})

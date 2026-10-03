import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

type Editable = Element & {
  readonly value?: string
  readonly focus?: () => void
  readonly setSelectionRange?: (start: number, end: number) => void
}

/**
 * Focuses a cell's editor when it mounts, with the caret after its text, and
 * hands focus back to the grid when it goes, so a commit or a cancel leaves
 * the keyboard on the grid rather than on the page's body.
 */
export const EditorFocus = Mount.defineStream('DataGridEditorFocus', {
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

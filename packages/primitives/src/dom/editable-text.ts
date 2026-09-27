/**
 * Text typed into an editable descendant of an element, as a Mount: one set of
 * listeners on the container, like `Targets`. A field is a descendant marked
 * by an attribute whose value names it, while it is `contenteditable`. The
 * view decides which one is; the Mount focuses it when it becomes so, with the
 * caret at its end. A double-click on a marked field that is not editable yet
 * asks for it to be (`EditAsked`).
 *
 * It reads `innerText`, never `innerHTML`, so what arrives is text. A field is
 * one line unless it carries `aria-multiline="true"`: in one line, a line
 * break becomes a space. Nothing is reported while an input method composes;
 * the composed text arrives once, when it is done.
 *
 * Enter commits (Shift+Enter breaks a line in a multiline field), and so does
 * leaving the field. Escape cancels, and puts the text the field had when
 * editing began back in the DOM, since a view that stopped redrawing the field
 * while it was edited will not. Where the browser lacks `plaintext-only`, a
 * paste is inserted as text. What an edit means is the parent's `update`.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const TextEdited = Schema.TaggedStruct('TextEdited', {
  /** The field, by its marking attribute's value. */
  field: Schema.String,
  text: Schema.String,
})
export type TextEdited = typeof TextEdited.Type

export const TextCommitted = Schema.TaggedStruct('TextCommitted', {
  field: Schema.String,
  text: Schema.String,
})
export type TextCommitted = typeof TextCommitted.Type

export const TextCancelled = Schema.TaggedStruct('TextCancelled', {
  field: Schema.String,
  /** The text the field had when editing began, which the DOM shows again. */
  initial: Schema.String,
})
export type TextCancelled = typeof TextCancelled.Type

export const EditAsked = Schema.TaggedStruct('EditAsked', {
  /** A marked field, not editable yet, that was double-clicked. */
  field: Schema.String,
})
export type EditAsked = typeof EditAsked.Type

export type TextFact = TextEdited | TextCommitted | TextCancelled | EditAsked

/** Whether a field takes more than one line. */
const multiline = (element: HTMLElement) => element.getAttribute('aria-multiline') === 'true'

/**
 * A field's text. A browser ends an edited element with a line break it adds
 * itself, which is not the author's; in one line, the author's breaks are spaces.
 */
export const textOf = (element: HTMLElement): string => {
  const text = element.innerText.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  return multiline(element) ? text : text.replace(/\n+/g, ' ')
}

/** Whether a key press belongs to an input method still composing, not to the field. */
const composing = (event: KeyboardEvent) => event.isComposing || event.keyCode === 229

export const EditableText = Mount.defineStream('EditableText', {
  messages: [TextEdited, TextCommitted, TextCancelled, EditAsked],
  args: {
    /** The attribute that marks a field, holding its name. */
    attribute: Schema.String,
  },
  execute: ({ element, attribute }) =>
    Stream.callback<TextFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          /** The field being edited: its name, its text when editing began, and the last reported. */
          let current:
            | {
                readonly field: HTMLElement
                readonly name: string
                readonly initial: string
                reported: string
                ended: boolean
              }
            | undefined
          let composingText = false

          /** The marked field at or above an event's target, inside the container. */
          const markedOf = (target: EventTarget | null): HTMLElement | undefined => {
            if (!(target instanceof Element)) return undefined
            const field = target.closest(`[${attribute}]`)
            return field instanceof HTMLElement && element.contains(field) ? field : undefined
          }
          /** The same, while it is editable. */
          const fieldOf = (target: EventTarget | null): HTMLElement | undefined => {
            const field = markedOf(target)
            return field?.isContentEditable === true ? field : undefined
          }
          /** Begins an edit of `field`, unless one of it is under way: on focus, or typing. */
          const begin = (field: HTMLElement) => {
            if (current?.field === field && !current.ended) return current
            const text = textOf(field)
            current = {
              field,
              name: field.getAttribute(attribute) ?? '',
              initial: text,
              reported: text,
              ended: false,
            }
            return current
          }
          /**
           * The edit of `field`: the one under way or just ended, else one begun
           * now, for a field focused before these listeners came. An ended edit
           * reports nothing more, so the blur that follows a commit or a cancel
           * does not commit again.
           */
          const editOf = (field: HTMLElement) => (current?.field === field ? current : begin(field))
          const report = (field: HTMLElement) => {
            const edit = editOf(field)
            if (edit.ended) return
            const text = textOf(field)
            // A browser may follow a composition with an input of the same text.
            if (text === edit.reported) return
            edit.reported = text
            Queue.offerUnsafe(queue, TextEdited.make({ field: edit.name, text }))
          }
          const commit = (field: HTMLElement) => {
            const edit = editOf(field)
            if (edit.ended) return
            edit.ended = true
            Queue.offerUnsafe(queue, TextCommitted.make({ field: edit.name, text: textOf(field) }))
          }
          const cancel = (field: HTMLElement) => {
            const edit = editOf(field)
            if (edit.ended) return
            edit.ended = true
            field.innerText = edit.initial
            Queue.offerUnsafe(
              queue,
              TextCancelled.make({ field: edit.name, initial: edit.initial }),
            )
          }

          const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'dblclick',
              event => {
                const field = markedOf(event.target)
                // In an editable field, a double-click selects a word.
                if (field === undefined || field.isContentEditable) return
                Queue.offerUnsafe(
                  queue,
                  EditAsked.make({ field: field.getAttribute(attribute) ?? '' }),
                )
              },
            ],
            [
              'focusin',
              event => {
                const field = fieldOf(event.target)
                if (field !== undefined) begin(field)
              },
            ],
            // Before the change: a field focused before these listeners came is begun here.
            [
              'beforeinput',
              event => {
                const field = fieldOf(event.target)
                if (field !== undefined) begin(field)
              },
            ],
            ['compositionstart', () => (composingText = true)],
            [
              'compositionend',
              event => {
                composingText = false
                const field = fieldOf(event.target)
                if (field !== undefined) report(field)
              },
            ],
            [
              'input',
              event => {
                const field = fieldOf(event.target)
                if (field !== undefined && !composingText) report(field)
              },
            ],
            [
              'keydown',
              event => {
                const field = fieldOf(event.target)
                const key = event as KeyboardEvent
                if (field === undefined || composing(key)) return
                if (key.key === 'Escape') {
                  event.preventDefault()
                  cancel(field)
                } else if (key.key === 'Enter' && !(key.shiftKey && multiline(field))) {
                  event.preventDefault()
                  commit(field)
                }
              },
            ],
            [
              'focusout',
              event => {
                const field = fieldOf(event.target)
                if (field !== undefined) commit(field)
              },
            ],
            [
              'paste',
              event => {
                const field = fieldOf(event.target)
                // `plaintext-only` pastes text itself; elsewhere, markup would arrive.
                if (field === undefined || field.contentEditable === 'plaintext-only') return
                const pasted = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? ''
                event.preventDefault()
                // As typing is, so the browser's undo takes it back; `textOf` makes one line of it.
                document.execCommand('insertText', false, pasted)
              },
            ],
          ]
          /** Focuses a field that has become editable, the caret at its end, once. */
          let claimed: Element | undefined
          const claim = () => {
            const field = element.querySelector(
              `[${attribute}][contenteditable]:not([contenteditable="false"])`,
            )
            if (!(field instanceof HTMLElement) || field === claimed) return
            claimed = field
            // Chromium also focuses on the selection below; no standard says a browser must.
            field.focus()
            const caret = document.createRange()
            caret.selectNodeContents(field)
            caret.collapse(false)
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(caret)
          }
          const becoming = new MutationObserver(claim)

          for (const [type, listener] of listeners) element.addEventListener(type, listener)
          becoming.observe(element, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['contenteditable'],
          })
          claim()
          return { listeners, becoming }
        }),
        ({ listeners, becoming }) =>
          Effect.sync(() => {
            becoming.disconnect()
            for (const [type, listener] of listeners) element.removeEventListener(type, listener)
          }),
      ),
    ),
})

import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** What `InputMask` reports after each edit: the masked text shown, and the characters typed. */
export const Input = Schema.TaggedStruct('Input', {
  value: Schema.String,
  raw: Schema.String,
})
export type Input = typeof Input.Type

const isDigit = (char: string): boolean => char >= '0' && char <= '9'
const isLetter = (char: string): boolean =>
  (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')

const matches = (placeholder: string, char: string): boolean =>
  placeholder === '#'
    ? isDigit(char)
    : placeholder === 'A'
      ? isLetter(char)
      : isDigit(char) || isLetter(char)

const isPlaceholder = (char: string): boolean => char === '#' || char === 'A' || char === '*'

/** Whether any placeholder at or after `from` consumes any input at or after `at`. */
const fillable = (pattern: string, from: number, value: string, at: number): boolean => {
  for (let i = from; i < pattern.length; i++) {
    const placeholder = pattern[i]!
    if (!isPlaceholder(placeholder)) continue
    for (let j = at; j < value.length; j++) {
      if (matches(placeholder, value[j]!)) return true
    }
  }
  return false
}

/**
 * The mask as a pure function: `#` takes a digit, `A` a letter, `*` either, and
 * any other character of the pattern is written in once input reaches past it.
 * Input that fits no placeholder is skipped. `masked` is what the field shows;
 * `raw` is only the characters typed.
 */
export const applyMask = (
  value: string,
  pattern: string,
): { readonly masked: string; readonly raw: string } => {
  let masked = ''
  let raw = ''
  let at = 0
  for (let i = 0; i < pattern.length; i++) {
    const slot = pattern[i]!
    if (isPlaceholder(slot)) {
      while (at < value.length && !matches(slot, value[at]!)) at++
      if (at >= value.length) break
      masked += value[at]!
      raw += value[at]!
      at++
    } else if (fillable(pattern, i + 1, value, at)) {
      masked += slot
    } else {
      break
    }
  }
  return { masked, raw }
}

interface MaskableField {
  value: string
  selectionStart: number | null
  addEventListener(type: string, listener: (event: Event) => void): void
  removeEventListener(type: string, listener: (event: Event) => void): void
  setSelectionRange?(start: number, end: number): void
}

const asField = (element: Element): MaskableField | null => {
  const field = element as unknown as Partial<MaskableField>
  return typeof field.value === 'string' && typeof field.addEventListener === 'function'
    ? (field as MaskableField)
    : null
}

/**
 * How many typed characters the mask takes from the text before `caret`: where the caret is
 * in the raw text, which is the one position the browser's caret and the masked text agree on.
 */
const consumedBefore = (value: string, caret: number, pattern: string): number =>
  applyMask(value.slice(0, caret), pattern).raw.length

/**
 * The caret just after the `consumed`th typed character of the masked text, which has one
 * character per pattern slot. Before the first, it stays at the start.
 */
const caretAfter = (pattern: string, masked: string, consumed: number): number => {
  if (consumed === 0) return 0
  let seen = 0
  for (let i = 0; i < masked.length; i++) {
    if (isPlaceholder(pattern[i]!)) {
      seen++
      if (seen === consumed) return i + 1
    }
  }
  return masked.length
}

/**
 * An input mask as a Mount plus a pure mask function. The pattern language
 * is three placeholders — `#` digit, `A` letter, `*` either, all ASCII —
 * with every other character literal. Literals appear only once a later placeholder
 * consumes input, so partial values never dangle a separator. The Mount
 * rewrites the field, keeps the caret after the same typed character, and emits `Input`
 * with both the masked and raw values; the parent owns the state, like any
 * controlled input.
 */
export const InputMask = Mount.defineStream('InputMask', {
  messages: [Input],
  args: { pattern: Schema.String },
  execute: ({ element, pattern }) =>
    Stream.callback<typeof Input.Type>(queue =>
      Effect.gen(function* () {
        const field = asField(element)
        if (field === null) return
        // What the field held before the edit: a deleted separator takes the character before it.
        let before = field.value
        let composing = false
        const onBeforeInput = () => {
          before = field.value
        }
        const onInput = (event: Event) => {
          // An input method's candidate text is not the field's until it is committed.
          if (composing || (event as InputEvent).isComposing === true) return
          const typed = field.value
          const caret = field.selectionStart ?? typed.length
          let consumed = consumedBefore(typed, caret, pattern)
          let { masked, raw } = applyMask(typed, pattern)
          const kind = (event as InputEvent).inputType
          if (
            (kind === 'deleteContentBackward' || kind === 'deleteContentForward') &&
            raw === applyMask(before, pattern).raw
          ) {
            // Only a separator went, and the mask would write it back: take the typed character
            // on that side of the caret instead.
            const at = kind === 'deleteContentBackward' ? consumed - 1 : consumed
            if (at >= 0 && at < raw.length) {
              raw = raw.slice(0, at) + raw.slice(at + 1)
              masked = applyMask(raw, pattern).masked
              consumed = at
            }
          }
          if (masked !== typed) {
            field.value = masked
            const at = caretAfter(pattern, masked, consumed)
            try {
              field.setSelectionRange?.(at, at)
            } catch {
              // Select-all style inputs reject ranges; the value still stands.
            }
          }
          before = masked
          Queue.offerUnsafe(queue, Input.make({ value: masked, raw }))
        }
        const onCompositionStart = () => {
          composing = true
        }
        const onCompositionEnd = (event: Event) => {
          composing = false
          onInput(event)
        }
        const listeners = [
          ['beforeinput', onBeforeInput],
          ['input', onInput],
          ['compositionstart', onCompositionStart],
          ['compositionend', onCompositionEnd],
        ] as const
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            for (const [type, listener] of listeners) field.addEventListener(type, listener)
            return field
          }),
          current =>
            Effect.sync(() => {
              for (const [type, listener] of listeners) current.removeEventListener(type, listener)
            }),
        )
      }),
    ),
})

/**
 * An input mask as a Mount plus a pure mask function. The pattern language
 * is three placeholders — `#` digit, `A` letter, `*` either — with every
 * other character literal. Literals appear only once a later placeholder
 * consumes input, so partial values never dangle a separator. The Mount
 * rewrites the field, restores the caret approximately, and emits `Input`
 * with both the masked and raw values; the parent owns the state, like any
 * controlled input.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

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
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
  setSelectionRange?(start: number, end: number): void
}

const asField = (element: Element): MaskableField | null => {
  const field = element as unknown as Partial<MaskableField>
  return typeof field.value === 'string' && typeof field.addEventListener === 'function'
    ? (field as MaskableField)
    : null
}

export const InputMask = Mount.defineStream('InputMask', {
  messages: [Input],
  args: { pattern: Schema.String },
  execute: ({ element, pattern }) =>
    Stream.callback<typeof Input.Type>(queue =>
      Effect.gen(function* () {
        const field = asField(element)
        if (field === null) return
        const onInput = () => {
          const { masked, raw } = applyMask(field.value, pattern)
          if (masked !== field.value) {
            const caret = field.selectionStart ?? masked.length
            field.value = masked
            const at = Math.min(caret, masked.length)
            try {
              field.setSelectionRange?.(at, at)
            } catch {
              // Select-all style inputs reject ranges; the value still stands.
            }
          }
          Queue.offerUnsafe(queue, Input.make({ value: masked, raw }))
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            field.addEventListener('input', onInput)
            return field
          }),
          current => Effect.sync(() => current.removeEventListener('input', onInput)),
        )
      }),
    ),
})

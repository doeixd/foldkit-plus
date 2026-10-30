/**
 * What is typed before the runtime starts, read from the fields themselves.
 *
 * A field the view marks with `KeepTyped` keeps its typing in the browser's
 * own state (its value, its selection) until the runtime adopts it, and
 * hydration then re-asserts the value the server rendered. The page reads
 * the marked fields when its script runs, turns each changed one into its
 * binding's Message, and after the first render puts the value and the
 * selection back, so the Message that follows finds the field already
 * holding its value and writes nothing.
 */
import { Result } from 'effect'
import { typedMessage, type DecodedBinding } from './listen.js'
import { KEEP_ATTRIBUTE } from './resumable.js'

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/** A marked field and the binding whose Message replays its typing. */
export interface KeptField {
  readonly element: Field
  readonly binding: DecodedBinding
}

const isField = (element: Element): element is Field =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  element instanceof HTMLSelectElement

/**
 * The fields in `root` marked to keep their typing, each with its binding.
 * Refused, with the reason, when a marker names no `OnInput` or `OnChange`
 * binding, or sits on an element that is not a field: the server writes
 * neither, so the page was altered.
 */
export const keptFields = (
  root: Element,
  bindings: ReadonlyArray<DecodedBinding>,
): Result.Result<ReadonlyArray<KeptField>, string> => {
  const kept: Array<KeptField> = []
  for (const element of Array.from(root.querySelectorAll(`[${KEEP_ATTRIBUTE}]`))) {
    const token = element.getAttribute(KEEP_ATTRIBUTE) ?? ''
    const binding = bindings[Number(token)]
    // A binding of either event has a hole: a closure is no binding at all.
    if (
      !/^\d+$/.test(token) ||
      binding === undefined ||
      (binding.event !== 'input' && binding.event !== 'change')
    ) {
      return Result.fail(
        `the marker ${KEEP_ATTRIBUTE}="${token}" names no input or change binding the page carries`,
      )
    }
    if (!isField(element)) {
      return Result.fail(`the marker ${KEEP_ATTRIBUTE} is on a ${element.localName}, not a field`)
    }
    kept.push({ element, binding })
  }
  return Result.succeed(kept)
}

/**
 * The value the server rendered into a field: its default, which typing
 * leaves alone. A `select`'s is its last option marked `selected`, as the
 * parser leaves it, else its first enabled one.
 */
const servedValue = (element: Field): string => {
  if (!(element instanceof HTMLSelectElement)) return element.defaultValue
  const options = Array.from(element.options)
  const chosen =
    options.filter(option => option.defaultSelected).at(-1) ??
    options.find(option => !option.disabled)
  return chosen?.value ?? ''
}

/** Whether the field holds something other than what the server rendered. */
export const changed = (field: KeptField): boolean =>
  field.element.value !== servedValue(field.element)

/** The Messages that carry each changed field's typing, in document order. */
export const typedMessages = (fields: ReadonlyArray<KeptField>): ReadonlyArray<unknown> =>
  fields.filter(changed).map(field => typedMessage(field.binding, field.element.value))

/** A changed field's value and selection, as they were just before the runtime started. */
export interface Held {
  readonly element: Field
  readonly value: string
  readonly selection?: readonly [number, number, 'forward' | 'backward' | 'none'] | undefined
}

/** Each changed field's state, to put back once hydration has re-asserted the served value. */
export const hold = (fields: ReadonlyArray<KeptField>): ReadonlyArray<Held> =>
  fields.filter(changed).map(({ element }) => {
    if (element instanceof HTMLSelectElement) return { element, value: element.value }
    // An input type with no selection (`email`, `number`) reads null.
    const { selectionStart: start, selectionEnd: end } = element
    return {
      element,
      value: element.value,
      ...(start === null || end === null
        ? {}
        : { selection: [start, end, element.selectionDirection ?? 'none'] as const }),
    }
  })

/**
 * Puts each held field back as it was. The first render adopted it, so it is
 * the same element, which the person may still be typing into.
 */
export const restore = (held: ReadonlyArray<Held>): void => {
  for (const { element, value, selection } of held) {
    element.value = value
    if (selection !== undefined && !(element instanceof HTMLSelectElement)) {
      element.setSelectionRange(...selection)
    }
  }
}

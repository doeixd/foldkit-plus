/**
 * What is typed before the runtime starts, read from the fields themselves.
 *
 * A field the view marks with `KeepTyped` keeps its typing in the browser's
 * own state (its value, its selection) until the runtime adopts it, and
 * hydration then re-asserts the value the server rendered. The page reads
 * the marked fields when its script runs, turns each changed one into its
 * binding's Message, and after the first render puts the value and the
 * selection back, so the Message that follows finds the field already
 * holding its value and writes nothing. A checkbox or radio keeps its
 * `checked` the same way, against its `defaultChecked`.
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

/** A checkbox or radio: what it holds is `checked`, not its `value`. */
const isCheckable = (element: Field): element is HTMLInputElement =>
  element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')

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
    if (!isField(element)) {
      return Result.fail(`the marker ${KEEP_ATTRIBUTE} is on a ${element.localName}, not a field`)
    }
    // A closure is no binding at all; a checkbox or radio may replay a click.
    if (
      !/^\d+$/.test(token) ||
      binding === undefined ||
      !(
        binding.event === 'input' ||
        binding.event === 'change' ||
        (binding.event === 'click' && isCheckable(element))
      )
    ) {
      return Result.fail(
        `the marker ${KEEP_ATTRIBUTE}="${token}" names no input or change binding (or click, on a checkbox or radio) the page carries`,
      )
    }
    kept.push({ element, binding })
  }
  return Result.succeed(kept)
}

/** Whether an option is disabled by its own attribute or by a disabled `optgroup` around it. */
const disabledOption = (option: HTMLOptionElement): boolean =>
  option.disabled || (option.closest('optgroup')?.disabled ?? false)

/** A select's display size: its `size` when it parses above zero, else 4 for `multiple` and 1 otherwise. */
const displaySize = (select: HTMLSelectElement): number => {
  const size = select.getAttribute('size')
  const parsed = size === null ? null : /^\s*(\d+)\s*$/.exec(size)
  if (parsed !== null && Number(parsed[1]) > 0) return Number(parsed[1])
  return select.multiple ? 4 : 1
}

/**
 * The value the server rendered into a field: its default, which typing
 * leaves alone. A `select`'s follows the HTML reset algorithm: the last option
 * marked `selected` wins, else a single-line select takes its first option
 * that is not disabled, through an `optgroup` included.
 */
const servedValue = (element: Field): string => {
  if (!(element instanceof HTMLSelectElement)) return element.defaultValue
  const options = Array.from(element.options)
  const chosen =
    options.filter(option => option.defaultSelected).at(-1) ??
    (displaySize(element) === 1 ? options.find(option => !disabledOption(option)) : undefined)
  return chosen?.value ?? ''
}

/** The indices of a `select`'s options that `chosen` picks, in document order. */
const indicesOf = (
  select: HTMLSelectElement,
  chosen: (option: HTMLOptionElement) => boolean,
): ReadonlyArray<number> =>
  Array.from(select.options).flatMap((option, index) => (chosen(option) ? [index] : []))

/** Whether the field holds something other than what the server rendered. */
export const changed = (field: KeptField): boolean => {
  const { element } = field
  if (isCheckable(element)) return element.checked !== element.defaultChecked
  // A multiple select holds a set of selections, which its `value`, the first
  // of them, cannot tell apart: compare the whole set with the served one.
  if (element instanceof HTMLSelectElement && element.multiple) {
    const selected = indicesOf(element, option => option.selected)
    const served = indicesOf(element, option => option.defaultSelected)
    return selected.length !== served.length || selected.some((index, at) => index !== served[at])
  }
  return element.value !== servedValue(element)
}

/**
 * Whether the browser sent the field's event for its change: a radio the
 * person left for another sent none, so only the one now checked replays.
 */
const sentChange = (field: KeptField): boolean =>
  !(isCheckable(field.element) && field.element.type === 'radio' && !field.element.checked)

/** The Messages that carry each changed field's typing, in document order. */
export const typedMessages = (fields: ReadonlyArray<KeptField>): ReadonlyArray<unknown> =>
  fields
    .filter(field => changed(field) && sentChange(field))
    .map(({ binding, element }) =>
      binding.hole === undefined ? binding.message : typedMessage(binding, element.value),
    )

/** A changed field's value and selection, as they were just before the runtime started. */
export interface Held {
  readonly element: Field
  readonly value: string
  /** A checkbox's or radio's. */
  readonly checked?: boolean | undefined
  /** A `multiple` select's selected option indices: its `value` names only the first. */
  readonly selected?: readonly number[] | undefined
  readonly selection?: readonly [number, number, 'forward' | 'backward' | 'none'] | undefined
}

/** Each changed field's state, to put back once hydration has re-asserted the served value. */
export const hold = (fields: ReadonlyArray<KeptField>): ReadonlyArray<Held> =>
  fields.filter(changed).map(({ element }): Held => {
    if (isCheckable(element)) return { element, value: element.value, checked: element.checked }
    if (element instanceof HTMLSelectElement) {
      return element.multiple
        ? {
            element,
            value: element.value,
            selected: indicesOf(element, option => option.selected),
          }
        : { element, value: element.value }
    }
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
  for (const { element, value, checked, selected, selection } of held) {
    if (checked !== undefined && element instanceof HTMLInputElement) {
      element.checked = checked
    } else if (element instanceof HTMLSelectElement && selected !== undefined) {
      const chosen = new Set(selected)
      Array.from(element.options).forEach((option, index) => {
        option.selected = chosen.has(index)
      })
    } else {
      element.value = value
    }
    if (selection !== undefined && !(element instanceof HTMLSelectElement)) {
      element.setSelectionRange(...selection)
    }
  }
}

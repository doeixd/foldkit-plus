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
import { Option, Result } from 'effect'
import { typedMessage, type DecodedBinding } from './listen.js'
import { BINDER_TOUCHED_ATTRIBUTE } from './marks.js'
export { BINDER_TOUCHED_ATTRIBUTE } from './marks.js'
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

const holdField = (element: Field): Held => {
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
}

const restoreField = ({ element, value, checked, selected, selection }: Held): void => {
  if (element instanceof HTMLInputElement && element.type === 'file') return
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
  if (
    selection !== undefined &&
    !(element instanceof HTMLSelectElement) &&
    element.selectionStart !== null
  ) {
    element.setSelectionRange(...selection)
  }
}

/** Each changed field's state, to put back once hydration has re-asserted the served value. */
export const hold = (fields: ReadonlyArray<KeptField>): ReadonlyArray<Held> =>
  fields.filter(changed).map(({ element }) => holdField(element))

/**
 * Puts each held field back as it was. The first render adopted it, so it is
 * the same element, which the person may still be typing into.
 */
export const restore = (held: ReadonlyArray<Held>): void => {
  for (const entry of held) restoreField(entry)
}

const FALLBACK_TOUCHED_ATTRIBUTES: ReadonlyArray<string> = ['aria-pressed', 'aria-expanded', 'open']

/** A scrolled element and the offsets it held before hydration. */
export interface HeldScroll {
  readonly element: Element
  readonly scrollTop: number
  readonly scrollLeft: number
}

/** A `<details>` element and whether it was open before hydration. */
export interface HeldDetails {
  readonly element: HTMLDetailsElement
  readonly open: boolean
}

/** A binder-touched control and the DOM state it held before hydration. */
export interface HeldBinderControl {
  readonly element: Element
  readonly field?: Held | undefined
  readonly attributes: ReadonlyArray<readonly [string, Option.Option<string>]>
}

/**
 * Page state outside `KeepTyped` fields that hydration would reset: scroll
 * offsets, `<details>` open state, and controls updated by the pre-boot binder.
 */
export interface HeldPageState {
  readonly scrolls: ReadonlyArray<HeldScroll>
  readonly windowScroll: Option.Option<{ readonly scrollX: number; readonly scrollY: number }>
  readonly details: ReadonlyArray<HeldDetails>
  readonly binderTouched: ReadonlyArray<HeldBinderControl>
}

const readTouchedAttributes = (
  element: Element,
): ReadonlyArray<readonly [string, Option.Option<string>]> => {
  const raw = element.getAttribute(BINDER_TOUCHED_ATTRIBUTE)?.trim() ?? ''
  const names = raw.length > 0 ? raw.split(/\s+/) : FALLBACK_TOUCHED_ATTRIBUTES
  return names.map(name => [name, Option.fromNullishOr(element.getAttribute(name))] as const)
}

/**
 * Captures scroll offsets, `<details>` open states, and binder-touched control
 * state under `root` before hydration re-asserts the server-rendered DOM.
 */
export const holdPageState = (root: Element): HeldPageState => {
  const scrolls: Array<HeldScroll> = []
  const details: Array<HeldDetails> = []
  const binderTouched: Array<HeldBinderControl> = []
  const docEl = typeof document !== 'undefined' ? document.documentElement : null

  const visit = (element: Element): void => {
    if (element !== docEl && (element.scrollTop !== 0 || element.scrollLeft !== 0)) {
      scrolls.push({ element, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft })
    }
    if (element instanceof HTMLDetailsElement) {
      details.push({ element, open: element.open })
    }
    if (element.hasAttribute(BINDER_TOUCHED_ATTRIBUTE)) {
      const holdableField =
        isField(element) && !(element instanceof HTMLInputElement && element.type === 'file')
      binderTouched.push({
        element,
        ...(holdableField ? { field: holdField(element) } : {}),
        attributes: readTouchedAttributes(element),
      })
    }
  }

  visit(root)
  for (const element of root.querySelectorAll('*')) {
    visit(element)
  }

  const windowScroll =
    typeof window !== 'undefined' && (window.scrollX !== 0 || window.scrollY !== 0)
      ? Option.some({ scrollX: window.scrollX, scrollY: window.scrollY })
      : Option.none()
  return { scrolls, windowScroll, details, binderTouched }
}

/**
 * Restores held scroll offsets, `<details>` open states, and binder-touched
 * controls after hydration's first commit.
 */
export const restorePageState = (held: HeldPageState): void => {
  for (const { element, open } of held.details) {
    if (element.open !== open) element.open = open
  }
  for (const { element, field, attributes } of held.binderTouched) {
    if (field !== undefined) restoreField(field)
    for (const [name, value] of attributes) {
      Option.match(value, {
        onNone: () => element.removeAttribute(name),
        onSome: v => element.setAttribute(name, v),
      })
    }
  }
  for (const { element, scrollTop, scrollLeft } of held.scrolls) {
    element.scrollTop = scrollTop
    element.scrollLeft = scrollLeft
  }
  Option.match(held.windowScroll, {
    onNone: () => {},
    onSome: ({ scrollX, scrollY }) => {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
      }
    },
  })
}

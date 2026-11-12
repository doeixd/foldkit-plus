/**
 * What a Foldkit attribute really sets on its element: the DOM event it
 * listens to and the HTML attribute it writes, read from Foldkit's handler
 * table (`foldkit/dist/html/index.js`, `attributeHandlers`), not from its tag.
 * The resolver compares these, so every spelling of one event or attribute
 * meets one owner and one protection. Internal: not exported from the package.
 */
import { Option } from 'effect'
import type { Attribute } from 'foldkit/html'

/** `AriaLabel` -> `arialabel`, `aria-label` -> `arialabel`; tags and tokens agree. */
export const normalizeName = (name: string): string => name.replace(/[^a-z0-9]/gi, '').toLowerCase()

type FoldkitTag = Attribute<unknown>['_tag']

/** Handlers that are no one DOM event: a Mount is composed, an unmount is a hook, and a custom event names its own. */
type NotOneEvent = 'OnMount' | 'OnUnmount' | 'OnCustomEvent'

type EventTag = Exclude<Extract<FoldkitTag, `On${string}`>, NotOneEvent> | 'AllowDrop'

/**
 * The DOM event each Foldkit handler builder registers. The variants own their
 * base event: `OnKeyDownPreventDefault` listens to `keydown`, and Foldkit
 * chains it onto any other `keydown` handler on the element. A Foldkit release
 * that adds a handler fails to compile here until it is listed.
 */
export const EVENT_OF_TAG: { readonly [Tag in EventTag]: string } = {
  OnClick: 'click',
  OnDoubleClick: 'dblclick',
  OnMouseDown: 'mousedown',
  OnMouseUp: 'mouseup',
  OnMouseEnter: 'mouseenter',
  OnMouseLeave: 'mouseleave',
  OnMouseOver: 'mouseover',
  OnMouseOut: 'mouseout',
  OnMouseMove: 'mousemove',
  OnPointerMove: 'pointermove',
  OnPointerLeave: 'pointerleave',
  OnPointerDown: 'pointerdown',
  OnPointerUp: 'pointerup',
  OnKeyDown: 'keydown',
  OnKeyDownPreventDefault: 'keydown',
  OnKeyDownSelf: 'keydown',
  OnKeyDownSelfPreventDefault: 'keydown',
  OnKeyDownFocus: 'keydown',
  OnKeyUp: 'keyup',
  OnKeyUpPreventDefault: 'keyup',
  OnKeyPress: 'keypress',
  OnFocus: 'focus',
  OnBlur: 'blur',
  OnFocusEnter: 'focusin',
  OnFocusLeave: 'focusout',
  OnInput: 'input',
  OnChange: 'change',
  OnBeforeInput: 'beforeinput',
  OnBeforeInputPreventDefault: 'beforeinput',
  OnFileChange: 'change',
  OnSubmit: 'submit',
  OnReset: 'reset',
  OnScroll: 'scroll',
  OnWheel: 'wheel',
  OnCopy: 'copy',
  OnCut: 'cut',
  OnPaste: 'paste',
  OnPastePreventDefault: 'paste',
  OnCopyText: 'copy',
  OnCutText: 'cut',
  OnCancel: 'cancel',
  OnCancelPreventDefault: 'cancel',
  OnToggle: 'toggle',
  OnContextMenu: 'contextmenu',
  OnDragStart: 'dragstart',
  OnDrag: 'drag',
  OnDragEnd: 'dragend',
  OnDragEnter: 'dragenter',
  OnDragLeave: 'dragleave',
  OnDragOver: 'dragover',
  AllowDrop: 'dragover',
  OnDrop: 'drop',
  OnDropFiles: 'drop',
  OnTouchStart: 'touchstart',
  OnTouchEnd: 'touchend',
  OnTouchMove: 'touchmove',
  OnTouchCancel: 'touchcancel',
  OnAnimationStart: 'animationstart',
  OnAnimationEnd: 'animationend',
  OnAnimationIteration: 'animationiteration',
  OnTransitionEnd: 'transitionend',
  OnLoad: 'load',
  OnError: 'error',
  OnPlay: 'play',
  OnPause: 'pause',
  OnEnded: 'ended',
  OnTimeUpdate: 'timeupdate',
  OnVolumeChange: 'volumechange',
  OnSelect: 'select',
}

const eventOfTag: ReadonlyMap<string, string> = new Map(Object.entries(EVENT_OF_TAG))

const NOT_ONE_EVENT: ReadonlySet<string> = new Set<NotOneEvent>([
  'OnMount',
  'OnUnmount',
  'OnCustomEvent',
])

/**
 * The DOM event a contribution listens to, normalized like a protected event:
 * `OnClick` and `OnCustomEvent('click')` both read `click`, and
 * `OnKeyDownPreventDefault` reads `keydown`. `None` for an attribute that is
 * no event, a custom event with no name, or a handler `isUnknownHandler` names.
 */
export const eventNameOf = (tag: string, value: unknown): Option.Option<string> => {
  const known = eventOfTag.get(tag)
  if (known !== undefined) return Option.some(known)
  // tag-check: open — the tag may be a child attribute's, from another package.
  if (tag !== 'OnCustomEvent') return Option.none()
  const name =
    typeof value === 'object' && value !== null
      ? (value as { readonly name?: unknown }).name
      : undefined
  return typeof name === 'string' ? Option.some(normalizeName(name)) : Option.none()
}

/**
 * A tag shaped like a handler that Foldkit's table lacks: a child attribute's
 * from another Foldkit, say. Its event cannot be read from its spelling (that
 * guess once let every variant past protection), so the resolver refuses it.
 */
// tag-check: open — any `On…` tag is a handler by prefix, and a child attribute's tag is another package's.
export const isUnknownHandler = (tag: string): boolean =>
  tag.startsWith('On') && !eventOfTag.has(tag) && !NOT_ONE_EVENT.has(tag)

/** Typed builders whose attribute is not their tag: `For` writes the `htmlFor` property, which is `for`. */
const ATTRIBUTE_OF_TAG: ReadonlyMap<string, string> = new Map<FoldkitTag, string>([
  ['For', 'for'],
  ['CiteAttr', 'cite'],
  ['FormAttr', 'form'],
  ['LabelAttr', 'label'],
  ['ContentAttr', 'content'],
])

/**
 * DOM properties that write an attribute of another name; the rest normalize
 * alike (`readOnly`, `tabIndex`). `classList` and `relList` forward an
 * assignment to their attribute, and a `default…` property is the attribute
 * its control starts from.
 */
const ATTRIBUTE_OF_PROPERTY: ReadonlyMap<string, string> = new Map([
  ['className', 'class'],
  ['classList', 'class'],
  ['htmlFor', 'for'],
  ['relList', 'rel'],
  ['defaultValue', 'value'],
  ['defaultChecked', 'checked'],
  ['defaultSelected', 'selected'],
])

/** `ariaControlsElements` and `ariaActiveDescendantElement` reflect `aria-controls` and `aria-activedescendant`. */
const ARIA_ELEMENTS = /^(aria[A-Z][A-Za-z]*?)Elements?$/

const attributeOfProperty = (key: string): string =>
  ATTRIBUTE_OF_PROPERTY.get(key) ?? key.replace(ARIA_ELEMENTS, '$1')

/** The builders that name their attribute by argument, and the name each sets. */
const KEYED_BUILDERS: ReadonlyMap<string, (key: string) => string> = new Map([
  ['DataAttribute', (key: string) => `data-${key}`],
  // `xlink:href` is the `href` an SVG link reads where it has no plain one.
  ['Attribute', (key: string) => key.replace(/^xlink:/i, '')],
  ['Prop', attributeOfProperty],
])

/**
 * An `Attribute` or `Prop` named like `onclick`: an inline handler, which
 * listens to its event outside every owner and protection the resolver keeps.
 */
export const isInlineHandler = (tag: string, value: unknown): boolean => {
  // tag-check: open — the tag may be a child attribute's, from another package.
  if (tag !== 'Attribute' && tag !== 'Prop') return false
  const key =
    typeof value === 'object' && value !== null
      ? (value as { readonly key?: unknown }).key
      : undefined
  return typeof key === 'string' && key.toLowerCase().startsWith('on')
}

/**
 * The HTML attribute a contribution sets, normalized to compare with a protected one:
 * `AriaLabel`, `Attribute('aria-label')` and `Prop({ key: 'ariaLabel' })` all read
 * `arialabel`, `Prop({ key: 'className' })` reads `class`, and `DataAttribute('x')`
 * reads as `data-x`.
 */
export const attributeNameOf = (tag: string, value: unknown): string => {
  const key =
    typeof value === 'object' && value !== null
      ? (value as { readonly key?: unknown }).key
      : undefined
  const keyed = KEYED_BUILDERS.get(tag)
  if (keyed !== undefined && typeof key === 'string') return normalizeName(keyed(key))
  return normalizeName(ATTRIBUTE_OF_TAG.get(tag) ?? tag)
}

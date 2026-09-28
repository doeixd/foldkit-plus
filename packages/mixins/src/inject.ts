/**
 * Styles that arrive with what uses them. Compiling a Style registers each
 * class it produces with that class's CSS; the name is a hash of the CSS, so
 * the registry is the same on the server and in the browser, and holds no DOM.
 *
 * When a Slot draws a class in a browser, the CSS is queued, and one microtask
 * later (after the patch, before the browser paints) appended to a single
 * `<style data-foldkit-styles>` element, unless a stylesheet on the page
 * already carries the class: a static sheet and injection never repeat each
 * other.
 *
 * The registry holds every class compiled in the process and never lets one
 * go, which is bounded by the code when Styles are defined once, as they are
 * meant to be. A Style compiled during a render from data (a width from the
 * Model) would register a class per value; such a value belongs in an inline
 * custom property read by a rule instead.
 */
import { standard } from './layers.js'

const registry = new Map<string, string>()

/** Records the CSS a compiled class stands for. Called by the compiler. */
export const register = (className: string, css: string): void => {
  if (!registry.has(className)) registry.set(className, css)
}

/** A compiled class in CSS text: `.style-` and its hash. */
const COMPILED_CLASS = /\.(style-[0-9a-z]+)/g

/** An `@layer` order statement, as opposed to a layer block. */
const LAYER_STATEMENT = /@layer [^{};]+;/g

/** The standard layer order, as one `@layer` statement. */
const layerOrder = (): string => standard.declare.globalCss?.join('') ?? ''

/**
 * The CSS for every compiled class that `html` carries, after the standard
 * layer order: what a server puts in a page's head, so it is styled before
 * any script runs. The browser's injection then finds these classes present
 * and adds nothing twice.
 */
export const usedIn = (html: string): string => {
  const found = new Set<string>()
  for (const [className] of html.matchAll(/style-[0-9a-z]+/g)) {
    if (registry.has(className)) found.add(className)
  }
  return [layerOrder(), ...[...found].map(className => registry.get(className) ?? '')].join('')
}

/** What the page carries: counted from its sheets once, then kept as CSS is queued. */
interface Page {
  readonly present: Set<string>
  readonly globals: Set<string>
  /** Contributions already handled whole: a Style's are the same object every render. */
  readonly handled: WeakSet<object>
  /** Whether a sheet on the page declares a layer order, so this one need not. */
  readonly ordered: boolean
  /** The sheets counted, so a removed one means counting again. */
  readonly counted: ReadonlyArray<HTMLStyleElement>
  element: HTMLStyleElement | undefined
}

let page: Page | undefined
let pending: Array<string> = []
let scheduled = false

/**
 * The page as injection knows it, counted afresh when a sheet it counted or its
 * own element has been removed (by a test's cleanup, or an application
 * replacing the head).
 */
const current = (): Page => {
  if (
    page !== undefined &&
    (page.element === undefined || page.element.isConnected) &&
    page.counted.every(sheet => sheet.isConnected)
  )
    return page
  const present = new Set<string>()
  let ordered = false
  const counted = Array.from(document.querySelectorAll('style'))
  for (const sheet of counted) {
    const text = sheet.textContent ?? ''
    for (const [, className] of text.matchAll(COMPILED_CLASS))
      if (className !== undefined) present.add(className)
    if (text.match(LAYER_STATEMENT) !== null) ordered = true
  }
  page = {
    present,
    globals: new Set(),
    handled: new WeakSet(),
    ordered,
    counted,
    element: undefined,
  }
  return page
}

const flush = (): void => {
  scheduled = false
  if (pending.length === 0) return
  const into = current()
  if (into.element === undefined) {
    const element = document.createElement('style')
    element.setAttribute('data-foldkit-styles', '')
    // Without an order on the page, the standard one first, so rules inserted
    // in any order still cascade by layer; an application's own order is left alone.
    element.textContent = into.ordered ? '' : layerOrder()
    document.head.appendChild(element)
    into.element = element
  }
  into.element.appendChild(document.createTextNode(pending.join('')))
  pending = []
}

/**
 * Queues the CSS of each registered class a contribution draws that the page
 * does not carry yet, and its global CSS (keyframes, a theme root) once.
 * Outside a browser it does nothing: a server extracts what it rendered instead.
 */
export const ensure = (contribution: {
  readonly classes?: ReadonlyArray<string>
  readonly globalCss?: string
}): void => {
  if (typeof document === 'undefined') return
  const into = current()
  if (into.handled.has(contribution)) return
  for (const className of contribution.classes ?? []) {
    if (into.present.has(className)) continue
    const css = registry.get(className)
    if (css === undefined) continue
    into.present.add(className)
    pending.push(css)
  }
  const globalCss = contribution.globalCss
  // A layer order is the page's to declare, so a Style's own is not repeated.
  if (globalCss !== undefined && globalCss !== '' && !into.globals.has(globalCss)) {
    into.globals.add(globalCss)
    pending.push(globalCss.replace(LAYER_STATEMENT, ''))
  }
  // Frozen, a contribution cannot draw other classes next time it is drawn.
  if (Object.isFrozen(contribution)) into.handled.add(contribution)
  if (pending.length > 0 && !scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

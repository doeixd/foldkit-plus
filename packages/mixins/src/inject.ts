/**
 * Styles that arrive with what uses them. Compiling a Style registers each
 * class it produces with that class's CSS, and with the Style's global rules
 * (keyframes, `raise`'s depth rules) that the class does not work without;
 * the name is a hash of the CSS, so the registry is the same on the server
 * and in the browser, and holds no DOM.
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

interface Registered {
  readonly css: string
  /** The global CSS of every Style that compiled to this class. */
  readonly globals: Set<string>
}

const registry = new Map<string, Registered>()

/**
 * Records the CSS a compiled class stands for, and the global CSS of the
 * Style it came from: the same text the Style's contribution carries, so the
 * browser's injection recognizes what a server wrote. Called by the compiler.
 */
export const register = (className: string, css: string, globalCss: string): void => {
  let entry = registry.get(className)
  if (entry === undefined) {
    entry = { css, globals: new Set() }
    registry.set(className, entry)
  }
  if (globalCss !== '') entry.globals.add(globalCss)
}

/** A compiled class in CSS text: `.style-` and its hash. */
const COMPILED_CLASS = /\.(style-[0-9a-z]+)/g

/** An `@layer` order statement, as opposed to a layer block. */
const LAYER_STATEMENT = /@layer [^{};]+;/g

/** The standard layer order, as one `@layer` statement. */
const layerOrder = (): string => standard.declare.globalCss?.join('') ?? ''

/** A Style's global CSS without its layer order, which is the page's to declare. */
const withoutOrder = (globalCss: string): string => globalCss.replace(LAYER_STATEMENT, '')

/**
 * The CSS for every compiled class that `html` carries, and once each the
 * global CSS of the Styles those classes came from, after the standard layer
 * order: what a server puts in a page's head, so it is styled before any
 * script runs. The browser's injection then finds these present and adds
 * nothing twice.
 */
export const usedIn = (html: string): string => {
  const found = new Map<string, Registered>()
  for (const [className] of html.matchAll(/style-[0-9a-z]+/g)) {
    const entry = registry.get(className)
    if (entry !== undefined) found.set(className, entry)
  }
  const globals = new Set([...found.values()].flatMap(entry => [...entry.globals]))
  return [
    layerOrder(),
    ...[...found.values()].map(entry => entry.css),
    ...[...globals].map(withoutOrder),
  ].join('')
}

/** What the page carries: counted from its sheets once, then kept as CSS is queued. */
interface Page {
  readonly present: Set<string>
  readonly globals: Set<string>
  /** The text of the sheets counted, where a server may have written a global already. */
  readonly text: string
  /** Contributions already handled whole: a Style's are the same object every render. */
  readonly handled: WeakSet<object>
  /** The layer order a sheet on the page declares, which the injected sheet repeats. */
  readonly order: string | undefined
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
  let order: string | undefined
  const counted = Array.from(document.querySelectorAll('style'))
  const texts = counted.map(sheet => sheet.textContent ?? '')
  for (const text of texts) {
    for (const [, className] of text.matchAll(COMPILED_CLASS))
      if (className !== undefined) present.add(className)
    order ??= text.match(LAYER_STATEMENT)?.[0]
  }
  page = {
    present,
    globals: new Set(),
    text: texts.join(''),
    handled: new WeakSet(),
    order,
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
    // A layer order first: the page's own, or the standard one where it has
    // none. Layers are ordered by where they are first named, so an injected
    // `@layer components { … }` that came to stand ahead of the page's order
    // (a test's sheet, or an application's, put in after it) would otherwise
    // make `components` the first layer, under the reset.
    element.textContent = into.order ?? layerOrder()
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
    const entry = registry.get(className)
    if (entry === undefined) continue
    into.present.add(className)
    pending.push(entry.css)
  }
  const globalCss = contribution.globalCss
  if (globalCss !== undefined && globalCss !== '' && !into.globals.has(globalCss)) {
    into.globals.add(globalCss)
    const css = withoutOrder(globalCss)
    // A server's `usedIn` writes the same text, so a page it rendered has it.
    if (!into.text.includes(css)) pending.push(css)
  }
  // Frozen, a contribution cannot draw other classes next time it is drawn.
  if (Object.isFrozen(contribution)) into.handled.add(contribution)
  if (pending.length > 0 && !scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

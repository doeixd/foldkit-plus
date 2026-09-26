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
 */
import { standard } from './layers.js'

const registry = new Map<string, string>()

/** Records the CSS a compiled class stands for. Called by the compiler. */
export const register = (className: string, css: string): void => {
  if (!registry.has(className)) registry.set(className, css)
}

/** A compiled class in CSS text: `.style-` and its hash. */
const COMPILED_CLASS = /\.(style-[0-9a-z]+)/g

let element: HTMLStyleElement | undefined
const present = new Set<string>()
const globals = new Set<string>()
let pending: Array<string> = []
let scheduled = false

/** The injection element, made on first need, with every marked sheet's classes counted as present. */
const target = (): HTMLStyleElement => {
  if (element !== undefined && element.isConnected) return element
  present.clear()
  globals.clear()
  // A sheet already on the page (the application's, or a server's) carries these.
  for (const sheet of Array.from(document.querySelectorAll('style'))) {
    for (const [, className] of (sheet.textContent ?? '').matchAll(COMPILED_CLASS))
      if (className !== undefined) present.add(className)
  }
  element = document.createElement('style')
  element.setAttribute('data-foldkit-styles', '')
  // The layer order first, so rules inserted in any order still cascade by layer.
  element.textContent = standard.declare.globalCss?.join('') ?? ''
  document.head.appendChild(element)
  return element
}

const flush = (): void => {
  scheduled = false
  if (pending.length === 0) return
  const into = target()
  into.appendChild(document.createTextNode(pending.join('')))
  pending = []
}

/**
 * Queues the CSS of each registered class the page does not carry yet, and any
 * global CSS (keyframes, a theme root) not queued before. Outside a browser it
 * does nothing: a server extracts what it rendered instead.
 */
export const ensure = (classNames: ReadonlyArray<string>, globalCss?: string): void => {
  if (typeof document === 'undefined') return
  target()
  for (const className of classNames) {
    if (present.has(className)) continue
    const css = registry.get(className)
    if (css === undefined) continue
    present.add(className)
    pending.push(css)
  }
  // A layer order is the page's to declare, so a Style's own is not repeated.
  if (globalCss !== undefined && globalCss !== '' && !globals.has(globalCss)) {
    globals.add(globalCss)
    pending.push(globalCss.replace(/@layer [^{};]+;/g, ''))
  }
  if (pending.length > 0 && !scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

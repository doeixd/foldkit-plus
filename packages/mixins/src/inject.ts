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
 * other. A sheet is a `<style>` or a `<link data-foldkit-styles-href>`, the
 * mark a build's linked sheet carries (`foldkit-mixins/vite`); a link's classes
 * are read from its parsed rules, and a draw that comes before it loads waits
 * for it rather than injecting what it is about to bring.
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

/**
 * `sheet` followed by every compiled class and global rule it does not hold:
 * a build's complete stylesheet, where `usedIn` finds the classes of one
 * page at request time. Which classes exist is whatever the process has
 * compiled, so load the application's styled modules first.
 */
export const complete = (sheet: string): string => {
  const held = new Set(Array.from(sheet.matchAll(COMPILED_CLASS), ([, name]) => name))
  const rules: Array<string> = []
  const globals = new Set<string>()
  for (const [className, entry] of registry) {
    if (!held.has(className)) rules.push(entry.css)
    for (const css of entry.globals) globals.add(withoutOrder(css))
  }
  const missing = [...globals].filter(css => css !== '' && !sheet.includes(css))
  return [sheet, ...missing, ...rules].join('')
}

/** The mark on a `<link>` to a stylesheet the page's build wrote. */
const LINKED = 'link[data-foldkit-styles-href]'

/** Links that failed to load: counted as holding nothing, so a draw stops waiting. */
const failed = new WeakSet<Element>()

/**
 * The rules of a linked sheet, or none where the browser withholds them (a
 * cross-origin sheet): its classes are then injected, which repeats rules
 * rather than losing them.
 */
const rulesOf = (sheet: CSSStyleSheet): ReadonlyArray<CSSRule> => {
  try {
    return Array.from(sheet.cssRules)
  } catch {
    return []
  }
}

/** Every compiled class a rule, or a rule nested in it (a layer, a media query), selects. */
const classesIn = (rules: ReadonlyArray<CSSRule>, into: Set<string>): void => {
  for (const rule of rules) {
    if ('selectorText' in rule && typeof rule.selectorText === 'string') {
      for (const [, className] of rule.selectorText.matchAll(COMPILED_CLASS))
        if (className !== undefined) into.add(className)
    }
    if ('cssRules' in rule) classesIn(Array.from(rule.cssRules as CSSRuleList), into)
  }
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
  /** The parsed sheets of the linked stylesheets that have loaded. */
  readonly linked: ReadonlyArray<CSSStyleSheet>
  /** Linked stylesheets still loading, which a draw waits for. */
  readonly waiting: ReadonlyArray<HTMLLinkElement>
  /** The sheets counted, so a removed one means counting again. */
  readonly counted: ReadonlyArray<Element>
  /** The serialized top-level rules of `linked`, read once a global needs them. */
  linkedRules: Set<string> | undefined
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
    page.counted.every(sheet => sheet.isConnected) &&
    page.waiting.every(link => link.sheet === null && !failed.has(link))
  )
    return page
  const present = new Set<string>()
  let order: string | undefined
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>(LINKED))
  const linked = links.flatMap(link => (link.sheet === null ? [] : [link.sheet]))
  for (const sheet of linked) classesIn(rulesOf(sheet), present)
  const counted = [...document.querySelectorAll('style'), ...links]
  const texts = counted.map(
    sheet => (sheet instanceof HTMLStyleElement ? sheet.textContent : '') ?? '',
  )
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
    linked,
    waiting: links.filter(link => link.sheet === null && !failed.has(link)),
    counted,
    linkedRules: undefined,
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

/** Contributions drawn while a linked sheet was loading, drawn again once it has. */
const deferred: Array<Parameters<typeof ensure>[0]> = []
const watched = new WeakSet<Element>()

/** Whether the linked sheets hold every top-level rule of `css`, as the browser writes them. */
const linkedHolds = (into: Page, css: string): boolean => {
  if (into.linked.length === 0 || typeof CSSStyleSheet === 'undefined') return false
  const probe = new CSSStyleSheet()
  probe.replaceSync(css)
  const rules = Array.from(probe.cssRules)
  into.linkedRules ??= new Set(
    into.linked.flatMap(sheet => rulesOf(sheet).map(rule => rule.cssText)),
  )
  const held = into.linkedRules
  return rules.length > 0 && rules.every(rule => held.has(rule.cssText))
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
  if (into.waiting.length > 0) {
    deferred.push(contribution)
    for (const link of into.waiting) {
      if (watched.has(link)) continue
      watched.add(link)
      const retry = () => {
        page = undefined
        for (const waiting of deferred.splice(0)) ensure(waiting)
      }
      link.addEventListener('load', retry, { once: true })
      link.addEventListener(
        'error',
        () => {
          failed.add(link)
          retry()
        },
        { once: true },
      )
    }
    return
  }
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
    if (!into.text.includes(css) && !linkedHolds(into, css)) pending.push(css)
  }
  // Frozen, a contribution cannot draw other classes next time it is drawn.
  if (Object.isFrozen(contribution)) into.handled.add(contribution)
  if (pending.length > 0 && !scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

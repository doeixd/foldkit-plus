/**
 * A reader's knob values, kept across visits and applied before the first
 * paint, as `schemeScript` and `chooseScheme` do for the scheme. What is kept
 * is the knob variables a theme writes, not its values: the head script then
 * holds no theme logic to drift from `Theme.make`, and only applies them.
 *
 * Both write one rule, `selector { }`, in one `<style>` element in the head,
 * unlayered so it beats every layer `Style.stylesheet` writes: the script once
 * from storage, then `chooseKnobs` on each change. So when the application
 * takes over there is nothing to hand over.
 */
import { Effect } from 'effect'
import { VAR_PREFIX } from './core.js'
import { variables, type KnobSet, type KnobTheme } from './knobs.js'

/** The storage key kept knobs live under, unless one is given. */
export const KNOBS_KEY = 'foldkit:knobs'

/**
 * The kept entry's format. Raise it when a knob is renamed or its variable
 * changes meaning, and an entry kept by an older build is ignored rather than
 * applied wrongly.
 */
export const KNOBS_FORMAT = 1

/** Where kept knobs are kept, and the elements they apply to. */
export interface KnobsPlace {
  /** The storage key. Default `KNOBS_KEY`. */
  readonly key?: string | undefined
  /**
   * The elements whose knobs the rule sets. Default `:root`. A token derives
   * from the knobs where it is declared, so elements other than the root must
   * declare the tokens too (`Theme.scope`), or they inherit the root's.
   */
  readonly selector?: string | undefined
}

/** A theme's knobs to apply, and the theme the page's stylesheet already declares. */
export interface KnobsChoice<S extends KnobSet> extends KnobsPlace {
  /** What the stylesheet declares on `selector`: only knobs that differ from it are written. */
  readonly base: KnobTheme<S>
}

const KNOB_PREFIX = `${VAR_PREFIX}-knob-`

// The attribute naming the element by its key, so two keys keep two rules.
const ELEMENT_ATTRIBUTE = 'data-fk-knobs'

/** `value` as a script literal: `<` escaped, so it cannot close the script it is written into. */
const literal = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', `${String.fromCharCode(92)}u003c`)

/**
 * The text of a `<script>` for the document's head: it applies the knobs kept
 * under `key` to `selector`, so a reader who made a theme never sees the
 * default for a frame. Storage that throws, an entry of another format, and
 * anything that is not a knob variable are left out.
 */
export const knobScript = ({ key = KNOBS_KEY, selector = ':root' }: KnobsPlace = {}): string =>
  `(function(){try{var e=JSON.parse(localStorage.getItem(${literal(key)})||'null');` +
  `if(!e||e.v!==${KNOBS_FORMAT}||!Array.isArray(e.d))return;` +
  `var s=document.createElement('style');s.setAttribute(${literal(ELEMENT_ATTRIBUTE)},${literal(key)});` +
  `s.textContent=${literal(`${selector}{}`)};document.head.appendChild(s);var r=s.sheet.cssRules[0].style;` +
  `e.d.forEach(function(p){if(Array.isArray(p)&&typeof p[0]==='string'&&typeof p[1]==='string'&&p[0].indexOf(${literal(KNOB_PREFIX)})===0)r.setProperty(p[0],p[1])})` +
  `}catch(x){}})()`

/** The knob variables `theme` writes that `base` does not, as properties. */
const differences = <S extends KnobSet>(theme: KnobTheme<S>, base: KnobTheme<S>) => {
  const declared = variables(base)
  return Object.entries(variables(theme))
    .filter(([name, value]) => declared[name] !== value)
    .map(([name, value]) => [`${KNOB_PREFIX}${name}`, value] as const)
}

/** The element the script made for `key`, or a new one. */
const elementFor = (key: string): HTMLStyleElement => {
  const made = Array.from(
    document.head.querySelectorAll<HTMLStyleElement>(`style[${ELEMENT_ATTRIBUTE}]`),
  ).find(element => element.getAttribute(ELEMENT_ATTRIBUTE) === key)
  if (made !== undefined) return made
  const element = document.createElement('style')
  element.setAttribute(ELEMENT_ATTRIBUTE, key)
  document.head.appendChild(element)
  return element
}

/**
 * Applies `theme`'s knobs to `selector` and keeps them under `key` for the
 * next visit, as a Command's effect: the knobs that differ from `base`, so the
 * base theme writes and keeps nothing. Storage that throws still applies them
 * to this page.
 */
export const chooseKnobs = <S extends KnobSet>(
  theme: KnobTheme<S>,
  { base, key = KNOBS_KEY, selector = ':root' }: KnobsChoice<S>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const declarations = differences(theme, base)
    // Written as text: these are the theme's own derivations. The script,
    // which reads them back from storage, sets each through `setProperty`.
    elementFor(key).textContent =
      `${selector}{${declarations.map(([name, value]) => `${name}:${value}`).join(';')}}`
    try {
      if (declarations.length === 0) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify({ v: KNOBS_FORMAT, d: declarations }))
    } catch {
      // Storage refused (a private window, a full quota): this visit keeps it.
    }
  })

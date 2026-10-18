/**
 * Deterministic compilation of rule-based Style. A rule selector is written
 * relative to the generated class with `&` (`&:hover`). The class name is an
 * FNV-1a hash of the canonical rule text, so equal rules share a class and the
 * server and the browser derive the same name. Pure data in, CSS text out: no
 * registry, no DOM, no `Date.now`.
 */
export interface StyleRule {
  readonly selector: string
  readonly at?: string
  /** The cascade layer the rule is emitted in; none means the unlayered cascade. */
  readonly layer?: string
  readonly declarations: Readonly<Record<string, string>>
}

export const rule = (
  selector: string,
  declarations: Readonly<Record<string, string>>,
  at?: string,
): StyleRule =>
  Object.freeze({
    selector,
    declarations: Object.freeze({ ...declarations }),
    ...(at === undefined ? {} : { at }),
  })

/**
 * The top-level selectors of a list: split on commas outside `()`, `[]` and
 * strings, so `:is(a, b)` and `[title="a, b"]` stay whole.
 */
export const selectorList = (selector: string): ReadonlyArray<string> => {
  const parts: Array<string> = []
  let depth = 0
  let quote: string | undefined
  let start = 0
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index]
    if (quote !== undefined) {
      if (char === '\\') index++
      else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(selector.slice(start).trim())
  return parts
}

/** Each selector of a list relative to the class: `&` kept where written, else `prefix` added. */
const relative = (selector: string, prefix: (part: string) => string): string =>
  selectorList(selector)
    .map(part => (part.includes('&') ? part : prefix(part)))
    .join(', ')

/** `:hover, :focus-visible` is `&:hover, &:focus-visible`. */
export const pseudo = (suffix: string, declarations: Readonly<Record<string, string>>): StyleRule =>
  rule(
    relative(suffix, part => `&${part}`),
    declarations,
  )

export const media = (query: string, declarations: Readonly<Record<string, string>>): StyleRule =>
  rule('&', declarations, `@media ${query}`)

export const supports = (
  condition: string,
  declarations: Readonly<Record<string, string>>,
): StyleRule => rule('&', declarations, `@supports ${condition}`)

export const container = (
  condition: string,
  declarations: Readonly<Record<string, string>>,
): StyleRule => rule('&', declarations, `@container ${condition}`)

/**
 * A nested selector relative to the class, e.g. `> span`, or `[data-open] &`
 * where `&` places the class. Every selector of a list is scoped.
 */
export const nest = (selector: string, declarations: Readonly<Record<string, string>>): StyleRule =>
  rule(
    relative(selector, part => `& ${part}`),
    declarations,
  )

/** `gridTemplateColumns` -> `grid-template-columns`; custom properties pass through. */
const kebab = (property: string): string =>
  property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)

const declarationsText = (declarations: Readonly<Record<string, string>>): string =>
  Object.keys(declarations)
    .sort()
    .map(property => `${kebab(property)}:${declarations[property]}`)
    .join(';')

/** Canonical, declaration-sorted, authored-rule-order text for a rule list. */
const inLayerText = (layer: string | undefined, text: string): string =>
  layer === undefined ? text : `@layer ${layer}{${text}}`

export const canonical = (rules: ReadonlyArray<StyleRule>): string =>
  rules
    .map(entry => {
      const body = `{${declarationsText(entry.declarations)}}`
      return inLayerText(
        entry.layer,
        entry.at === undefined
          ? `${entry.selector}${body}`
          : `${entry.at}{${entry.selector}${body}}`,
      )
    })
    .join('')

const hash = (value: string): string => {
  let state = 2166136261
  for (let index = 0; index < value.length; index++) {
    state ^= value.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  return (state >>> 0).toString(36)
}

export interface Keyframes {
  readonly name: string
  readonly css: string
}

/** Deterministic `@keyframes`: step order is authored, declarations sorted. */
export const keyframes = (
  frames: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Keyframes => {
  const body = Object.entries(frames)
    .map(([step, declarations]) => `${step}{${declarationsText(declarations)}}`)
    .join('')
  const name = `kf-${hash(body)}`
  return Object.freeze({ name, css: `@keyframes ${name}{${body}}` })
}

export const className = (rules: ReadonlyArray<StyleRule>): string =>
  `style-${hash(canonical(rules))}`

const selectorFor = (generated: string, selector: string): string =>
  selectorList(selector)
    .map(part =>
      part.includes('&') ? part.replace(/&/g, `.${generated}`) : `.${generated} ${part}`,
    )
    .join(', ')

/** A `:hover` that is the pseudo-class itself, not the start of a longer name. */
const HOVER = /:hover(?![\w-])/g

/**
 * Matches nothing, with the specificity of `:hover`: what a hover selector becomes where
 * nothing can hover, so the rest of it (`:is(:hover, :focus-within)`'s second branch, a
 * `:not(:hover)`) still means what it says there.
 */
const UNHOVERABLE = ':not(:hover, :not(:hover))'

/**
 * Whether `selector` matches only while something hovers: a `:hover` outside every
 * parenthesis, so no other branch can match without it.
 */
const needsHover = (selector: string): boolean => {
  let depth = 0
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (depth === 0 && selector.startsWith(':hover', index)) {
      const next = selector[index + 6]
      if (next === undefined || !/[\w-]/.test(next)) return true
    }
  }
  return false
}

/**
 * A rule's selectors as written out: as authored where nothing hovers in them; a hover one
 * as authored where the primary pointer can hover, and without its hover where it cannot. A
 * touch screen keeps `:hover` on the last element tapped, so an unguarded hover fill stuck
 * there after the finger left.
 */
const guarded = (
  selectors: ReadonlyArray<string>,
  body: string,
): ReadonlyArray<{ readonly media?: string; readonly text: string }> => {
  const plain = selectors.filter(selector => !selector.match(HOVER))
  const hovering = selectors.filter(selector => selector.match(HOVER))
  const untouched = hovering
    .filter(selector => !needsHover(selector))
    .map(selector => selector.replace(HOVER, UNHOVERABLE))
  return [
    ...(plain.length === 0 ? [] : [{ text: `${plain.join(', ')}${body}` }]),
    ...(hovering.length === 0
      ? []
      : [{ media: '@media (hover: hover)', text: `${hovering.join(', ')}${body}` }]),
    ...(untouched.length === 0
      ? []
      : [{ media: '@media (hover: none)', text: `${untouched.join(', ')}${body}` }]),
  ]
}

/**
 * The declarations as written out, with the prefixed twin a browser still needs beside an
 * unprefixed property: iOS Safari reads only `-webkit-user-select`, so a drag surface's
 * `user-select: none` let a long press select its text there. A twin written by hand stays.
 */
const prefixed = (
  declarations: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> =>
  declarations['userSelect'] === undefined || declarations['WebkitUserSelect'] !== undefined
    ? declarations
    : { ...declarations, WebkitUserSelect: declarations['userSelect'] }

export const css = (generated: string, rules: ReadonlyArray<StyleRule>): string =>
  rules
    .map(entry => {
      const body = `{${declarationsText(prefixed(entry.declarations))}}`
      const selectors = selectorList(selectorFor(generated, entry.selector))
      return guarded(selectors, body)
        .map(({ media, text }) => {
          const scoped = entry.at === undefined ? text : `${entry.at}{${text}}`
          return inLayerText(entry.layer, media === undefined ? scoped : `${media}{${scoped}}`)
        })
        .join('')
    })
    .join('')

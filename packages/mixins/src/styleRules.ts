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

export const css = (generated: string, rules: ReadonlyArray<StyleRule>): string =>
  rules
    .map(entry => {
      const body = `{${declarationsText(entry.declarations)}}`
      const selector = `${selectorFor(generated, entry.selector)}${body}`
      return inLayerText(
        entry.layer,
        entry.at === undefined ? selector : `${entry.at}{${selector}}`,
      )
    })
    .join('')

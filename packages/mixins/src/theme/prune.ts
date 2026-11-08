/**
 * A stylesheet without the `--fk-*` tokens nothing in it reads (#487). The
 * standard theme defines every scale and palette whether a page draws it or
 * not; most of a sheet's bytes are those definitions.
 *
 * A token is kept when a declaration that is not a token's own reads it, when
 * a kept token reads it, or when `keep` names it. Reads outside the sheet are
 * what `keep` is for: an inline style built with `Theme.ref`, a script reading
 * a computed value. `Inert.missingTokens` over the pruned sheet finds a token a
 * drawn view reads that pruning took away.
 */

const TOKEN = /--fk-[\w-]+/g
const READ = /var\(\s*(--fk-[\w-]+)/g

/** Read by name at run time, not through a rule: `messageScroller.ts`. */
const READ_BY_SCRIPT = ['--fk-knob-travel', '--fk-knob-motion']

interface Definition {
  readonly name: string
  /** From the name to the end of the value, the `;` after it included. */
  readonly start: number
  readonly end: number
  readonly value: string
}

/** Where the value starting at `from` ends: the `;` or `}` outside parentheses and strings. */
const valueEnd = (css: string, from: number): number => {
  let depth = 0
  let quote = ''
  for (let at = from; at < css.length; at++) {
    const char = css[at]
    if (quote !== '') {
      if (char === '\\') at++
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')') depth--
    else if (depth === 0 && (char === ';' || char === '}')) return at
  }
  return css.length
}

/** Each `--fk-*` declaration, found where a declaration can start: after `{` or `;`. */
const definitions = (css: string): ReadonlyArray<Definition> =>
  Array.from(css.matchAll(/(?<=[{;]\s*)(--fk-[\w-]+)\s*:/g), match => {
    const valueStart = match.index + match[0].length
    const end = valueEnd(css, valueStart)
    return {
      name: match[1] ?? '',
      start: match.index,
      end: css[end] === ';' ? end + 1 : end,
      value: css.slice(valueStart, end),
    }
  })

/** `@property --fk-x { … }` registrations. */
const registrations = (css: string) =>
  Array.from(css.matchAll(/@property\s+(--fk-[\w-]+)\s*\{[^}]*\}/g), match => ({
    name: match[1] ?? '',
    start: match.index,
    end: match.index + match[0].length,
  }))

const readsOf = (text: string): ReadonlyArray<string> =>
  Array.from(text.matchAll(READ), ([, name]) => name ?? '')

/**
 * `css` without the token definitions and `@property` registrations of tokens
 * nothing reads. Each `keep` entry names a token, as `--fk-x` or as
 * `Theme.ref` writes it (`var(--fk-x)`); an entry naming none throws.
 */
export const prune = (
  css: string,
  options: { readonly keep?: ReadonlyArray<string> | undefined } = {},
): string => {
  const kept = new Set(READ_BY_SCRIPT)
  for (const entry of options.keep ?? []) {
    const names = entry.match(TOKEN)
    if (names === null) throw new Error(`Theme.prune: keep entry "${entry}" names no --fk- token`)
    for (const name of names) kept.add(name)
  }
  const defined = definitions(css)
  const registered = registrations(css)
  const cut = [...defined, ...registered].sort((a, b) => a.start - b.start)
  let outside = ''
  let at = 0
  for (const span of cut) {
    outside += css.slice(at, span.start)
    at = span.end
  }
  outside += css.slice(at)
  for (const name of readsOf(outside)) kept.add(name)

  const valuesOf = new Map<string, Array<string>>()
  for (const definition of defined) {
    const values = valuesOf.get(definition.name)
    if (values === undefined) valuesOf.set(definition.name, [definition.value])
    else values.push(definition.value)
  }
  const pending = [...kept]
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    for (const value of valuesOf.get(name) ?? []) {
      for (const read of readsOf(value)) {
        if (!kept.has(read)) {
          kept.add(read)
          pending.push(read)
        }
      }
    }
  }

  let pruned = ''
  at = 0
  for (const span of cut) {
    if (kept.has(span.name)) continue
    pruned += css.slice(at, span.start)
    at = span.end
  }
  return pruned + css.slice(at)
}

/**
 * What an inline style property really writes, so one owner and one
 * protection hold however it is spelled. Internal: not exported from the
 * package.
 *
 * Two names overlap when they write one declaration (`insetInlineEnd` and
 * `inset-inline-end`), when one is a shorthand that sets the other (`inset`,
 * `insetInline` and `margin` over their sides), when a physical side can be
 * the logical one (`right` is `insetInlineEnd` in a left-to-right line, and
 * `left` in a right-to-left one), or when one moves what the other does
 * (`translate`, `rotate` and `scale` beside `transform`). Sides are read for
 * a horizontal writing mode: `insetBlockStart` is `top`.
 */

const ASCII_UPPER = /[A-Z]/g

/**
 * The CSS declaration Foldkit writes for a `Style` key: `cssDeclarationName`
 * in `foldkit/dist/domReflection.js`, which is not exported.
 */
export const declarationName = (name: string): string => {
  if (name.startsWith('--')) return name
  if (name === 'cssFloat') return 'float'
  const canonical = name.startsWith('Webkit') ? `webkit${name.slice('Webkit'.length)}` : name
  const kebab = canonical.replace(ASCII_UPPER, letter => `-${letter}`).toLowerCase()
  return kebab.startsWith('webkit-') || kebab.startsWith('ms-') ? `-${kebab}` : kebab
}

/**
 * Shorthands, and the names that extend them without being their longhands.
 * A name not listed here (`position`, `color`, `transform`) sets only itself,
 * so `positionAnchor` and `transformOrigin` stand apart from it.
 */
const SHORTHANDS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  (
    [
      ['inset'],
      ['margin'],
      ['padding'],
      ['scroll-margin'],
      ['scroll-padding'],
      ['border', 'border-collapse', 'border-spacing'],
      ['outline', 'outline-offset'],
      ['overflow', 'overflow-wrap', 'overflow-anchor', 'overflow-clip-margin'],
      ['background'],
      ['font'],
      ['grid'],
      ['flex'],
      ['transition'],
      ['animation'],
      ['list-style'],
      ['columns'],
      ['column-rule'],
      ['text-decoration'],
      ['mask'],
      ['offset'],
      ['container'],
    ] as const
  ).map(([root, ...apart]) => [root, new Set<string>(apart)]),
)

/** Shorthands whose longhands do not extend their name. */
const COVERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['gap', ['row-gap', 'column-gap']],
  ['place-items', ['align-items', 'justify-items']],
  ['place-content', ['align-content', 'justify-content']],
  ['place-self', ['align-self', 'justify-self']],
  ['flex-flow', ['flex-direction', 'flex-wrap']],
  // Not a shorthand: composed with `transform`, each moves the element too.
  ['transform', ['translate', 'rotate', 'scale']],
])

/** A side and the sides it can be: `left` is the inline start or end, by direction. */
const SIDES: ReadonlyArray<readonly [RegExp, ReadonlyArray<string>]> = [
  [/(^|-)(left|right)(?=-|$)/, ['inline-start', 'inline-end']],
  [/(^|-)top(?=-|$)/, ['block-start']],
  [/(^|-)bottom(?=-|$)/, ['block-end']],
  [/(^|-)inline(?=-|$)(?!-(start|end))/, ['inline-start', 'inline-end']],
  [/(^|-)block(?=-|$)(?!-(start|end))/, ['block-start', 'block-end']],
]

const INSET_SIDES = new Set(['top', 'right', 'bottom', 'left'])

/** The logical declarations a name writes, its physical sides read both ways. */
const writes = (declaration: string): ReadonlyArray<string> => {
  // `top` is the inset's side, as `margin-top` is the margin's.
  const named = INSET_SIDES.has(declaration) ? `inset-${declaration}` : declaration
  const out = [named]
  for (const [side, logical] of SIDES) {
    if (side.test(named)) {
      for (const name of logical) out.push(named.replace(side, `$1${name}`))
    }
  }
  return out
}

/** `border-width` sets `border-top-width`, and `border-radius` `border-top-left-radius`. */
const BORDER_PART = /^border-(width|style|color|radius)$/

const covers = (shorthand: string, longhand: string): boolean => {
  if (COVERS.get(shorthand)?.includes(longhand)) return true
  const part = BORDER_PART.exec(shorthand)?.[1]
  if (part !== undefined) return longhand.startsWith('border-') && longhand.endsWith(`-${part}`)
  const prefix = shorthand.split('-')[0]!
  const apart = SHORTHANDS.get(prefix)
  if (apart === undefined || apart.has(longhand)) return false
  // `margin` sets `margin-top`; `margin-inline` sets `margin-inline-start`.
  return longhand.startsWith(`${shorthand}-`)
}

/** Whether writing `a` changes what `b` sets: one declaration, a shorthand of it, or its side. */
export const overlaps = (a: string, b: string): boolean => {
  const left = writes(declarationName(a))
  const right = writes(declarationName(b))
  return left.some(x => right.some(y => x === y || covers(x, y) || covers(y, x)))
}

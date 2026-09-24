/**
 * Cascade layers as a value. `define` names an order; the result declares
 * it (`declare`) and places a piece in one of its layers (`in`), typed to
 * those names so a misspelled layer is a type error. `standard` is the
 * order a design system built on the `/theme`, `/layout`, `/defaults`, and
 * `/prose` subpaths expects; the pieces those ship are unlayered until a
 * page wraps them, so a different order needs no different generators.
 */
import { DiagnosticError } from './diagnostics.js'
import type { StyleValue } from './styleValue.js'

export interface Layers<Name extends string> {
  readonly names: ReadonlyArray<Name>
  /** The `@layer a, b, c;` statement as a global piece; `Style.stylesheet` hoists it first. */
  readonly declare: StyleValue
  /** The piece's rules and global CSS emitted inside `@layer name`. */
  readonly in: (name: Name, piece: StyleValue) => StyleValue
}

const place = (name: string, piece: StyleValue): StyleValue =>
  Object.freeze({
    ...piece,
    ...(piece.rules === undefined
      ? {}
      : { rules: Object.freeze(piece.rules.map(rule => ({ ...rule, layer: name }))) }),
    ...(piece.globalCss === undefined
      ? {}
      : { globalCss: Object.freeze(piece.globalCss.map(css => `@layer ${name}{${css}}`)) }),
    ...(piece.conditions === undefined
      ? {}
      : {
          conditions: Object.freeze(
            piece.conditions.map(condition => ({
              predicate: condition.predicate,
              piece: place(name, condition.piece),
            })),
          ),
        }),
  })

export const define = <const Name extends string>(names: ReadonlyArray<Name>): Layers<Name> => {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) {
      throw new DiagnosticError({
        source: 'style',
        code: 'style:duplicate-layer',
        severity: 'error',
        message: `Layers.define names "${name}" twice`,
      })
    }
    seen.add(name)
  }
  return Object.freeze({
    names: Object.freeze([...names]),
    declare: Object.freeze({
      classes: Object.freeze([]),
      style: Object.freeze({}),
      globalCss: Object.freeze([`@layer ${names.join(', ')};`]),
    }),
    in: place,
  })
}

/**
 * The shipped order. `reset` normalizes; `tokens` holds the scales that do
 * not change per theme; `theme` the knobs and what derives from them, plus
 * scoped overrides; `defaults` element defaults; then a design system's
 * `components`, `layouts` (after components, so a wrapper never beats a
 * component's inner rule), a recipe's `variants`, `utilities`, and the
 * application's `app`, always last.
 */
export const standard = define([
  'reset',
  'tokens',
  'theme',
  'defaults',
  'components',
  'layouts',
  'variants',
  'utilities',
  'app',
])

export const Layers = { define, standard } as const

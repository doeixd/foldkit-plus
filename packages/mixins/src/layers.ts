/**
 * Cascade layers as a value. `define` names an order; the result declares
 * it (`declare`) and places a piece in one of its layers (`in`), typed to
 * those names so a misspelled layer is a type error. `standard` is the
 * order a design system built on the `/theme`, `/layout`, `/defaults`, and
 * `/prose` subpaths expects; the pieces those ship are unlayered until a
 * page wraps them, so a different order needs no different generators.
 */
import { isLayerStatement, layerOf, topLevelBlocks } from './cssBlocks.js'
import { DiagnosticError } from './diagnostics.js'
import type { SlotItem } from './slotItem.js'
import type { StyleRule } from './styleRules.js'
import type { StyleValue } from './styleValue.js'

/**
 * One layer of one order, for `Style.forSlots(S)(pieces, { layer })`: every
 * piece is placed before it is compiled, so the style a view attaches and the
 * style a sheet ships are the same value with the same classes. A piece
 * already in another layer keeps it and is not refused, because a slot piece
 * that is only a layered layout or recipe is ordinary.
 */
export interface Placement<Name extends string = string> {
  readonly layer: Name
  readonly place: (piece: StyleValue) => StyleValue
}

export interface Layers<Name extends string> {
  readonly names: ReadonlyArray<Name>
  /** The `@layer a, b, c;` statement as a global piece; `Style.stylesheet` hoists it first. */
  readonly declare: StyleValue
  /**
   * The piece's unlayered rules and global CSS emitted inside `@layer name`,
   * including rules under `whenInput` and per-item pieces. A rule or block
   * already in a layer keeps it, so a design system's layered layout composed
   * into an application style stays in `layouts`. A piece with nothing
   * unlayered but something in another layer is refused with
   * `style:relayered`, since the call would move nothing. A slot style is
   * layered where it is defined, with `layer`, not here: placing a finished
   * style would copy it under new classes that no view attaches.
   */
  readonly in: (name: Name, piece: StyleValue) => StyleValue
  /** The placement `Style.forSlots` takes as its `layer` option. */
  readonly layer: (name: Name) => Placement<Name>
}

/** What one `in` call placed, and which other layers it left in place. */
interface Tally {
  placed: number
  readonly kept: Set<string>
}

const tally = (): Tally => ({ placed: 0, kept: new Set() })

const placeRule = (name: string, rule: StyleRule, count: Tally): StyleRule => {
  if (rule.layer !== undefined && rule.layer !== name) {
    count.kept.add(rule.layer)
    return rule
  }
  count.placed++
  return rule.layer === name ? rule : { ...rule, layer: name }
}

/** Runs of unlayered blocks go into one `@layer name{…}`; layered blocks and statements stay. */
const placeGlobal = (name: string, css: string, count: Tally): string => {
  const out: Array<string> = []
  let pending = ''
  const flush = (): void => {
    if (pending !== '') out.push(`@layer ${name}{${pending}}`)
    pending = ''
  }
  for (const block of topLevelBlocks(css)) {
    const layer = layerOf(block)
    if (isLayerStatement(block)) {
      flush()
      out.push(block.text)
    } else if (layer === undefined) {
      pending += block.text
      count.placed++
    } else {
      flush()
      out.push(block.text)
      if (layer === name) count.placed++
      else count.kept.add(layer)
    }
  }
  flush()
  return out.join('')
}

const place = (name: string, piece: StyleValue, count: Tally): StyleValue =>
  Object.freeze({
    ...piece,
    ...(piece.rules === undefined
      ? {}
      : { rules: Object.freeze(piece.rules.map(rule => placeRule(name, rule, count))) }),
    ...(piece.globalCss === undefined
      ? {}
      : { globalCss: Object.freeze(piece.globalCss.map(css => placeGlobal(name, css, count))) }),
    ...(piece.conditions === undefined
      ? {}
      : {
          conditions: Object.freeze(
            piece.conditions.map(condition => ({
              predicate: condition.predicate,
              piece: place(name, condition.piece, count),
            })),
          ),
        }),
    ...(piece.items === undefined
      ? {}
      : {
          // Rendered per item, after `in` returned: nothing to refuse by then.
          items: Object.freeze(
            piece.items.map(
              render => (item: SlotItem | undefined) => place(name, render(item), tally()),
            ),
          ),
        }),
  })

const refuseRelayer = (name: string, count: Tally): void => {
  if (count.placed > 0 || count.kept.size === 0) return
  const layers = [...count.kept]
  throw new DiagnosticError({
    source: 'style',
    code: 'style:relayered',
    severity: 'error',
    message: `Layers.in("${name}", …) was given a piece already in layer ${layers.map(layer => `"${layer}"`).join(', ')}; a layered rule keeps its layer, so nothing would move. Place the unlayered piece instead.`,
    details: { layer: name, kept: layers },
  })
}

const placeIn = (name: string, piece: StyleValue): StyleValue => {
  const count = tally()
  const placed = place(name, piece, count)
  refuseRelayer(name, count)
  return placed
}

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
    in: placeIn,
    layer: (name: Name): Placement<Name> =>
      Object.freeze({ layer: name, place: (piece: StyleValue) => place(name, piece, tally()) }),
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

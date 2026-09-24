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
 * A style that rebuilds itself with every piece transformed, such as a
 * `NamedStyle`; `Layers.in` places each of its pieces and gets the same kind
 * of style back.
 */
export interface MapsPieces<Self> {
  readonly mapPieces: (transform: (piece: StyleValue) => StyleValue) => Self
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
   * `style:relayered`, since the call would move nothing. A `NamedStyle` is
   * placed piece by piece and never refused, so a page can put every style
   * in `app` in one pass whatever each already holds.
   */
  readonly in: {
    (name: Name, piece: StyleValue): StyleValue
    <Style extends MapsPieces<Style>>(name: Name, style: Style): Style
  }
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

function placeIn(name: string, piece: StyleValue): StyleValue
function placeIn<Style extends MapsPieces<Style>>(name: string, style: Style): Style
function placeIn(name: string, value: StyleValue | MapsPieces<unknown>): unknown {
  if ('mapPieces' in value) return value.mapPieces(piece => place(name, piece, tally()))
  const count = tally()
  const placed = place(name, value, count)
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

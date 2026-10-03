import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import type { KeyboardModifiers } from 'foldkit/html'
import type { Direction } from './focus.js'
import type { CellAddress, CellBox, GridProjection } from './projection.js'

/**
 * Which rows are selected. `Keys` names them; `AllExcept` is every row but
 * these, so select-all holds whatever the rows are, loaded or not, and
 * however many there turn out to be.
 */
export const RowSelection = defineTaggedUnion({
  Keys: { keys: Schema.Array(Schema.String) },
  AllExcept: { except: Schema.Array(Schema.String) },
})
export type RowSelection = typeof RowSelection.Type

const none = RowSelection.Keys({ keys: [] })

// One lookup per selection value, so drawing a window of rows asks a Set.
const lookups = new WeakMap<RowSelection, (key: string) => boolean>()

/** Whether a row is selected. Call it once per selection: it indexes the keys. */
const isSelected = (selection: RowSelection): ((key: string) => boolean) => {
  const cached = lookups.get(selection)
  if (cached !== undefined) return cached
  const lookup = RowSelection.match(selection, {
    Keys: ({ keys }) => {
      const set = new Set(keys)
      return (key: string) => set.has(key)
    },
    AllExcept: ({ except }) => {
      const set = new Set(except)
      return (key: string) => !set.has(key)
    },
  })
  lookups.set(selection, lookup)
  return lookup
}

/** Selects a row, or deselects it if it is selected. */
const toggle = (selection: RowSelection, key: string): RowSelection => {
  const selected = isSelected(selection)(key)
  return RowSelection.match(selection, {
    Keys: ({ keys }) =>
      RowSelection.Keys({ keys: selected ? keys.filter(each => each !== key) : [...keys, key] }),
    AllExcept: ({ except }) =>
      RowSelection.AllExcept({
        except: selected ? [...except, key] : except.filter(each => each !== key),
      }),
  })
}

/** Selects every row in `keys`, keeping what was selected. */
const add = (selection: RowSelection, keys: ReadonlyArray<string>): RowSelection => {
  const selected = isSelected(selection)
  const fresh = keys.filter(key => !selected(key))
  if (fresh.length === 0) return selection
  return RowSelection.match(selection, {
    Keys: ({ keys: held }) => RowSelection.Keys({ keys: [...held, ...new Set(fresh)] }),
    AllExcept: ({ except }) => {
      const adding = new Set(fresh)
      return RowSelection.AllExcept({ except: except.filter(key => !adding.has(key)) })
    },
  })
}

/** The keys of the rows from `from` to `to`, in the projection's order, both included. */
const rowsBetween = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  from: string,
  to: string,
): ReadonlyArray<string> => {
  const keys: Array<string> = []
  const ends = Option.all([projection.rowIndex(from), projection.rowIndex(to)])
  if (Option.isNone(ends)) return keys
  const [a, b] = ends.value
  for (let index = Math.min(a, b); index <= Math.max(a, b); index++) {
    const key = projection.rows.keyAt(index)
    if (Option.isSome(key)) keys.push(key.value)
  }
  return keys
}

/** A rectangle of cells, named by its corners, so it survives a re-sort as two cells. */
export interface CellRange<Id extends string> {
  readonly anchor: CellAddress<Id>
  readonly focus: CellAddress<Id>
}

/** The cells a range covers now, or none when a corner is hidden or gone. */
const boxOf = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  range: CellRange<Id>,
): Option.Option<CellBox<Id>> => projection.box(range.anchor, range.focus)

export interface ExtendOptions<Id extends string> {
  readonly range: Option.Option<CellRange<Id>>
  /** The focused cell: a range grows from it when there is none. */
  readonly current: Option.Option<CellAddress<Id>>
  readonly key: string
  readonly modifiers: KeyboardModifiers
  readonly pageRows: number
  readonly direction?: Direction
}

const arrows: ReadonlyMap<string, { readonly rows: number; readonly columns: number }> = new Map([
  ['ArrowUp', { rows: -1, columns: 0 }],
  ['ArrowDown', { rows: 1, columns: 0 }],
  ['ArrowLeft', { rows: 0, columns: -1 }],
  ['ArrowRight', { rows: 0, columns: 1 }],
])

/** Where a Shift key takes a range's far corner, or none when it is not such a key. */
const farCorner = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  focus: CellAddress<Id>,
  options: ExtendOptions<Id>,
): Option.Option<Option.Option<CellAddress<Id>>> => {
  const step = arrows.get(options.key)
  if (step !== undefined) {
    const flip = options.direction === 'rtl' ? -1 : 1
    return Option.some(projection.moveBy(focus, { rows: step.rows, columns: step.columns * flip }))
  }
  const moves: Readonly<Record<string, () => Option.Option<CellAddress<Id>>>> = {
    PageDown: () => projection.moveBy(focus, { rows: options.pageRows }),
    PageUp: () => projection.moveBy(focus, { rows: -options.pageRows }),
    Home: () => projection.rowStart(focus),
    End: () => projection.rowEnd(focus),
  }
  return Object.hasOwn(moves, options.key) ? Option.some(moves[options.key]!()) : Option.none()
}

/**
 * The range a Shift key makes, or none when the key is not one: Shift with an
 * arrow moves the range's far corner a cell, with PageUp or PageDown a page,
 * with Home or End to the row's edge. The near corner stays where the range
 * began, the focused cell when there was none. As with focus, a key the grid
 * handles always lands: at an edge, or before a row not loaded, the range
 * stays as it is.
 */
const extend = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  options: ExtendOptions<Id>,
): Option.Option<CellRange<Id>> => {
  const { modifiers } = options
  if (!modifiers.shiftKey || modifiers.altKey || modifiers.metaKey || modifiers.ctrlKey) {
    return Option.none()
  }
  const start = Option.orElse(options.range, () =>
    Option.map(options.current, current => ({ anchor: current, focus: current })),
  )
  return Option.flatMap(start, range =>
    Option.map(farCorner(projection, range.focus, options), to =>
      Option.match(to, {
        onNone: () => range,
        onSome: focus => ({ anchor: range.anchor, focus }),
      }),
    ),
  )
}

export const GridSelection = { none, isSelected, toggle, add, rowsBetween, boxOf, extend }

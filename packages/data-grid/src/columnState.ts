import { Option, Schema } from 'effect'
import { Columns, type ColumnSpec } from './columns.js'
import { ColumnLayout } from './layout.js'

export type Region = 'start' | 'center' | 'end'

const regions: ReadonlyArray<Region> = ['start', 'center', 'end']

/**
 * Where each column stands and how wide the resized ones are. Widths list only
 * the columns resized; the rest take their spec's. The grid owns it, and it is
 * plain data, so an application can save it and restore it.
 */
export interface ColumnState<Id extends string> extends ColumnLayout<Id> {
  readonly widths: ReadonlyArray<{ readonly column: Id; readonly width: number }>
}

/** What `restore` made of a saved state: the state, and the ids it had to drop. */
export interface Restored<Id extends string> {
  readonly state: ColumnState<Id>
  /** Ids the saved state named that these columns do not define, or named twice. */
  readonly dropped: ReadonlyArray<string>
}

const Saved = Schema.Struct({
  start: Schema.Array(Schema.String),
  center: Schema.Array(Schema.String),
  end: Schema.Array(Schema.String),
  hidden: Schema.Array(Schema.String),
  widths: Schema.Array(Schema.Struct({ column: Schema.String, width: Schema.Number })),
})

const without = <Id extends string>(ids: ReadonlyArray<Id>, id: Id): ReadonlyArray<Id> =>
  ids.filter(each => each !== id)

/**
 * Column state for one grid's columns: its Schema, which decodes only these
 * columns' ids, and the operations a grid's Messages run. Every operation
 * returns the state it was given when it changes nothing, so a no-op draws
 * nothing.
 */
const make = <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(
  columns: Columns<Row, Specs>,
) => {
  type Id = keyof Specs & string
  type State = ColumnState<Id>
  const Ids = Schema.Literals(columns.ids)
  const Model = Schema.Struct({
    start: Schema.Array(Ids),
    center: Schema.Array(Ids),
    end: Schema.Array(Ids),
    hidden: Schema.Array(Ids),
    widths: Schema.Array(Schema.Struct({ column: Ids, width: Schema.Number })),
  })

  const spec = (id: Id) => columns.byId[id]
  const isColumn = (id: string): id is Id => Object.hasOwn(columns.byId, id)
  const clampWidth = (id: Id, width: number): number => {
    const { minWidth = Columns.minWidth, maxWidth = Number.POSITIVE_INFINITY } = spec(id)
    return Math.min(Math.max(width, minWidth), maxWidth)
  }

  const initial = (): State => ({ ...ColumnLayout.initial(columns), widths: [] })

  /** The width each column is drawn at: its resize, else its spec's. Call once per state. */
  const widthOf = (state: State): ((id: Id) => number) => {
    const resized = new Map(state.widths.map(entry => [entry.column, entry.width]))
    return id => resized.get(id) ?? spec(id).width ?? Columns.defaultWidth
  }

  const regionOf = (state: State, id: Id): Region =>
    regions.find(region => state[region].includes(id)) ?? 'center'

  /** Resizes a resizable column, within its `minWidth` and `maxWidth`. */
  const resize = (state: State, id: Id, width: number): State => {
    if (spec(id).resizable === false || !Number.isFinite(width)) return state
    const clamped = clampWidth(id, width)
    if (clamped === widthOf(state)(id)) return state
    return {
      ...state,
      widths: [
        ...state.widths.filter(entry => entry.column !== id),
        { column: id, width: clamped },
      ],
    }
  }

  const visibleCount = (state: State): number => {
    const hidden = new Set(state.hidden)
    return regions.reduce(
      (count, region) => count + state[region].filter(id => !hidden.has(id)).length,
      0,
    )
  }

  /** Hides a hideable column; the last one shown stays, so the grid keeps a cell to focus. */
  const hide = (state: State, id: Id): State => {
    if (spec(id).hideable === false || state.hidden.includes(id) || visibleCount(state) <= 1) {
      return state
    }
    return { ...state, hidden: [...state.hidden, id] }
  }

  const show = (state: State, id: Id): State =>
    state.hidden.includes(id) ? { ...state, hidden: without(state.hidden, id) } : state

  /**
   * Moves a column to `index` among the columns of `region`, counted with it
   * removed: a reorder within its region, or a pin or an unpin across them.
   */
  const move = (state: State, id: Id, region: Region, index: number): State => {
    const from = regionOf(state, id)
    const target = without(state[region], id)
    const at = Math.min(Math.max(0, Math.trunc(index)), target.length)
    if (from === region && state[region].indexOf(id) === at) return state
    const placed = [...target.slice(0, at), id, ...target.slice(at)]
    return { ...state, [from]: without(state[from], id), [region]: placed }
  }

  /**
   * A saved state read back leniently: an id these columns no longer define,
   * or one named twice, is dropped and listed; a column the save predates
   * takes its initial place; a width is clamped to its column's limits.
   * Input that is not a saved state at all is the initial state, with nothing
   * dropped, since nothing was read.
   */
  const restore = (saved: unknown): Restored<Id> =>
    Option.match(Schema.decodeUnknownOption(Saved)(saved), {
      onNone: () => ({ state: initial(), dropped: [] }),
      onSome: value => {
        const dropped: Array<string> = []
        const saved = new Set<Id>()
        const keep = (ids: ReadonlyArray<string>): Array<Id> =>
          ids.filter((id): id is Id => {
            if (!isColumn(id) || saved.has(id)) {
              dropped.push(id)
              return false
            }
            saved.add(id)
            return true
          })
        const placed = {
          start: keep(value.start),
          center: keep(value.center),
          end: keep(value.end),
        }
        // A column the save predates takes its initial region and visibility.
        const fresh = initial()
        for (const region of regions) {
          for (const id of fresh[region]) if (!saved.has(id)) placed[region].push(id)
        }
        const hidden = new Set<Id>(fresh.hidden.filter(id => !saved.has(id)))
        for (const id of value.hidden) if (isColumn(id)) hidden.add(id)
        const widths = new Map<Id, number>()
        for (const entry of value.widths) {
          if (isColumn(entry.column) && Number.isFinite(entry.width)) {
            widths.set(entry.column, clampWidth(entry.column, entry.width))
          }
        }
        return {
          state: {
            ...placed,
            hidden: [...hidden],
            widths: [...widths].map(([column, width]) => ({ column, width })),
          },
          dropped,
        }
      },
    })

  return { Model, initial, widthOf, resize, hide, show, move, restore }
}

export const ColumnState = { make }

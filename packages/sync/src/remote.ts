/**
 * `foldkit-sync/remote`: a slice's cell edits shown through Remote, as
 * request-less overlays every read draws, until the row Remote holds has them.
 *
 * ```text
 * cell shown = Remote's row, with each edit over it the row has not reached:
 *              one pending, one committed after the row's revision, or one
 *              the journal absorbed while the cached row is still below it
 * ```
 *
 * Remote keeps the overlays; the slice stays the only copy of the edits. An
 * overlay is not stored, so after a reload `reconcile` rebuilds them from the
 * slice the replica restored. What an edit absorbed and dropped from the slice
 * still owes a cached row is held as an overlay, not in the application's
 * Model, so every view of the row (a second list, a filter, an undo's reading
 * of the page) sees what the page shows.
 *
 * Pure, like `foldkit-sync/entity`: it reads and writes the Model it is given
 * and sends nothing.
 */
import { Equal, Option, Schema } from 'effect'
import { entityKey, readField, type OptimisticOperation, type RemoteModel } from 'foldkit-remote'
import type { Author } from './entity.js'

/** What `RemoteEdits.make` uses of a Remote domain: `Remote.make`'s value is one. */
export interface RemoteOverlays<AppModel> {
  readonly store: { get(model: AppModel): RemoteModel }
  overlay(model: AppModel, id: string, optimistic: ReadonlyArray<OptimisticOperation>): AppModel
  lift(model: AppModel, id: string): AppModel
  overlays(model: AppModel): ReadonlyArray<string>
}

/** What `RemoteEdits.make` uses of `EditableEntity.make`'s value, over a named Entity. */
export interface EditsOf<Edit> {
  readonly entity: { readonly name: string }
  readonly Edit: Schema.Codec<Edit, unknown>
  mine(edit: Edit, replica: string): boolean
}

/** The fields every cell edit has, as `EditableEntity`'s `Edit` declares them. */
interface AnyEdit {
  readonly member: string
  readonly at: Option.Option<number>
  readonly by: Option.Option<Author>
}

/** An edit as the store holds it: the encoded id, member and value. */
const Encoded = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Number]),
  member: Schema.String,
  value: Schema.Unknown,
})

/** A cell an overlay draws, and whether its edit is still in the slice or only held. */
export interface ShownEdit<Edit> {
  readonly edit: Edit
  /** Absorbed from the slice, and shown until a read of its row has it. */
  readonly held: boolean
}

/** What `reconcile` did besides the Model. */
export interface Reconciled<AppModel, Edit> {
  readonly model: AppModel
  /**
   * Edits the journal absorbed that a cached row has not been read since. The
   * row is out of date until it is: ask for it again, unless a live stream
   * brings it.
   */
  readonly held: ReadonlyArray<Edit>
  /**
   * `replica`'s own edits a read of their row reached with another value: the
   * table applies in commit order, so a later edit replaced them. The slice
   * may say whose later, or may not yet; this is the row saying it.
   */
  readonly replaced: ReadonlyArray<Edit>
}

const make = <AppModel, Edit extends AnyEdit>(
  data: RemoteOverlays<AppModel>,
  edits: EditsOf<Edit>,
) => {
  const entity = edits.entity.name
  const encode = Schema.encodeSync(edits.Edit)
  const decode = Schema.decodeUnknownOption(edits.Edit)
  const decodeEncoded = Schema.decodeUnknownSync(Encoded)
  // Named by the Entity, so a bridge over another one never reads these back.
  const SHOWN = `sync-edit:${entity}:`
  const HELD = `sync-held:${entity}:`

  // The overlay's id is the edit itself, encoded: the same edit keeps its
  // overlay, and another edit of the cell is another overlay.
  const keyOf = (edit: Edit) => JSON.stringify(encode(edit))
  const encodedOf = (edit: Edit) => decodeEncoded(encode(edit))
  const rowKey = (edit: Edit) => entityKey(entity, String(encodedOf(edit).id))
  const cellOf = (edit: Edit) => `${rowKey(edit)}\u0000${edit.member}`

  /** The edits this bridge shows, by overlay id, read back from Remote's overlays. */
  const shownIn = (model: AppModel) =>
    data.overlays(model).flatMap(id => {
      const held = id.startsWith(HELD)
      if (!held && !id.startsWith(SHOWN)) return []
      const key = id.slice((held ? HELD : SHOWN).length)
      return Option.match(Option.flatMap(Option.liftThrowable(JSON.parse)(key), decode), {
        onNone: () => [],
        onSome: edit => [{ id, key, edit, held }],
      })
    })

  /** The revision Remote holds for the edit's row; none when the row is not cached. */
  const revisionOf = (remote: RemoteModel, edit: Edit): Option.Option<number> =>
    Option.filter(readField(remote.entities, rowKey(edit), 'revision'), Schema.is(Schema.Number))
  const reached = (remote: RemoteModel, edit: Edit) =>
    Option.exists(edit.at, at =>
      Option.exists(revisionOf(remote, edit), revision => at <= revision),
    )

  // Reconciling runs after every update; what it depends on rarely changes, so
  // the inputs it last left in line are kept by identity and a repeat is free.
  let settled:
    | {
        readonly entities: RemoteModel['entities']
        readonly optimistic: RemoteModel['optimistic']
        readonly slice: ReadonlyArray<Edit>
        readonly replica: string
      }
    | undefined

  /** Whether the row Remote holds has the edit's value in its cell. */
  const holdsValue = (remote: RemoteModel, edit: Edit) =>
    Equal.equals(
      readField(remote.entities, rowKey(edit), edit.member),
      Option.some(encodedOf(edit).value),
    )

  const patchOf = (edit: Edit): OptimisticOperation => {
    const { id, member, value } = encodedOf(edit)
    return { entity, id: String(id), values: { [member]: value } }
  }

  return {
    /**
     * Brings Remote's overlays in line with `slice`: each edit its row has not
     * reached is shown, and each overlay whose edit has left the slice is
     * lifted, unless its row is cached below it, in which case it is held
     * until a read of the row reaches it. Call it from `update` after every
     * transition, since a read can land in any Remote Message, and from the
     * mount's `onReinstall`, which replaces the slice. With nothing to change,
     * the Model comes back as it was given.
     */
    reconcile: (
      model: AppModel,
      slice: ReadonlyArray<Edit>,
      replica: string,
    ): Reconciled<AppModel, Edit> => {
      const remote = data.store.get(model)
      if (
        settled !== undefined &&
        settled.entities === remote.entities &&
        settled.optimistic === remote.optimistic &&
        settled.slice === slice &&
        settled.replica === replica
      ) {
        return { model, held: [], replaced: [] }
      }
      const inSlice = new Map(slice.map(edit => [keyOf(edit), edit]))
      const edited = new Set(slice.map(cellOf))
      const held: Array<Edit> = []
      const replaced: Array<Edit> = []
      let next = model
      for (const shown of shownIn(model)) {
        const reachedNow = reached(remote, shown.edit)
        const differs = reachedNow && !holdsValue(remote, shown.edit)
        if (!shown.held && inSlice.has(shown.key)) {
          inSlice.delete(shown.key)
          // Kept while the row is below it, and, landed, while it is this
          // replica's and the row still holds it: a later edit that reaches the
          // row live is then seen replacing it, though the slice may never say.
          if (!reachedNow || (!differs && edits.mine(shown.edit, replica))) continue
          next = data.lift(next, shown.id)
          if (differs && edits.mine(shown.edit, replica)) replaced.push(shown.edit)
          continue
        }
        // Held only while nothing in the slice edits the cell and the cached
        // row is below the commit; a later edit of the cell takes its place.
        const holds =
          !edited.has(cellOf(shown.edit)) &&
          Option.isSome(shown.edit.at) &&
          Option.isSome(revisionOf(remote, shown.edit)) &&
          !reached(remote, shown.edit)
        if (holds && shown.held) continue
        next = data.lift(next, shown.id)
        if (holds) {
          next = data.overlay(next, `${HELD}${shown.key}`, [patchOf(shown.edit)])
          held.push(shown.edit)
        } else if (differs && edits.mine(shown.edit, replica)) {
          replaced.push(shown.edit)
        }
      }
      for (const [key, edit] of inSlice) {
        if (!reached(remote, edit)) next = data.overlay(next, `${SHOWN}${key}`, [patchOf(edit)])
      }
      settled = {
        entities: remote.entities,
        optimistic: data.store.get(next).optimistic,
        slice,
        replica,
      }
      return { model: next, held, replaced }
    },

    /**
     * The edits the overlays show over their rows now, in the order they are
     * drawn: for a cell's mark. One the row has reached, kept only to see a
     * later edit replace it, is not among them.
     */
    shown: (model: AppModel): ReadonlyArray<ShownEdit<Edit>> => {
      const remote = data.store.get(model)
      return shownIn(model).flatMap(({ edit, held }) =>
        reached(remote, edit) ? [] : [{ edit, held }],
      )
    },

    /**
     * Lifts every overlay this bridge shows: for a server reset, after which
     * the rows' revisions count a history that is gone.
     */
    clear: (model: AppModel): AppModel =>
      shownIn(model).reduce((next, shown) => data.lift(next, shown.id), model),
  }
}

export const RemoteEdits = {
  /**
   * The bridge between a slice of `EditableEntity` edits and a Remote domain
   * that reads the same Entity, with its `revision`.
   *
   * ```ts
   * const Shown = RemoteEdits.make(Data, ProductEdits)
   * const { model: next } = Shown.reconcile(model, model.edits, model.replica)
   * ```
   */
  make,
}
export type RemoteEdits<AppModel, Edit extends AnyEdit> = ReturnType<typeof make<AppModel, Edit>>

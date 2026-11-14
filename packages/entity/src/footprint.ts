/**
 * A transition's footprint: the members of its Entity it reads and writes, by
 * field key. `Laws.check` reads one per entry, derived from a declared write
 * (`Write.footprint`), declared by the author for a transition that is not one,
 * or unknown, which writes every member.
 */
import { Data, type Schema } from 'effect'
import type { EntityField, EntityIdentity } from './index.js'

export type Footprint = Data.TaggedEnum<{
  /** Read off a declared write. */
  Derived: { readonly reads: ReadonlyArray<string>; readonly writes: ReadonlyArray<string> }
  /** The author's word, and whose (`by`): kept by disjointness alone, never enumerated. */
  Declared: {
    readonly entity: string
    readonly reads: ReadonlyArray<string>
    readonly writes: ReadonlyArray<string>
    readonly by: string
  }
  /** Writes every member: undecided against every invariant of its Entity. */
  Unknown: {}
}>

const Footprints = Data.taggedEnum<Footprint>()

/** A declared footprint over the Entity named `Name`. */
export type DeclaredFootprint<Name extends string> = Extract<Footprint, { _tag: 'Declared' }> & {
  readonly entity: Name
}

type AnyField = EntityField<string, string, Schema.Constraint>
type OwnerOf<F> = F extends EntityField<infer Name, string, Schema.Constraint> ? Name : never

/** The Entity each declared footprint's fields belong to, so an entry over another is refused. */
export const declaredOwner = new WeakMap<Footprint, EntityIdentity<string>>()

export const Footprint = {
  Derived: Footprints.Derived,
  /**
   * What the author says a transition reads and writes, by field reference
   * (`Product.fields.name`), and on whose word (`by`). Every field is of one
   * Entity: another's throws here, and is a type error where the entry names
   * its Entity.
   */
  declared: <const F extends AnyField>(declared: {
    readonly reads?: ReadonlyArray<F>
    readonly writes: ReadonlyArray<F>
    readonly by: string
  }): DeclaredFootprint<OwnerOf<F>> => {
    const fields = [...(declared.reads ?? []), ...declared.writes]
    const owner = fields[0]?.owner
    if (owner === undefined)
      throw new Error(
        '[foldkit-entity] Footprint.declared names no field; it needs one to say whose',
      )
    const stranger = fields.find(field => field.owner !== owner)
    if (stranger !== undefined)
      throw new Error(
        `[foldkit-entity] Footprint.declared names ${owner.name}'s fields and ${stranger.owner.name}.${stranger.key}; a footprint is of one Entity`,
      )
    const footprint = Footprints.Declared({
      entity: owner.name,
      reads: (declared.reads ?? []).map(field => field.key),
      writes: declared.writes.map(field => field.key),
      by: declared.by,
    })
    declaredOwner.set(footprint, owner)
    return footprint as DeclaredFootprint<OwnerOf<F>>
  },
  /** Nothing is known of what it writes, so every member: never kept. */
  unknown: Footprints.Unknown() as Extract<Footprint, { readonly _tag: 'Unknown' }>,
  $match: Footprints.$match,
}

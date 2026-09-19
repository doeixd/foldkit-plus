/**
 * Controls: what edits one key of a form, described without a renderer.
 *
 * A control names the kind of editing (text, a toggle, a relation picker) and
 * fixes the draft the Model holds while the user edits. Which DOM, component,
 * or design system draws it is the application's.
 */
import { Schema } from 'effect'
import type { AnyEntity, InputMember } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'

export type Control =
  | { readonly _tag: 'Text' }
  /** Carried and submitted, not shown: the id of the thing being edited. Set it with `fill`. */
  | { readonly _tag: 'Hidden' }
  | { readonly _tag: 'Multiline' }
  | { readonly _tag: 'Number' }
  | { readonly _tag: 'Toggle' }
  | { readonly _tag: 'Select'; readonly options: ReadonlyArray<string> }
  /** Chooses one of `target`. The options are the application's to supply. */
  | { readonly _tag: 'RelationOne'; readonly target: AnyEntity }
  | { readonly _tag: 'RelationMany'; readonly target: AnyEntity }

/**
 * What a control holds while it is edited, which is not the value it submits: a
 * number being typed is text, and an unchosen relation is the empty string.
 */
export type Draft = string | boolean | ReadonlyArray<string>

export type DraftKind = 'text' | 'flag' | 'list'

export const draftKind = (control: Control): DraftKind =>
  control._tag === 'Toggle' ? 'flag' : control._tag === 'RelationMany' ? 'list' : 'text'

const key = Metadata.key<Control>('foldkit-form/input', {
  // The last control attached wins: a later annotation refines an earlier one.
  merge: controls => controls.slice(-1),
  summarize: control => control._tag,
})

interface AstLike {
  readonly _tag: string
  readonly literal?: unknown
  readonly types?: ReadonlyArray<AstLike>
}

/** The schema with `null` and `undefined` set aside: optional text is still text. */
const present = (ast: AstLike): ReadonlyArray<AstLike> =>
  ast._tag === 'Union'
    ? (ast.types ?? []).filter(member => member._tag !== 'Null' && member._tag !== 'Undefined')
    : [ast]

const fromSchema = (schema: Schema.Top): Control | undefined => {
  const members = present(schema.ast as unknown as AstLike)
  const [only] = members
  if (members.length === 1 && only !== undefined) {
    if (only._tag === 'String') return { _tag: 'Text' }
    if (only._tag === 'Number') return { _tag: 'Number' }
    if (only._tag === 'Boolean') return { _tag: 'Toggle' }
  }
  const literals = members.map(member => (member._tag === 'Literal' ? member.literal : undefined))
  return literals.length > 0 && literals.every(literal => typeof literal === 'string')
    ? { _tag: 'Select', options: literals as ReadonlyArray<string> }
    : undefined
}

export const Input = {
  text: (): Control => ({ _tag: 'Text' }),
  hidden: (): Control => ({ _tag: 'Hidden' }),
  multiline: (): Control => ({ _tag: 'Multiline' }),
  number: (): Control => ({ _tag: 'Number' }),
  toggle: (): Control => ({ _tag: 'Toggle' }),
  select: (options: ReadonlyArray<string>): Control => ({ _tag: 'Select', options }),

  /**
   * Entity metadata: the control a member is edited with wherever it appears,
   * e.g. `Entity.annotateMembers({ body: Input.of(Input.multiline()) })`.
   */
  of: (control: Control) => key.of(control),

  /**
   * The control for one input key, from the most to the least explicit source:
   * the member's `Input.of` metadata, the relation it writes, then the shape of
   * its schema. `undefined` when none of them says, which a form reports rather
   * than guessing.
   */
  resolve: (member: InputMember, schema: Schema.Top): Control | undefined => {
    if (member._tag === 'Unmapped') return fromSchema(schema)
    const owner = member._tag === 'Field' ? member : member.relation
    const [explicit] = key.get(owner.metadata)
    if (explicit !== undefined) return explicit
    if (member._tag === 'Field') return fromSchema(schema)
    const target = member.relation.target()
    return member.relation.cardinality === 'many'
      ? { _tag: 'RelationMany', target }
      : { _tag: 'RelationOne', target }
  },
}

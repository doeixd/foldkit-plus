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
  /**
   * Chooses one of `target`. The options are the application's to supply. With
   * `search`, the form also holds what the user typed to find one, which the
   * application reads as the input of the query that lists the options.
   */
  | { readonly _tag: 'RelationOne'; readonly target: AnyEntity; readonly search?: boolean }
  | { readonly _tag: 'RelationMany'; readonly target: AnyEntity; readonly search?: boolean }
  /** Only as an override, under `inputs`: the key's relation picker, with a search. See `Input.search`. */
  | { readonly _tag: 'Search' }
  /**
   * The target itself, edited through a form of its own (`Relation.nested`). The
   * key holds rows of that form: exactly one, at most one, or any number.
   */
  | {
      readonly _tag: 'Nested'
      readonly cardinality: 'one' | 'many'
      /** Whether the rows may be none: always for a `many`, for a `one` when its schema admits nothing. */
      readonly optional: boolean
      readonly form: NestedForm
    }

/** One row of a nested key: a Model of the nested form, under an id that outlives reordering. */
export interface FormRow<Model = unknown> {
  readonly id: string
  readonly model: Model
}

/** What a view needs of a nested form to draw its rows. Every form `Form.make` returns is one. */
export interface NestedForm {
  readonly controls: ReadonlyArray<{
    readonly key: string
    readonly control: Control
    readonly label: string
    readonly description: string | undefined
    readonly required: boolean
  }>
  readonly field: (model: never, key: never) => unknown
  readonly rows: (model: never, key: never) => ReadonlyArray<FormRow>
  readonly Message: {
    readonly Changed: (payload: never) => unknown
    readonly Blurred: (payload: never) => unknown
    readonly Nested: (payload: never) => unknown
    readonly RowAdded: (payload: never) => unknown
    readonly RowRemoved: (payload: never) => unknown
  }
}

/**
 * What a control holds while it is edited, which is not the value it submits: a
 * number being typed is text, and an unchosen relation is the empty string.
 */
export type Draft = string | boolean | ReadonlyArray<string>

export type DraftKind = 'text' | 'flag' | 'list'

/** The draft of a control that edits one value. A `Nested` key holds rows, not a draft. */
export const draftKind = (
  control: Exclude<Control, { readonly _tag: 'Nested' | 'Search' }>,
): DraftKind =>
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
   * For a relation key, under `inputs`: its picker, with a search. Too many to
   * list is the usual case for a relation; the form holds the search text, and
   * the query that lists the options takes it as input.
   */
  search: (): Control => ({ _tag: 'Search' }),

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
    // A nested key is not a control to choose: the form builds it from the nested input.
    if (member._tag === 'NestedInput') return undefined
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

/**
 * Controls: what edits one key of a form, described without a renderer.
 *
 * There is one primitive. A control is a `kind` (a name), the draft the Model
 * holds while the user edits, and whatever data its kind needs. `Input.text()`
 * and `Input.toggle()` are values of it, made by `Input.kind`, which is what an
 * application calls for a date picker or a rich text editor. The kinds here are
 * a collection, not a special case. Which DOM, component, or design system
 * draws a kind is the application's.
 */
import { Schema } from 'effect'
import type { AnyEntity, InputMember } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'

/**
 * What a control holds while it is edited, which is not the value it submits: a
 * number being typed is text, and an unchosen relation is the empty string.
 */
export type Draft = string | boolean | ReadonlyArray<string>

/** The draft a control holds. `rows` is a nested key: rows of a form, not a draft. */
export type DraftKind = 'text' | 'flag' | 'list' | 'rows'

/** What edits one key: the primitive every kind of control is a value of. */
export interface Control<Data = unknown> {
  /** The name a renderer is found by. */
  readonly kind: string
  readonly draft: DraftKind
  /** Whether a view draws it. A control carried and submitted, not shown, is `false`. */
  readonly shown: boolean
  /**
   * Whether the form also holds what the user typed to find a choice, which the
   * application reads as the input of the query that lists the choices.
   */
  readonly searches: boolean
  /** What this kind needs: a select's options, a relation's target. */
  readonly data: Data
  /**
   * For a `text` draft: the value the key's schema is given, when that is not the
   * text itself. `undefined` means the text does not read as one.
   */
  readonly parse?: ((draft: string) => unknown) | undefined
  /** What to say when `parse` gives `undefined`. */
  readonly unparsed?: string | undefined
}

/** A kind of control: how its values are made, and how one is told from another. */
export interface ControlKind<Data> {
  readonly kind: string
  readonly of: (data: Data) => Control<Data>
  readonly is: (control: Control) => control is Control<Data>
}

/**
 * Under `inputs`, in place of a control: a change to the control the form would
 * have resolved, such as giving the key's relation picker a search.
 */
export interface ControlChange {
  readonly change: (resolved: Control | undefined, key: string) => Control
}

export const isControlChange = (value: Control | ControlChange): value is ControlChange =>
  'change' in value

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
  readonly search: (model: never, key: never) => string
  readonly Message: {
    readonly Changed: (payload: never) => unknown
    readonly Blurred: (payload: never) => unknown
    readonly Searched: (payload: never) => unknown
    readonly Nested: (payload: never) => unknown
    readonly RowAdded: (payload: never) => unknown
    readonly RowRemoved: (payload: never) => unknown
  }
}

/** A kind of control. The kinds below are made with it, and so is an application's. */
const kind = <Data = Record<string, never>>(
  name: string,
  spec: {
    readonly draft: DraftKind
    readonly shown?: boolean
    readonly searches?: boolean | ((data: Data) => boolean)
    readonly parse?: (draft: string) => unknown
    readonly unparsed?: string
  },
): ControlKind<Data> => ({
  kind: name,
  of: data =>
    Object.freeze({
      kind: name,
      draft: spec.draft,
      shown: spec.shown ?? true,
      searches:
        typeof spec.searches === 'function' ? spec.searches(data) : (spec.searches ?? false),
      data,
      parse: spec.parse,
      unparsed: spec.unparsed,
    }),
  is: (control): control is Control<Data> => control.kind === name,
})

/** A relation picker: what it chooses from, and whether it searches. */
export interface RelationData {
  readonly target: AnyEntity
  readonly search: boolean
}

/** A nested key: how many rows it may hold, and the form each row is a Model of. */
export interface NestedData {
  readonly cardinality: 'one' | 'many'
  /** Whether the rows may be none: always for a `many`, for a `one` when its schema admits nothing. */
  readonly optional: boolean
  readonly form: NestedForm
}

const nothing: Record<string, never> = Object.freeze({})

const Text = kind('Text', { draft: 'text' })
const Hidden = kind('Hidden', { draft: 'text', shown: false })
const Multiline = kind('Multiline', { draft: 'text' })
const Number_ = kind('Number', {
  draft: 'text',
  // `Number(' ')` is 0, which nobody typed: a number's draft of spaces is nothing.
  parse: draft => {
    const value = globalThis.Number(draft)
    return draft.trim() === '' || !globalThis.Number.isFinite(value) ? undefined : value
  },
  unparsed: 'Enter a number',
})
const Toggle = kind('Toggle', { draft: 'flag' })
const Select = kind<{ readonly options: ReadonlyArray<string> }>('Select', { draft: 'text' })
const RelationOne = kind<RelationData>('RelationOne', {
  draft: 'text',
  searches: data => data.search,
})
const RelationMany = kind<RelationData>('RelationMany', {
  draft: 'list',
  searches: data => data.search,
})
const Nested = kind<NestedData>('Nested', { draft: 'rows' })

const key = Metadata.key<Control>('foldkit-form/input', {
  // The last control attached wins: a later annotation refines an earlier one.
  merge: controls => controls.slice(-1),
  summarize: control => control.kind,
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
    if (only._tag === 'String') return Text.of(nothing)
    if (only._tag === 'Number') return Number_.of(nothing)
    if (only._tag === 'Boolean') return Toggle.of(nothing)
  }
  const literals = members.map(member => (member._tag === 'Literal' ? member.literal : undefined))
  return literals.length > 0 && literals.every(literal => typeof literal === 'string')
    ? Select.of({ options: literals as ReadonlyArray<string> })
    : undefined
}

export const Input = {
  /**
   * A kind of control. `Input.kind<{ min: string }>('Date', { draft: 'text' })`
   * gives `.of(data)` to make one and `.is(control)` to tell one, exactly as the
   * kinds below were made. A view draws it once it is given a renderer for `Date`.
   */
  kind,

  // The kinds this package resolves to. A view finds its renderer by `kind`.
  Text,
  Hidden,
  Multiline,
  Number: Number_,
  Toggle,
  Select,
  RelationOne,
  RelationMany,
  Nested,

  text: (): Control => Text.of(nothing),
  /** Carried and submitted, not shown: the id of the thing being edited. Set it with `fill`. */
  hidden: (): Control => Hidden.of(nothing),
  multiline: (): Control => Multiline.of(nothing),
  number: (): Control => Number_.of(nothing),
  toggle: (): Control => Toggle.of(nothing),
  select: (options: ReadonlyArray<string>): Control => Select.of({ options }),

  /**
   * For a relation key, under `inputs`: its picker, with a search. Too many to
   * list is the usual case for a relation; the form holds the search text, and
   * the query that lists the options takes it as input.
   */
  search: (): ControlChange => ({
    change: (resolved, inputKey) => {
      if (resolved !== undefined && RelationOne.is(resolved))
        return RelationOne.of({ ...resolved.data, search: true })
      if (resolved !== undefined && RelationMany.is(resolved))
        return RelationMany.of({ ...resolved.data, search: true })
      throw new Error(`"${inputKey}" is not a relation, so it has no picker to search`)
    },
  }),

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
    const data = { target: member.relation.target(), search: false }
    return member.relation.cardinality === 'many' ? RelationMany.of(data) : RelationOne.of(data)
  },
}

/**
 * `foldkit-form` — a form as a Bundle over Foldkit's own field validation.
 *
 * A form is built from an operation's input (`Entity.input`): the struct says
 * what may be submitted, and the Entity says what each key means. The Model
 * holds one `fieldValidation` Field per key, carrying the draft the control
 * edits. `Submitted` leaves as an out Message with the decoded value; what
 * happens to it (a Remote mutation, a Sync operation, a plain `update`) is the
 * parent's.
 */
import { Duration, Effect, Pipeable, Result, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { AnyEntity, EntityInput, InputMember, NestedInput } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import { type Command, mapMessages } from 'foldkit/command'
import * as FieldValidation from 'foldkit/fieldValidation'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import {
  Input,
  isControlChange,
  type Control,
  type ControlChange,
  type Draft,
  type DraftKind,
  type FormRow,
  type NestedForm,
} from './input.js'

export {
  Input,
  type Control,
  type ControlChange,
  type ControlKind,
  type Draft,
  type DraftKind,
  type Follows,
  type FormRow,
  type NestedData,
  type NestedForm,
  type RelationData,
} from './input.js'

/** The draft a key holds, as far as the input's type says: a flag, a list of ids, or text. */
export type DraftOf<Value> = [Exclude<Value, null | undefined>] extends [boolean]
  ? boolean
  : [Exclude<Value, null | undefined>] extends [ReadonlyArray<unknown>]
    ? ReadonlyArray<string>
    : string

/** The keys of an input that hold a nested input (`Relation.nested`): rows of a form, not a draft. */
export type NestedKey<Members> = {
  [K in keyof Members]: Members[K] extends NestedInput<any, any> ? K : never
}[keyof Members]

/** The Model of the form a nested key's rows hold. */
export type NestedModel<Member> =
  Member extends NestedInput<any, EntityInput<any, infer Fields, infer Members>>
    ? FormModel<Fields, Members>
    : never

export interface FormModel<Fields extends Schema.Struct.Fields, Members = {}> {
  readonly fields: {
    readonly [K in keyof Fields as K extends NestedKey<Members> ? never : K]: FieldValidation.Field<
      DraftOf<Schema.Schema.Type<Fields[K]>>
    >
  }
  /** The rows of each nested key, each a Model of the nested form. */
  readonly rows: {
    readonly [K in keyof Fields as K extends NestedKey<Members> ? K : never]: ReadonlyArray<
      FormRow<NestedModel<Members[K & keyof Members]>>
    >
  }
  /** Counts the rows ever added, so a row's id is never reused. */
  readonly nextRow: number
  /** What was typed to find a choice, by key, for the relation pickers that search. */
  readonly searches: Readonly<Record<string, string>>
  /**
   * The keys that follow another and that the author has written themselves, so
   * they follow no longer. A key that follows nothing is never here.
   */
  readonly touched: Readonly<Record<string, boolean>>
  /** Failures of the input as a whole, from the last submit: a rule that spans keys. */
  readonly errors: ReadonlyArray<string>
  /** A submit is waiting for checks still running; it goes out when the last one passes. */
  readonly submitPending: boolean
  /**
   * What the form is editing, which its values do not say: a post's own row id,
   * so a check that asks whether an address is taken can tell the post's own
   * address from someone else's. Empty until `Message.About` says otherwise,
   * which is what a form that creates something means.
   */
  readonly subject: Readonly<Record<string, string>>
}

/**
 * A rule only something outside the form can answer: is this slug taken? It is
 * given the decoded value of the key and whatever else in the form currently
 * decodes, and answers with what is wrong, or nothing. It runs after the schema
 * of the key passes, never instead of it.
 */
export type FormCheck<A, Values, R = never> = (
  value: A,
  context: {
    readonly values: Values
    /** What the form is editing: `{}` while it creates. See `FormModel.subject`. */
    readonly subject: Readonly<Record<string, string>>
  },
) => Effect.Effect<string | undefined, never, R>

/** The form's out Message: every key is valid and the input decoded. */
export interface Submitted<Value> {
  readonly _tag: 'Submitted'
  readonly value: Value
}

/** One key of the form, with everything a view needs to draw it except the pixels. */
export interface FormControl<Key extends string = string> {
  readonly key: Key
  readonly control: Control
  /** The schema's `title` annotation, else `Form.label` metadata, else the key. */
  readonly label: string
  readonly description: string | undefined
  /** Whether an empty draft fails. */
  readonly required: boolean
  readonly member: InputMember
}

/** The key a message is about, for wording that names it. */
export interface MessageField<Key extends string = string> {
  readonly key: Key
  readonly label: string
  readonly control: Control
}

/**
 * The form's words. A rule's own wording belongs on the rule
 * (`Schema.isMinLength(3, { message: '…' })`) and arrives here as `message`;
 * these cover what the form says itself, and let an application translate or
 * rewrite what Schema says by default.
 */
export interface FormMessages<Key extends string = string> {
  /** An empty draft the schema does not admit. `{label}`, `{key}`. Default `Required`. */
  readonly required?: string | ((field: MessageField<Key>) => string)
  /** Text its control cannot read: a `Number` that is not one. `{label}`, `{key}`. Default: the kind's own words (`Enter a number`). */
  readonly unparsed?: string | ((field: MessageField<Key>) => string)
  /** A draft the key's schema rejects. `{message}` is the check's own, or Schema's; `{label}`, `{key}`. Default: `{message}`. */
  readonly invalid?: string | ((field: MessageField<Key>, message: string) => string)
  /** A failure of the input as a whole: a rule that spans keys. `{message}`. Default: `{message}`. */
  readonly form?: string | ((message: string) => string)
}

/**
 * Words with their blanks filled: `fillWords('{label} is required', { label: 'Title' })`.
 * A blank with no value is left as it is written. Words as text, not functions,
 * can be kept in one place, translated, and passed anywhere, a view's inputs
 * included, where Foldkit admits no nested function.
 */
export const fillWords = (
  template: string,
  values: Readonly<Record<string, string | number>>,
): string =>
  template.replace(/\{(\w+)\}/g, (blank, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : blank,
  )

/**
 * A form made with `Form.make` from the input a key nests. It is an ordinary
 * form: the one that edits an author alone is the one a post's form nests.
 */
export interface FormFor<
  Fields extends Schema.Struct.Fields,
  Members,
  R = never,
> extends NestedForm {
  readonly input: EntityInput<any, Fields, Members>
  readonly bundle: {
    readonly Model: Schema.Codec<FormModel<Fields, Members>, unknown>
    readonly Message: Schema.Codec<any, unknown>
    readonly update: (
      model: any,
      message: any,
      args: void,
    ) => {
      readonly model: any
      readonly commands?: ReadonlyArray<Command<any, never, R>> | undefined
    }
  }
  readonly initial: FormModel<Fields, Members>
  readonly fill: (model: any, values: any) => { readonly model: any }
  readonly engine: {
    readonly submit: (model: any) => {
      readonly model: any
      readonly commands: ReadonlyArray<Command<any, never, R>>
    }
    readonly isValidating: (model: any) => boolean
    readonly value: (model: any) => unknown
    /** Whether a transition changed authored content, so a nesting form recurses. */
    readonly authoredChanged: (before: any, after: any) => boolean
  }
  readonly settled: (model: any) => any
  /** Whether a completed transition changed authored content. */
  readonly authoredChanged: (before: any, after: any) => boolean
}

/** The forms a form may be given for its nested keys: each one made from that key's nested input. */
export type NestedForms<Fields extends Schema.Struct.Fields, Members, R> = {
  readonly [K in NestedKey<Members> & keyof Fields]?: Members[K] extends NestedInput<
    any,
    EntityInput<any, infer NestedFields, infer NestedMembers>
  >
    ? NestedFields extends Schema.Struct.Fields
      ? FormFor<NestedFields, NestedMembers, R>
      : never
    : never
}

/** The constructors of a form's Messages that a row's handle offers, wrapped for the row. */
type RowConstructor =
  'Changed' | 'Blurred' | 'Searched' | 'Submitted' | 'Reset' | 'RowAdded' | 'RowRemoved'

/**
 * One row of a nested key, addressed: the nested form's own Message constructors,
 * each giving the Message of the form the row is in. `send` wraps a Message
 * already made, which is how a row inside a row is reached.
 */
export type RowHandle<Child, Message> = {
  readonly [T in RowConstructor]: Child extends {
    readonly Message: { readonly [C in T]: (...args: infer Args) => unknown }
  }
    ? (...args: Args) => Message
    : never
} & { readonly send: (message: unknown) => Message }

/** What `Form.make` takes beside the input. */
export interface FormOptions<
  Fields extends Schema.Struct.Fields,
  Members,
  R,
  Nest extends NestedForms<Fields, Members, R> = {},
> {
  /**
   * The control for a key the resolver cannot decide, or should not: an unmapped
   * key with an unusual schema, or text that wants a multiline control here only.
   */
  readonly inputs?: {
    readonly [K in Exclude<keyof Fields, NestedKey<Members>>]?: Control | ControlChange
  }
  /** The form's own words, and a rewrite of Schema's: for wording and for translation. */
  readonly messages?: FormMessages<keyof Fields & string>
  /** Rules answered outside the form, by key. The key reads `Validating` while one runs. */
  readonly checks?: {
    readonly [K in Exclude<keyof Fields, NestedKey<Members>>]?: FormCheck<
      Schema.Schema.Type<Fields[K]>,
      Partial<Schema.Struct.Type<Fields>>,
      R
    >
  }
  /** How long a key rests before its check runs, so typing does not ask per keystroke. Default 300ms. */
  readonly debounce?: Duration.Input
  /**
   * The form of a nested key, made with `Form.make` from the input the key nests
   * (`Relation.nested(relation, input)`): the same form that edits the target
   * alone. A nested key given none gets a plain form of its input, with this
   * form's `messages` and `debounce`.
   */
  readonly nested?: Nest
}

interface Label {
  readonly label: string
  readonly description?: string | undefined
}

const labelKey = Metadata.key<Label>('foldkit-form/label', {
  merge: labels => labels.slice(-1),
  summarize: label => label.label,
})

type Checked = Result.Result<unknown, string>

type AnyCommand = Command<any, never, any>

/** A form as the form that nests it uses it: untyped, since a nested input is only known at runtime. */
interface AnyForm extends NestedForm {
  readonly bundle: {
    readonly Model: Schema.Codec<any, unknown>
    readonly Message: Schema.Codec<any, unknown>
    readonly update: (
      model: any,
      message: any,
      args: void,
    ) => { readonly model: any; readonly commands?: ReadonlyArray<AnyCommand> | undefined }
  }
  readonly initial: unknown
  readonly fill: (model: any, values: any) => { readonly model: any }
  readonly engine: {
    readonly submit: (model: any) => {
      readonly model: any
      readonly commands: ReadonlyArray<AnyCommand>
    }
    readonly isValidating: (model: any) => boolean
    readonly value: (model: any) => unknown
    readonly authoredChanged: (before: any, after: any) => boolean
  }
  readonly settled: (model: any) => any
  /** Whether a completed transition changed authored content. */
  readonly authoredChanged: (before: any, after: any) => boolean
}

/** Assigned once `Form` exists: a form builds the forms of its nested keys with itself. */
let makeNested: (name: string, input: unknown, options: unknown) => AnyForm

interface NestedPlan extends FormControl {
  readonly form: AnyForm
  readonly cardinality: 'one' | 'many'
  readonly optional: boolean
  /** What no row submits, for a `one` whose schema admits nothing. */
  readonly nothing: null | undefined
}

/**
 * The checks a form may be given by key, with what they need left open. Effect's
 * `R` is not an inference site a mapped type can win: asked to infer it, TypeScript
 * answers `never`, and a check that needs anything is refused by the shape meant to
 * accept it. So the shape admits any requirement and `RequirementOf` reads back what
 * was actually passed.
 */
export type ChecksFor<F extends Remakeable> = {
  readonly [K in Exclude<keyof F['types']['Fields'], NestedKey<F['types']['Members']>>]?: FormCheck<
    Schema.Schema.Type<F['types']['Fields'][K]>,
    Partial<Schema.Struct.Type<F['types']['Fields']>>,
    any
  >
}

/** What a set of checks needs between them, read off the functions that were given. */
export type RequirementOf<C> = {
  [K in keyof C]: C[K] extends (...args: never) => Effect.Effect<any, any, infer R> ? R : never
}[keyof C]

/** An edit, however deep: it answers the last submit. An answered check or a blur does not. */
const isEdit = (message: { readonly _tag: string; readonly message?: unknown }): boolean =>
  message._tag === 'Nested'
    ? isEdit(message.message as { readonly _tag: string })
    : ['Changed', 'RowAdded', 'RowRemoved', 'Reset'].includes(message._tag)

interface Plan extends FormControl {
  readonly kind: HeldDraft
  readonly empty: Draft
  readonly check: (draft: Draft) => Checked
  readonly rules: FieldValidation.Rules<Draft>
}

/** The drafts a key holds. `rows` is a nested key's, which holds rows instead. */
type HeldDraft = Exclude<DraftKind, 'rows'>

const kindOf = (draft: unknown): HeldDraft | undefined =>
  typeof draft === 'string'
    ? 'text'
    : typeof draft === 'boolean'
      ? 'flag'
      : Array.isArray(draft) && draft.every(item => typeof item === 'string')
        ? 'list'
        : undefined

const sameDraft = (left: Draft, right: Draft): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((item, index) => item === right[index])
    : left === right

const isEmpty = (draft: Draft): boolean =>
  draft === '' || (Array.isArray(draft) && draft.length === 0)

/** Text that is read as something else is blank when it is only spaces: `Number(' ')` is 0, which nobody typed. */
const isBlank = (control: Control, draft: Draft): boolean =>
  isEmpty(draft) ||
  (control.parse !== undefined && typeof draft === 'string' && draft.trim() === '')

const annotationsOf = (schema: Schema.Top): { title?: unknown; description?: unknown } =>
  Schema.resolveAnnotations(schema) ?? {}

/** The schema's `title`, else `Form.label` metadata on the member, else the key. */
const wordsOf = (
  key: string,
  schema: Schema.Top,
  member: InputMember,
): { readonly label: string; readonly description: string | undefined } => {
  const own =
    member._tag === 'Unmapped' ? undefined : member._tag === 'Field' ? member : member.relation
  const [labelled] = own === undefined ? [] : labelKey.get(own.metadata)
  const annotated = [schema, ...(member._tag === 'Field' ? [member.schema as Schema.Top] : [])].map(
    annotationsOf,
  )
  const title = annotated.map(entry => entry.title).find(value => typeof value === 'string')
  const description = annotated
    .map(entry => entry.description)
    .find(value => typeof value === 'string')
  return {
    label: (title as string | undefined) ?? labelled?.label ?? key,
    description: (description as string | undefined) ?? labelled?.description,
  }
}

const nestedPlanOf = (
  name: string,
  key: string,
  schema: Schema.Top,
  member: Extract<InputMember, { readonly _tag: 'NestedInput' }>,
  given: AnyForm | undefined,
  inherited: unknown,
): NestedPlan => {
  const accepts = Schema.is(Schema.toType(schema) as Schema.Codec<unknown>)
  const cardinality = member.relation.cardinality
  const optional = cardinality === 'many' || accepts(undefined) || accepts(null)
  if (given !== undefined && (given as { readonly input?: unknown }).input !== member.input)
    fail(
      name,
      `"${key}" is given a form of another input than the one it nests; make it from the input passed to Relation.nested`,
    )
  const form = given ?? makeNested(`${name}.${key}`, member.input, inherited)
  return {
    key,
    ...wordsOf(key, schema, member),
    control: Input.Nested.of({ cardinality, optional, form }),
    required: !optional,
    member,
    form,
    cardinality,
    optional,
    nothing: accepts(undefined) ? undefined : null,
  }
}

const planOf = (
  name: string,
  key: string,
  schema: Schema.Top,
  member: InputMember,
  override: Control | ControlChange | undefined,
  messages: FormMessages,
): Plan => {
  const resolved = Input.resolve(member, schema)
  const chosen =
    override === undefined
      ? resolved
      : isControlChange(override)
        ? attempt(name, () => override.change(resolved, key))
        : override
  const control = chosen ?? fail(name, `no control for "${key}"; name one under "inputs"`)
  if (control.draft === 'rows')
    return fail(
      name,
      `"${key}" cannot be given a ${control.kind} control; map it with Relation.nested`,
    )
  const kind = control.draft
  const type = Schema.toType(schema) as Schema.Codec<unknown>
  const decode = Schema.decodeUnknownResult(type)
  const accepts = Schema.is(type)
  const empty: Draft = kind === 'flag' ? false : kind === 'list' ? [] : ''

  // A control whose draft can never become the key's value is a wiring mistake.
  const samples: ReadonlyArray<unknown> =
    kind === 'flag' ? [true, false] : kind === 'list' ? [[], ['id']] : []
  if (samples.length > 0 && !samples.some(accepts))
    fail(name, `"${key}" is edited as ${control.kind}, but its schema accepts no such value`)

  const { label, description } = wordsOf(key, schema, member)
  const field: MessageField = { key, label, control }
  const say = {
    required: worded(messages.required, [field], { label, key }) ?? 'Required',
    unparsed: worded(messages.unparsed, [field], { label, key }) ?? control.unparsed ?? 'Not valid',
    invalid: (message: string) =>
      worded(messages.invalid, [field, message], { label, key, message }) ?? message,
  }

  const check = (draft: Draft): Checked => {
    if (isBlank(control, draft)) {
      // What "nothing entered" submits is whatever the schema admits for it.
      for (const nothing of [undefined, null, empty])
        if (accepts(nothing)) return Result.succeed(nothing)
      return Result.fail(say.required)
    }
    // A kind may read its text as something else before the schema sees it.
    const value =
      control.parse !== undefined && typeof draft === 'string' ? control.parse(draft) : draft
    if (value === undefined) return Result.fail(say.unparsed)
    return Result.mapError(decode(value), error => say.invalid(error.message))
  }

  const required = kind !== 'flag' && Result.isFailure(check(empty))
  return {
    key,
    control,
    kind,
    empty,
    check,
    required,
    member,
    label,
    description,
    rules: FieldValidation.makeRules<Draft>({
      isEmpty: draft => isBlank(control, draft),
      ...(required ? { required: say.required } : {}),
      rules: [
        [
          draft => Result.isSuccess(check(draft)),
          draft => Result.match(check(draft), { onSuccess: () => '', onFailure: error => error }),
        ],
      ],
    }),
  }
}

/** Words given as text have their blanks filled; given as a function, it is asked. */
const worded = <Args extends ReadonlyArray<unknown>>(
  words: string | ((...args: Args) => string) | undefined,
  args: Args,
  values: Readonly<Record<string, string | number>>,
): string | undefined =>
  words === undefined
    ? undefined
    : typeof words === 'string'
      ? fillWords(words, values)
      : words(...args)

const fail = (name: string, message: string): never => {
  throw new Error(`Form "${name}": ${message}`)
}

/** A failure inside a control change, said as the form's. */
const attempt = <A>(name: string, run: () => A): A => {
  try {
    return run()
  } catch (error) {
    return fail(name, error instanceof Error ? error.message : String(error))
  }
}

/** The draft that shows `value`: a number as its text, nothing as the empty draft. */
const draftOf = (plan: Plan, value: unknown): Draft =>
  value === null || value === undefined
    ? plan.empty
    : plan.kind === 'text'
      ? String(value)
      : (value as Draft)

const Core = {
  /**
   * A form for one operation's input. A key mapped with `Relation.nested` holds
   * rows of a form of its own, built here from the nested input; every other key
   * holds a draft. `options` names what the input cannot say: a control, the
   * words, the checks.
   */
  make: <
    const Name extends string,
    E extends AnyEntity,
    Fields extends Schema.Struct.Fields,
    Members extends { readonly [K in keyof Fields]: InputMember },
    R = never,
    const Nest extends NestedForms<Fields, Members, R> = {},
  >(
    name: Name,
    input: EntityInput<E, Fields, Members>,
    options: FormOptions<Fields, Members, R, Nest> = {},
  ) => {
    type AnyKey = keyof Fields & string
    type Key = Exclude<AnyKey, NestedKey<Members>>
    type RowsKey = Extract<AnyKey, NestedKey<Members>>
    type Value = Schema.Struct.Type<Fields>
    type Model = FormModel<Fields, Members>

    const members: Readonly<Record<string, InputMember>> = input.members
    const everyKey = Object.keys(input.schema.fields) as ReadonlyArray<AnyKey>
    const keys = everyKey.filter(
      key => members[key]!._tag !== 'NestedInput',
    ) as unknown as ReadonlyArray<Key>
    const rowsKeys = everyKey.filter(
      key => members[key]!._tag === 'NestedInput',
    ) as unknown as ReadonlyArray<RowsKey>

    const overrides: Readonly<Record<string, Control | ControlChange | undefined>> =
      options.inputs ?? {}
    const plans = Object.fromEntries(
      keys.map(key => [
        key,
        planOf(
          name,
          key,
          input.schema.fields[key] as Schema.Top,
          members[key]!,
          overrides[key],
          (options.messages ?? {}) as FormMessages,
        ),
      ]),
    ) as Readonly<Record<Key, Plan>>

    const givenForms: Readonly<Record<string, AnyForm | undefined>> = (options.nested ??
      {}) as never
    const nestedPlans = Object.fromEntries(
      rowsKeys.map(key => [
        key,
        nestedPlanOf(
          name,
          key,
          input.schema.fields[key] as Schema.Top,
          members[key] as Extract<InputMember, { readonly _tag: 'NestedInput' }>,
          givenForms[key],
          // A nested form made here takes this form's words and pace.
          { messages: options.messages, debounce: options.debounce },
        ),
      ]),
    ) as Readonly<Record<RowsKey, NestedPlan>>

    const draftSchema: Record<HeldDraft, Schema.Codec<Draft, any>> = {
      text: Schema.String,
      flag: Schema.Boolean,
      list: Schema.Array(Schema.String),
    }
    const Model = Schema.Struct({
      fields: Schema.Struct(
        Object.fromEntries(
          keys.map(key => [key, FieldValidation.Field(draftSchema[plans[key].kind])]),
        ),
      ),
      rows: Schema.Struct(
        Object.fromEntries(
          rowsKeys.map(key => [
            key,
            Schema.Array(
              Schema.Struct({ id: Schema.String, model: nestedPlans[key].form.bundle.Model }),
            ),
          ]),
        ),
      ),
      nextRow: Schema.Number,
      searches: Schema.Record(Schema.String, Schema.String),
      touched: Schema.Record(Schema.String, Schema.Boolean),
      errors: Schema.Array(Schema.String),
      submitPending: Schema.Boolean,
      subject: Schema.Record(Schema.String, Schema.String),
    }) as unknown as Schema.Codec<Model, unknown>

    // A form of nested keys only has no key to change, and `Literals` needs one.
    const KeySchema = (
      keys.length === 0
        ? Schema.Never
        : Schema.Literals(keys as unknown as readonly [Key, ...Key[]])
    ) as Schema.Literals<readonly [Key, ...Key[]]>
    const DraftSchema = Schema.Union([Schema.String, Schema.Boolean, Schema.Array(Schema.String)])
    const Message = defineMessageUnion({
      Changed: { key: KeySchema, value: DraftSchema },
      /** Validates the key as it stands, so a required key left empty says so. */
      Blurred: { key: KeySchema },
      Submitted: {},
      Reset: {},
      /** The answer of a check for the draft it was asked about; one for an older draft is dropped. */
      Checked: { key: KeySchema, draft: DraftSchema, error: Schema.NullOr(Schema.String) },
      /**
       * The outside world refused this key's value: a unique index, a rule only a
       * server knows. The key reads invalid with that reason, keeping what was
       * typed, until it is edited again. Unlike `Checked`, it answers no question
       * the form asked, so it lands whatever state the key is in.
       */
      Refused: { key: KeySchema, error: Schema.String },
      /**
       * What the form is editing, for the checks that need to know: a post's own
       * row id, so "is this address taken?" can pass over the post's own address.
       * It changes no draft and validates nothing; a form that creates something
       * never sends it. See `FormModel.subject`.
       */
      About: { subject: Schema.Record(Schema.String, Schema.String) },
      /** What was typed to find a choice for a relation key. It changes no draft and validates nothing. */
      Searched: { key: KeySchema, text: Schema.String },
      /** A Message of the nested form in one row of a nested key. One that row does not take is dropped. */
      Nested: { key: Schema.String, row: Schema.String, message: Schema.Unknown },
      /** A new, empty row. A `one` that already has its row takes no other. */
      RowAdded: { key: Schema.String },
      /** Removes a row. A `one` that must be there stays. */
      RowRemoved: { key: Schema.String, row: Schema.String },
    })
    type Message = typeof Message.Type
    type Commands = ReadonlyArray<Command<Message, never, R>>

    const fieldsFrom = (draft: (plan: Plan) => FieldValidation.Field<Draft>): Model['fields'] =>
      Object.fromEntries(keys.map(key => [key, draft(plans[key])])) as Model['fields']

    type Rows = ReadonlyArray<FormRow<any>>
    const rowsOf = (model: Model): Readonly<Record<string, Rows>> => model.rows as never
    const withRows = (model: Model, key: string, rows: Rows): Model => ({
      ...model,
      rows: { ...model.rows, [key]: rows },
    })

    /** Rows numbered from the Model's count, so an id is never reused. */
    const numbered = (model: Model, key: string, models: ReadonlyArray<unknown>): Model => ({
      ...withRows(
        model,
        key,
        models.map((row, index) => ({ id: `r${model.nextRow + index}`, model: row })),
      ),
      nextRow: model.nextRow + models.length,
    })

    // A `one` that must be there starts with its row; every other nested key starts with none.
    const initial: Model = rowsKeys.reduce<Model>(
      (model, key) =>
        numbered(model, key, nestedPlans[key].optional ? [] : [nestedPlans[key].form.initial]),
      {
        fields: fieldsFrom(plan => FieldValidation.NotValidated({ value: plan.empty })),
        rows: {} as Model['rows'],
        nextRow: 0,
        searches: {},
        touched: {},
        errors: [],
        submitPending: false,
        subject: {},
      },
    )
    const drafts = (model: Model): Readonly<Record<Key, FieldValidation.Field<Draft>>> =>
      model.fields as never
    const withField = (model: Model, key: Key, field: FieldValidation.Field<Draft>): Model => ({
      ...model,
      fields: { ...model.fields, [key]: field },
    })

    const checks: Readonly<Partial<Record<Key, FormCheck<unknown, Partial<Value>, R>>>> =
      (options.checks ?? {}) as never
    const debounce = options.debounce ?? '300 millis'

    /** What currently decodes, by key: the context of a check, and the makings of the value. */
    const decoded = (model: Model): Partial<Value> =>
      Object.fromEntries(
        keys.flatMap(key => {
          const value = Result.getOrUndefined(plans[key].check(drafts(model)[key].value))
          return value === undefined ? [] : [[key, value] as const]
        }),
      ) as Partial<Value>

    /** The value of each nested key, or `undefined` while some row has none. */
    const nestedValues = (model: Model): Readonly<Record<string, unknown>> | undefined => {
      const entries: Array<readonly [string, unknown]> = []
      for (const key of rowsKeys) {
        const plan = nestedPlans[key]
        const values = rowsOf(model)[key]!.map(row => plan.form.engine.value(row.model))
        if (values.includes(undefined)) return undefined
        entries.push([
          key,
          plan.cardinality === 'many' ? values : values.length === 0 ? plan.nothing : values[0],
        ])
      }
      return Object.fromEntries(entries)
    }

    /**
     * A nested form's Commands as this form's: their Messages arrive wrapped for
     * the row. `mapMessages` records the wrap on each Command, so a Story or
     * Scene that resolves the row's check sees the `Nested` Message this update
     * handles, not the inner form's bare answer.
     */
    const lift = (key: string, row: string, commands: ReadonlyArray<AnyCommand>): Commands =>
      mapMessages(commands, message => Message.Nested({ key, row, message })) as ReadonlyArray<
        Command<Message, never, R>
      >

    /**
     * Validates the draft of one key. A key with a check that passes its schema is
     * not `Valid` yet: it is `Validating`, with the Command that asks.
     */
    const validateKey = (
      model: Model,
      key: Key,
      draft: Draft,
    ): { readonly model: Model; readonly commands: Commands } => {
      const state = FieldValidation.validate(plans[key].rules)(draft)
      const check = checks[key]
      if (check === undefined || state._tag !== 'Valid') {
        return { model: withField(model, key, state), commands: [] }
      }
      const asking = withField(model, key, FieldValidation.Validating({ value: draft }))
      const value = Result.getOrUndefined(plans[key].check(draft))
      return {
        model: asking,
        commands: [
          {
            name: `${name}.check`,
            args: { key },
            effect: Effect.sleep(debounce).pipe(
              Effect.andThen(check(value, { values: decoded(asking), subject: model.subject })),
              Effect.map(error => Message.Checked({ key, draft, error: error ?? null })),
            ),
          } as Command<Message, never, R>,
        ],
      }
    }

    // The keys that follow another, and for each key, the keys that follow it.
    const followers = keys.filter(key => plans[key].control.follows !== undefined)
    const followedBy = (key: Key): ReadonlyArray<Key> =>
      followers.filter(follower => plans[follower].control.follows!.key === key)
    for (const follower of followers) {
      const source = plans[follower].control.follows!.key as Key
      if (plans[source] === undefined || plans[source].kind !== 'text' || source === follower)
        fail(name, `"${follower}" follows "${source}", which is not another text key of the form`)
      // A follows B follows A never settles.
      const seen = new Set<string>([follower])
      for (let next: Key | undefined = source; next !== undefined;) {
        if (seen.has(next)) fail(name, `"${follower}" follows itself, through "${next}"`)
        seen.add(next)
        next = plans[next].control.follows?.key as Key | undefined
      }
    }

    /** What a follower's draft is, from the key it follows. */
    const derived = (model: Model, follower: Key): string => {
      const { key, through } = plans[follower].control.follows!
      return through(String(drafts(model)[key as Key].value))
    }

    /**
     * An author's edit of one key, and what follows from it. The key becomes theirs,
     * unless they emptied a key that follows another, which hands it back. Every
     * key still following this one is rewritten, and so on down.
     */
    const changed = (
      model: Model,
      key: Key,
      draft: Draft,
    ): { readonly model: Model; readonly commands: Commands } => {
      const follows = plans[key].control.follows !== undefined
      const handedBack = follows && isEmpty(draft)
      const owned: Model = follows
        ? { ...model, touched: { ...model.touched, [key]: !handedBack } }
        : model
      const written = validateKey(owned, key, handedBack ? derived(owned, key) : draft)
      return followedBy(key).reduce((result, follower) => {
        if (result.model.touched[follower] === true) return result
        const next = rewritten(result.model, follower)
        return { model: next.model, commands: [...result.commands, ...next.commands] }
      }, written)
    }

    /** A follower written from the key it follows, and its own followers after it. */
    const rewritten = (
      model: Model,
      follower: Key,
    ): { readonly model: Model; readonly commands: Commands } => {
      const draft = derived(model, follower)
      // Nothing to follow yet is nothing entered, not a failure to show.
      const written = isEmpty(draft)
        ? {
            model: withField(model, follower, FieldValidation.NotValidated({ value: draft })),
            commands: [] as Commands,
          }
        : validateKey(model, follower, draft)
      return followedBy(follower).reduce((result, next) => {
        if (result.model.touched[next] === true) return result
        const after = rewritten(result.model, next)
        return { model: after.model, commands: [...result.commands, ...after.commands] }
      }, written)
    }

    const decodeInput = Schema.decodeUnknownResult(
      Schema.toType(input.schema) as Schema.Codec<Value>,
    )

    const acceptable = (model: Model): boolean =>
      keys.every(key => FieldValidation.isValid(plans[key].rules)(drafts(model)[key]))
    /** A check is running, in this form or in a row of it. */
    const isValidating = (model: Model): boolean =>
      keys.some(key => drafts(model)[key]._tag === 'Validating') ||
      rowsKeys.some(key =>
        rowsOf(model)[key]!.some(row => nestedPlans[key].form.engine.isValidating(row.model)),
      )

    /** The decoded input, once every key and every row is acceptable; else what is wrong with the whole. */
    const finish = (model: Model): { readonly model: Model; readonly value?: Value } => {
      const settled: Model = { ...model, submitPending: false }
      const nested = acceptable(model) ? nestedValues(model) : undefined
      if (nested === undefined) return { model: settled }
      return Result.match(decodeInput({ ...decoded(model), ...nested }), {
        onSuccess: value => ({ model: { ...settled, errors: [] }, value }),
        onFailure: error => ({
          model: {
            ...settled,
            errors: [
              worded(options.messages?.form, [error.message], { message: error.message }) ??
                error.message,
            ],
          },
        }),
      })
    }

    /**
     * A submit: every key not yet validated is, in every row too, so every failure
     * shows. With none, the value goes out; with checks still running, the submit
     * waits for them.
     */
    const submit = (
      model: Model,
    ): { readonly model: Model; readonly commands: Commands; readonly value?: Value } => {
      let next: Model = { ...model, errors: [], submitPending: false }
      const commands: Array<Command<Message, never, R>> = []
      for (const key of keys) {
        const state = drafts(next)[key]
        // Any other state already answers for this draft: an edit always revalidates.
        if (state._tag !== 'NotValidated') continue
        const validated = validateKey(next, key, state.value)
        next = validated.model
        commands.push(...validated.commands)
      }
      for (const key of rowsKeys) {
        const rows = rowsOf(next)[key]!.map(row => {
          const submitted = nestedPlans[key].form.engine.submit(row.model)
          commands.push(...lift(key, row.id, submitted.commands))
          return { id: row.id, model: submitted.model }
        })
        next = withRows(next, key, rows)
      }
      if (isValidating(next)) return { model: { ...next, submitPending: true }, commands }
      return { ...finish(next), commands }
    }

    interface Out {
      readonly model: Model
      readonly commands: Commands
      readonly outMessage?: Submitted<Value>
    }
    const out = (model: Model, commands: Commands, value: Value | undefined): Out =>
      value === undefined
        ? { model, commands }
        : { model, commands, outMessage: { _tag: 'Submitted', value } }

    const submitted = (model: Model): Out => {
      const { model: next, commands, value } = submit(model)
      return out(next, commands, value)
    }

    /** After an answer: a submit that was waiting goes out once nothing is asked any more. */
    const resume = (model: Model, commands: Commands = []): Out => {
      if (!model.submitPending || isValidating(model)) return { model, commands }
      const { model: next, value } = finish(model)
      return out(next, commands, value)
    }

    /** An edit answers the last submit: its failures describe a form that has changed. */
    const edited = (model: Model): Model => ({ ...model, errors: [], submitPending: false })

    /** Shows existing values, as an edit form does; keys not given keep their draft and their rows. */
    const fill = (model: Model, values: Partial<Value>): { readonly model: Model } => {
      const given = values as Readonly<Record<string, unknown>>
      const filled: Model = {
        ...model,
        // Another value to edit is another search.
        searches: {},
        // A key given a value is the author's: a published address does not move
        // because its title did. One given nothing follows again.
        touched: Object.fromEntries(
          followers.flatMap(key =>
            key in given
              ? isEmpty(draftOf(plans[key], given[key]))
                ? []
                : [[key, true] as const]
              : model.touched[key] === true
                ? [[key, true] as const]
                : [],
          ),
        ),
        errors: [],
        submitPending: false,
        fields: fieldsFrom(plan =>
          plan.key in given
            ? FieldValidation.NotValidated({ value: draftOf(plan, given[plan.key]) })
            : drafts(model)[plan.key as Key],
        ),
      }
      return {
        model: rowsKeys.reduce<Model>((next, key) => {
          if (!(key in given)) return next
          const { form, optional } = nestedPlans[key]
          const held = given[key]
          const shown = Array.isArray(held)
            ? held
            : held === null || held === undefined
              ? []
              : [held]
          const models = shown.map(value => form.fill(form.initial, value).model)
          // A `one` that must be there keeps an empty row when it is given nothing.
          return numbered(next, key, models.length === 0 && !optional ? [form.initial] : models)
        }, filled),
      }
    }

    const bundle = Bundle.make(name, {
      Model,
      Message,
      init: () => ({ model: initial }),
      update: (
        model: Model,
        message: Message,
      ): Update.ReturnWithOutMessage<Model, Message, Submitted<Value>, R> => {
        switch (message._tag) {
          case 'Changed':
            // A draft of another kind than the control of the key holds is not an edit.
            return kindOf(message.value) !== plans[message.key].kind
              ? { model }
              : changed(edited(model), message.key, message.value)
          case 'Blurred': {
            const state = drafts(model)[message.key]
            // Only a key not validated yet: any other state already answers for this draft.
            return state._tag === 'NotValidated'
              ? validateKey(model, message.key, state.value)
              : { model }
          }
          case 'Refused': {
            const state = drafts(model)[message.key]
            return {
              model: {
                // A refusal settles a submit that was waiting: it cannot go through.
                ...withField(
                  model,
                  message.key,
                  FieldValidation.Invalid({ value: state.value, errors: [message.error] }),
                ),
                submitPending: false,
              },
            }
          }
          case 'About':
            return { model: { ...model, subject: message.subject } }
          case 'Checked': {
            const state = drafts(model)[message.key]
            // An answer for a draft the key no longer holds is dropped.
            if (state._tag !== 'Validating' || !sameDraft(state.value, message.draft)) {
              return { model }
            }
            return resume(
              withField(
                model,
                message.key,
                message.error === null
                  ? FieldValidation.Valid({ value: state.value })
                  : FieldValidation.Invalid({ value: state.value, errors: [message.error] }),
              ),
            )
          }
          case 'Searched': {
            return plans[message.key].control.searches
              ? {
                  model: { ...model, searches: { ...model.searches, [message.key]: message.text } },
                }
              : { model }
          }
          case 'Nested': {
            const plan: NestedPlan | undefined = nestedPlans[message.key as RowsKey]
            const row = rowsOf(model)[message.key]?.find(held => held.id === message.row)
            if (plan === undefined || row === undefined) return { model }
            if (!Schema.is(plan.form.bundle.Message)(message.message)) return { model }
            const inner = message.message as { readonly _tag: string }
            // Enter in a row submits the form the row is in.
            if (inner._tag === 'Submitted') return submitted(model)
            const answered = plan.form.bundle.update(row.model, inner, undefined)
            const next = withRows(
              model,
              message.key,
              rowsOf(model)[message.key]!.map(held =>
                held.id === row.id ? { id: row.id, model: answered.model } : held,
              ),
            )
            return resume(
              isEdit(inner) ? edited(next) : next,
              lift(message.key, row.id, answered.commands ?? []),
            )
          }
          case 'RowAdded': {
            const plan: NestedPlan | undefined = nestedPlans[message.key as RowsKey]
            const rows = rowsOf(model)[message.key]
            if (plan === undefined || rows === undefined) return { model }
            if (plan.cardinality === 'one' && rows.length > 0) return { model }
            const added = numbered(edited(model), message.key, [plan.form.initial])
            return {
              model: withRows(added, message.key, [...rows, ...rowsOf(added)[message.key]!]),
            }
          }
          case 'RowRemoved': {
            const plan: NestedPlan | undefined = nestedPlans[message.key as RowsKey]
            const rows = rowsOf(model)[message.key]
            if (plan === undefined || rows === undefined) return { model }
            if (plan.cardinality === 'one' && !plan.optional) return { model }
            return {
              model: withRows(
                edited(model),
                message.key,
                rows.filter(held => held.id !== message.row),
              ),
            }
          }
          case 'Reset':
            // Emptying the form does not change which row it is about.
            return { model: { ...initial, subject: model.subject } }
          case 'Submitted':
            return submitted(model)
        }
      },
      helpers: { fill },
    })

    /**
     * Whether a completed transition changed what the author wrote. Validation
     * state, search text, the edited subject, and row bookkeeping are not
     * authored content, so a blur, a refused edit, or a no-op is not a change.
     * Nested rows recurse through their own forms, and a Bundle-backed control
     * composes because its output is written back before this is asked.
     */
    const authoredChanged = (before: Model, after: Model): boolean => {
      const beforeDrafts = drafts(before)
      const afterDrafts = drafts(after)
      for (const key of keys) {
        if (!sameDraft(beforeDrafts[key].value, afterDrafts[key].value)) return true
      }
      for (const key of rowsKeys) {
        const beforeRows = rowsOf(before)[key]!
        const afterRows = rowsOf(after)[key]!
        if (beforeRows.length !== afterRows.length) return true
        for (const [index, row] of beforeRows.entries()) {
          const other = afterRows[index]!
          if (row.id !== other.id) return true
          if (nestedPlans[key].form.engine.authoredChanged(row.model, other.model)) return true
        }
      }
      return false
    }

    return {
      /** The name, input and options the form was made from: what a pipe step makes the next form from. */
      name,
      options,
      /** Type-only: the form's type parameters, for a pipe step to read. Never set. */
      types: undefined as unknown as {
        readonly Name: Name
        readonly E: E
        readonly Fields: Fields
        readonly Members: Members
        readonly R: R
        readonly Nest: Nest
      },
      // Typed by `Pipeable`'s overloads, which read `this` at the call.
      ...({
        pipe() {
          return Pipeable.pipeArguments(this, arguments)
        },
      } as Pipeable.Pipeable),
      bundle,
      Message,
      /** The reading the form was made from, for `Entity.selectFor` and `Entity.valuesFor`. */
      input,
      /** Whether a completed transition changed authored content. See the note above. */
      authoredChanged,
      /** The `fill` helper as a plain function of the form's Model, for a package that wraps the form. */
      fill,
      /** The Model the form starts from and resets to: every key empty and not validated. */
      initial,
      /** The keys in the input's order, each with its control, label, and member. */
      controls: everyKey.map((key): FormControl<AnyKey> => {
        const { control, label, description, required, member } =
          (plans as Readonly<Record<string, FormControl>>)[key] ??
          (nestedPlans as Readonly<Record<string, FormControl>>)[key]!
        return { key, control, label, description, required, member }
      }),
      /**
       * One key's state with its draft as any `Draft`, for a view that walks
       * `controls`. `model.fields.title` is the same value, typed to that key. A
       * nested key has rows and no draft.
       */
      field: (model: Model, key: Key): FieldValidation.Field<Draft> =>
        drafts(model)[key] ?? fail(name, `"${key}" holds rows, not a draft; read it with rows`),
      /** What was typed to find a choice for a relation key that searches; `''` until something is. */
      search: (model: Model, key: Key): string => model.searches[key] ?? '',
      /** What the form is editing; `{}` while it creates. See `FormModel.subject`. */
      subject: (model: Model): Readonly<Record<string, string>> => model.subject,
      /**
       * The form of each nested key, typed when it was given under `nested`: its
       * `controls`, its `field`, its Messages.
       */
      nested: Object.fromEntries(rowsKeys.map(key => [key, nestedPlans[key].form])) as {
        readonly [K in RowsKey]: K extends keyof Nest ? NonNullable<Nest[K]> : NestedForm
      },
      /**
       * One row of a nested key, addressed: `form.row('author', id).Changed({ key: 'name', value })`
       * is this form's Message for that edit in that row.
       */
      row: <K extends RowsKey>(
        key: K,
        row: string,
      ): RowHandle<K extends keyof Nest ? NonNullable<Nest[K]> : NestedForm, Message> => {
        const make = (nestedPlans[key] ?? fail(name, `"${key}" holds a draft, not rows`)).form
          .Message as unknown as Readonly<
          Record<string, (...args: ReadonlyArray<unknown>) => unknown>
        >
        const send = (message: unknown): Message => Message.Nested({ key, row, message })
        return {
          send,
          ...Object.fromEntries(
            (
              [
                'Changed',
                'Blurred',
                'Searched',
                'Submitted',
                'Reset',
                'RowAdded',
                'RowRemoved',
              ] as const
            ).map(constructor => [
              constructor,
              (...args: ReadonlyArray<unknown>) => send(make[constructor]!(...args)),
            ]),
          ),
        } as never
      },
      /**
       * Whether a key that follows another still does: `false` once the author has
       * written it themselves. A view offers "regenerate" by sending the key an empty draft.
       */
      isFollowing: (model: Model, key: Key): boolean =>
        plans[key].control.follows !== undefined && model.touched[key] !== true,
      /** The rows of a nested key, each a Model of `control.form`. */
      rows: (model: Model, key: RowsKey): Model['rows'][RowsKey] =>
        (rowsOf(model)[key] ?? fail(name, `"${key}" holds a draft, not rows`)) as never,
      /**
       * Whether a submit now could go through: nothing is invalid. A check still
       * running does not stop it; the submit waits for the answer.
       */
      canSubmit: (model: Model): boolean => {
        const next = submit(model)
        return next.value !== undefined || next.model.submitPending
      },
      /**
       * The Model with nothing in flight, for one that was stored and is shown
       * again: a check that was running when it was stored will never answer, so
       * its key is not validated yet, and no submit is waiting. Rows too.
       */
      settled: (model: Model): Model => ({
        ...model,
        submitPending: false,
        fields: fieldsFrom(plan => {
          const field = drafts(model)[plan.key as Key]
          return field._tag === 'Validating'
            ? FieldValidation.NotValidated({ value: field.value })
            : field
        }),
        rows: Object.fromEntries(
          rowsKeys.map(key => [
            key,
            rowsOf(model)[key]!.map(row => ({
              ...row,
              model: nestedPlans[key].form.settled(row.model),
            })),
          ]),
        ) as unknown as Model['rows'],
      }),
      /**
       * What of the form decodes as it stands, by key: the value, less every key
       * that is not valid yet. For saving unfinished work, which `engine.value`
       * cannot give. A nested key is there once each of its rows has a value.
       */
      partial: (model: Model): Partial<Value> => ({
        ...decoded(model),
        ...Object.fromEntries(
          rowsKeys.flatMap(key => {
            const plan = nestedPlans[key]
            const values = rowsOf(model)[key]!.map(row => plan.form.engine.value(row.model))
            if (values.includes(undefined)) return []
            const held =
              plan.cardinality === 'many' ? values : values.length === 0 ? plan.nothing : values[0]
            return [[key, held] as const]
          }),
        ),
      }),
      /** The form as the form that nests it drives it. */
      engine: {
        submit: (model: Model) => {
          const { model: next, commands } = submit(model)
          return { model: next, commands }
        },
        isValidating,
        /** Whether a transition changed authored content, so a nesting form recurses. */
        authoredChanged,
        /** The decoded input when every key and row is valid as it stands; validates nothing. */
        value: (model: Model): Value | undefined => finish(model).value,
      },
    }
  },

  /**
   * Entity metadata: the label of a member that has no schema to annotate (a
   * relation, a derived member). A field is labelled on its schema, with
   * `Schema.String.annotate({ title })`.
   */
  label: (label: string, description?: string) =>
    labelKey.of(description === undefined ? { label } : { label, description }),

  /**
   * What `Form.label` attached to an Entity member, for a package that labels
   * the same member elsewhere, such as a table column.
   */
  labelOf: (member: { readonly metadata: Metadata }): string | undefined =>
    labelKey.get(member.metadata)[0]?.label,
}

/** The type parameters a form was made with. */
interface FormTypes {
  readonly Name: string
  readonly E: AnyEntity
  readonly Fields: Schema.Struct.Fields
  readonly Members: any
  readonly R: unknown
  readonly Nest: any
}

/** A form as a pipe step takes it: what it was made from, and its type parameters. */
interface Remakeable<T extends FormTypes = FormTypes> {
  readonly name: string
  readonly input: EntityInput<any, any, any>
  readonly options: object
  readonly types: T
}

/** The form `Form.make` gives for these type parameters. */
type Made<T extends FormTypes> = ReturnType<
  typeof Core.make<T['Name'], T['E'], T['Fields'], T['Members'], T['R'], T['Nest']>
>

type OptionsOf<T extends FormTypes> = FormOptions<T['Fields'], T['Members'], T['R'], T['Nest']>

/** The form again, with some of its options replaced or added to. */
const remake = (form: Remakeable, change: (options: Record<string, any>) => object): never =>
  (Core.make as (name: string, input: unknown, options: object) => unknown)(form.name, form.input, {
    ...form.options,
    ...change(form.options as Record<string, any>),
  }) as never

/**
 * Pipe steps. Each gives a new form, made from the same input with one option
 * added to, so a form can be handed over partly configured and finished where it
 * is used: `AuthorForm.pipe(Form.inputs({ bio: Input.multiline() }), Form.messages(german))`.
 */
const steps = {
  /** Controls by key, beside the ones the form already names. */
  inputs:
    <F extends Remakeable>(inputs: NonNullable<OptionsOf<F['types']>['inputs']>) =>
    (form: F): F =>
      remake(form, options => ({ inputs: { ...options.inputs, ...inputs } })),

  /** The form's words, beside the ones it already has. */
  messages:
    <F extends Remakeable>(messages: NonNullable<OptionsOf<F['types']>['messages']>) =>
    (form: F): F =>
      remake(form, options => ({ messages: { ...options.messages, ...messages } })),

  /** How long a key rests before its check runs. */
  debounce:
    (debounce: Duration.Input) =>
    <F extends Remakeable>(form: F): F =>
      remake(form, () => ({ debounce })),

  /**
   * Checks by key, beside the ones the form already has. What they need (`R`) is
   * added to what the form needs.
   */
  checks:
    <F extends Remakeable, const C extends ChecksFor<F>>(checks: C) =>
    (
      form: F,
    ): Made<{
      readonly Name: F['types']['Name']
      readonly E: F['types']['E']
      readonly Fields: F['types']['Fields']
      readonly Members: F['types']['Members']
      readonly R: F['types']['R'] | RequirementOf<C>
      readonly Nest: F['types']['Nest']
    }> =>
      remake(form, options => ({ checks: { ...options.checks, ...checks } })),

  /** The forms of nested keys, beside the ones the form was already given. */
  nested:
    <
      F extends Remakeable,
      const N extends NestedForms<F['types']['Fields'], F['types']['Members'], F['types']['R']>,
    >(
      forms: N,
    ) =>
    (
      form: F,
    ): Made<{
      readonly Name: F['types']['Name']
      readonly E: F['types']['E']
      readonly Fields: F['types']['Fields']
      readonly Members: F['types']['Members']
      readonly R: F['types']['R']
      readonly Nest: F['types']['Nest'] & N
    }> =>
      remake(form, options => ({ nested: { ...options.nested, ...forms } })),
}

export const Form = { ...Core, ...steps }

makeNested = Core.make as never

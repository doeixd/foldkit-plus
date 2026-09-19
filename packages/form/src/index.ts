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
import { Duration, Effect, Result, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { AnyEntity, EntityInput, InputMember, NestedInput } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import type { Command } from 'foldkit/command'
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
  /** Failures of the input as a whole, from the last submit: a rule that spans keys. */
  readonly errors: ReadonlyArray<string>
  /** A submit is waiting for checks still running; it goes out when the last one passes. */
  readonly submitPending: boolean
}

/**
 * A rule only something outside the form can answer: is this slug taken? It is
 * given the decoded value of the key and whatever else in the form currently
 * decodes, and answers with what is wrong, or nothing. It runs after the schema
 * of the key passes, never instead of it.
 */
export type FormCheck<A, Values, R = never> = (
  value: A,
  context: { readonly values: Values },
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
  /** An empty draft the schema does not admit. Default `Required`. */
  readonly required?: (field: MessageField<Key>) => string
  /** Text its control cannot read: a `Number` that is not one. Default: the kind's own words (`Enter a number`). */
  readonly unparsed?: (field: MessageField<Key>) => string
  /** A draft the key's schema rejects. `message` is the check's own, or Schema's. Default: `message`. */
  readonly invalid?: (field: MessageField<Key>, message: string) => string
  /** A failure of the input as a whole: a rule that spans keys. Default: `message`. */
  readonly form?: (message: string) => string
}

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
  }
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
  }
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
    required: messages.required?.(field) ?? 'Required',
    unparsed: messages.unparsed?.(field) ?? control.unparsed ?? 'Not valid',
    invalid: (message: string) => messages.invalid?.(field, message) ?? message,
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

export const Form = {
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
      errors: Schema.Array(Schema.String),
      submitPending: Schema.Boolean,
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
        errors: [],
        submitPending: false,
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

    /** A nested form's Commands as this form's: their Messages arrive wrapped for the row. */
    const lift = (key: string, row: string, commands: ReadonlyArray<AnyCommand>): Commands =>
      commands.map(
        command =>
          ({
            name: command.name,
            args: { ...(command.args as object), at: key, row },
            effect: Effect.map(command.effect, message => Message.Nested({ key, row, message })),
          }) as Command<Message, never, R>,
      )

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
              Effect.andThen(check(value, { values: decoded(asking) })),
              Effect.map(error => Message.Checked({ key, draft, error: error ?? null })),
            ),
          } as Command<Message, never, R>,
        ],
      }
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
            errors: [options.messages?.form?.(error.message) ?? error.message],
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
              : validateKey(edited(model), message.key, message.value)
          case 'Blurred': {
            const state = drafts(model)[message.key]
            // Only a key not validated yet: any other state already answers for this draft.
            return state._tag === 'NotValidated'
              ? validateKey(model, message.key, state.value)
              : { model }
          }
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
            return { model: initial }
          case 'Submitted':
            return submitted(model)
        }
      },
      helpers: { fill },
    })

    return {
      bundle,
      Message,
      /** The reading the form was made from, for `Entity.selectFor` and `Entity.valuesFor`. */
      input,
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
      /** The form as the form that nests it drives it. */
      engine: {
        submit: (model: Model) => {
          const { model: next, commands } = submit(model)
          return { model: next, commands }
        },
        isValidating,
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

makeNested = Form.make as never

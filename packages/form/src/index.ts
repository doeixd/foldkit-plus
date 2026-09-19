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
import type { AnyEntity, EntityInput, InputMember } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import type { Command } from 'foldkit/command'
import * as FieldValidation from 'foldkit/fieldValidation'
import { defineMessageUnion } from 'foldkit/message'
import { Input, draftKind, type Control, type Draft, type DraftKind } from './input.js'

export { Input, type Control, type Draft } from './input.js'

/** The draft a key holds, as far as the input's type says: a flag, a list of ids, or text. */
export type DraftOf<Value> = [Exclude<Value, null | undefined>] extends [boolean]
  ? boolean
  : [Exclude<Value, null | undefined>] extends [ReadonlyArray<unknown>]
    ? ReadonlyArray<string>
    : string

export interface FormModel<Fields extends Schema.Struct.Fields> {
  readonly fields: {
    readonly [K in keyof Fields]: FieldValidation.Field<DraftOf<Schema.Schema.Type<Fields[K]>>>
  }
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
  /** A `Number` control whose draft is not a number. Default `Enter a number`. */
  readonly notANumber?: (field: MessageField<Key>) => string
  /** A draft the key's schema rejects. `message` is the check's own, or Schema's. Default: `message`. */
  readonly invalid?: (field: MessageField<Key>, message: string) => string
  /** A failure of the input as a whole: a rule that spans keys. Default: `message`. */
  readonly form?: (message: string) => string
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

interface Plan extends FormControl {
  readonly kind: DraftKind
  readonly empty: Draft
  readonly check: (draft: Draft) => Checked
  readonly rules: FieldValidation.Rules<Draft>
}

const kindOf = (draft: unknown): DraftKind | undefined =>
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

/** A number's draft is blank when it is only spaces: `Number(' ')` is 0, which nobody typed. */
const isBlank = (control: Control, draft: Draft): boolean =>
  isEmpty(draft) || (control._tag === 'Number' && typeof draft === 'string' && draft.trim() === '')

const annotationsOf = (schema: Schema.Top): { title?: unknown; description?: unknown } =>
  Schema.resolveAnnotations(schema) ?? {}

const planOf = (
  name: string,
  key: string,
  schema: Schema.Top,
  member: InputMember,
  override: Control | undefined,
  messages: FormMessages,
): Plan => {
  const control =
    override ??
    Input.resolve(member, schema) ??
    fail(name, `no control for "${key}"; name one under "inputs"`)
  const kind = draftKind(control)
  const type = Schema.toType(schema) as Schema.Codec<unknown>
  const decode = Schema.decodeUnknownResult(type)
  const accepts = Schema.is(type)
  const empty: Draft = kind === 'flag' ? false : kind === 'list' ? [] : ''

  // A control whose draft can never become the key's value is a wiring mistake.
  const samples: ReadonlyArray<unknown> =
    kind === 'flag' ? [true, false] : kind === 'list' ? [[], ['id']] : []
  if (samples.length > 0 && !samples.some(accepts))
    fail(name, `"${key}" is edited as ${control._tag}, but its schema accepts no such value`)

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

  const label = (title as string | undefined) ?? labelled?.label ?? key
  const field: MessageField = { key, label, control }
  const say = {
    required: messages.required?.(field) ?? 'Required',
    notANumber: messages.notANumber?.(field) ?? 'Enter a number',
    invalid: (message: string) => messages.invalid?.(field, message) ?? message,
  }

  const check = (draft: Draft): Checked => {
    if (isBlank(control, draft)) {
      // What "nothing entered" submits is whatever the schema admits for it.
      for (const nothing of [undefined, null, empty])
        if (accepts(nothing)) return Result.succeed(nothing)
      return Result.fail(say.required)
    }
    const value = control._tag === 'Number' ? Number(draft) : draft
    if (typeof value === 'number' && !Number.isFinite(value)) return Result.fail(say.notANumber)
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
    description: (description as string | undefined) ?? labelled?.description,
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

/** The draft that shows `value`: a number as its text, nothing as the empty draft. */
const draftOf = (plan: Plan, value: unknown): Draft =>
  value === null || value === undefined
    ? plan.empty
    : plan.kind === 'text'
      ? String(value)
      : (value as Draft)

export const Form = {
  /**
   * A form for one operation's input. `inputs` names the control for a key the
   * resolver cannot decide, or should not: an unmapped key with an unusual
   * schema, or text that wants a multiline control in this form only.
   */
  make: <
    const Name extends string,
    E extends AnyEntity,
    Fields extends Schema.Struct.Fields,
    R = never,
  >(
    name: Name,
    input: EntityInput<E, Fields, { readonly [K in keyof Fields]: InputMember }>,
    options: {
      readonly inputs?: { readonly [K in keyof Fields]?: Control }
      /** The form's own words, and a rewrite of Schema's: for wording and for translation. */
      readonly messages?: FormMessages<keyof Fields & string>
      /** Rules answered outside the form, by key. The key reads `Validating` while one runs. */
      readonly checks?: {
        readonly [K in keyof Fields]?: FormCheck<
          Schema.Schema.Type<Fields[K]>,
          Partial<Schema.Struct.Type<Fields>>,
          R
        >
      }
      /** How long a key rests before its check runs, so typing does not ask per keystroke. Default 300ms. */
      readonly debounce?: Duration.Input
    } = {},
  ) => {
    type Key = keyof Fields & string
    type Value = Schema.Struct.Type<Fields>
    type Model = FormModel<Fields>

    const keys = Object.keys(input.schema.fields) as ReadonlyArray<Key>
    const overrides: Readonly<Record<string, Control | undefined>> = options.inputs ?? {}
    const plans = Object.fromEntries(
      keys.map(key => [
        key,
        planOf(
          name,
          key,
          input.schema.fields[key] as Schema.Top,
          input.members[key],
          overrides[key],
          (options.messages ?? {}) as FormMessages,
        ),
      ]),
    ) as Readonly<Record<Key, Plan>>

    const draftSchema: Record<DraftKind, Schema.Codec<Draft, any>> = {
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
      errors: Schema.Array(Schema.String),
      submitPending: Schema.Boolean,
    }) as unknown as Schema.Codec<Model, unknown>

    const Message = defineMessageUnion({
      Changed: {
        key: Schema.Literals(keys as unknown as readonly [Key, ...Key[]]),
        value: Schema.Union([Schema.String, Schema.Boolean, Schema.Array(Schema.String)]),
      },
      /** Validates the key as it stands, so a required key left empty says so. */
      Blurred: { key: Schema.Literals(keys as unknown as readonly [Key, ...Key[]]) },
      Submitted: {},
      Reset: {},
      /** The answer of a check for the draft it was asked about; one for an older draft is dropped. */
      Checked: {
        key: Schema.Literals(keys as unknown as readonly [Key, ...Key[]]),
        draft: Schema.Union([Schema.String, Schema.Boolean, Schema.Array(Schema.String)]),
        error: Schema.NullOr(Schema.String),
      },
    })
    type Message = typeof Message.Type

    const fieldsFrom = (draft: (plan: Plan) => FieldValidation.Field<Draft>): Model['fields'] =>
      Object.fromEntries(keys.map(key => [key, draft(plans[key])])) as Model['fields']

    const initial: Model = {
      fields: fieldsFrom(plan => FieldValidation.NotValidated({ value: plan.empty })),
      errors: [],
      submitPending: false,
    }
    const drafts = (model: Model): Readonly<Record<Key, FieldValidation.Field<Draft>>> =>
      model.fields
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

    /**
     * Validates the draft of one key. A key with a check that passes its schema is
     * not `Valid` yet: it is `Validating`, with the Command that asks.
     */
    const validateKey = (
      model: Model,
      key: Key,
      draft: Draft,
    ): { readonly model: Model; readonly commands: ReadonlyArray<Command<Message, never, R>> } => {
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

    const acceptable = (model: Model, key: Key): boolean =>
      FieldValidation.isValid(plans[key].rules)(drafts(model)[key])
    const isValidating = (model: Model): boolean =>
      keys.some(key => drafts(model)[key]._tag === 'Validating')

    /** The decoded input, once every key is acceptable; else the cross-key failure. */
    const finish = (model: Model): { readonly model: Model; readonly value?: Value } =>
      Result.match(decodeInput(decoded(model)), {
        onSuccess: value => ({ model: { ...model, errors: [], submitPending: false }, value }),
        onFailure: error => ({
          model: {
            ...model,
            submitPending: false,
            errors: [options.messages?.form?.(error.message) ?? error.message],
          },
        }),
      })

    /**
     * A submit: every key not yet validated is, so every failure shows. With none,
     * the value goes out; with checks still running, the submit waits for them.
     */
    const submit = (
      model: Model,
    ): {
      readonly model: Model
      readonly commands: ReadonlyArray<Command<Message, never, R>>
      readonly value?: Value
    } => {
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
      if (isValidating(next)) return { model: { ...next, submitPending: true }, commands }
      return keys.every(key => acceptable(next, key))
        ? { ...finish(next), commands }
        : { model: next, commands }
    }

    /** Shows existing values, as an edit form does; keys not given keep their draft. */
    const fill = (model: Model, values: Partial<Value>): { readonly model: Model } => ({
      model: {
        errors: [],
        submitPending: false,
        fields: fieldsFrom(plan =>
          plan.key in values
            ? FieldValidation.NotValidated({
                value: draftOf(plan, (values as Readonly<Record<string, unknown>>)[plan.key]),
              })
            : drafts(model)[plan.key as Key],
        ),
      },
    })

    const bundle = Bundle.make(name, {
      Model,
      Message,
      init: () => ({ model: initial }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Changed': {
            // A draft of another kind than the control of the key holds is not an edit.
            if (kindOf(message.value) !== plans[message.key].kind) return { model }
            // An edit answers the last submit: its cross-key failures describe a form
            // that has changed, and a submit waiting on checks is no longer this one.
            const cleared: Model = { ...model, errors: [], submitPending: false }
            return validateKey(cleared, message.key, message.value)
          }
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
            const answered = withField(
              model,
              message.key,
              message.error === null
                ? FieldValidation.Valid({ value: state.value })
                : FieldValidation.Invalid({ value: state.value, errors: [message.error] }),
            )
            if (!answered.submitPending || isValidating(answered)) return { model: answered }
            // The last check a submit was waiting for.
            if (!keys.every(key => acceptable(answered, key))) {
              return { model: { ...answered, submitPending: false } }
            }
            const { model: next, value } = finish(answered)
            return value === undefined
              ? { model: next }
              : { model: next, outMessage: { _tag: 'Submitted', value } as Submitted<Value> }
          }
          case 'Reset':
            return { model: initial }
          case 'Submitted': {
            const { model: next, commands, value } = submit(model)
            return value === undefined
              ? { model: next, commands }
              : {
                  model: next,
                  commands,
                  outMessage: { _tag: 'Submitted', value } as Submitted<Value>,
                }
          }
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
      controls: keys.map((key): FormControl<Key> => {
        const { control, label, description, required, member } = plans[key]
        return { key, control, label, description, required, member }
      }),
      /**
       * One key's state with its draft as any `Draft`, for a view that walks
       * `controls`. `model.fields.title` is the same value, typed to that key.
       */
      field: (model: Model, key: Key): FieldValidation.Field<Draft> => drafts(model)[key],
      /**
       * Whether a submit now could go through: nothing is invalid. A check still
       * running does not stop it; the submit waits for the answer.
       */
      canSubmit: (model: Model): boolean => {
        const next = submit(model)
        return next.value !== undefined || next.model.submitPending
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

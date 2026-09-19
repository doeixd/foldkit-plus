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
import { Result, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { AnyEntity, EntityInput, InputMember } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
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
}

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

const isEmpty = (draft: Draft): boolean =>
  draft === '' || (Array.isArray(draft) && draft.length === 0)

const annotationsOf = (schema: Schema.Top): { title?: unknown; description?: unknown } =>
  Schema.resolveAnnotations(schema) ?? {}

const planOf = (
  name: string,
  key: string,
  schema: Schema.Top,
  member: InputMember,
  override: Control | undefined,
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

  const check = (draft: Draft): Checked => {
    if (isEmpty(draft)) {
      // What "nothing entered" submits is whatever the schema admits for it.
      for (const nothing of [undefined, null, draft])
        if (accepts(nothing)) return Result.succeed(nothing)
      return Result.fail('Required')
    }
    const value = control._tag === 'Number' ? Number(draft) : draft
    if (typeof value === 'number' && !Number.isFinite(value)) return Result.fail('Enter a number')
    return Result.mapError(decode(value), error => error.message)
  }

  const required = kind !== 'flag' && Result.isFailure(check(empty))
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
    key,
    control,
    kind,
    empty,
    check,
    required,
    member,
    label: (title as string | undefined) ?? labelled?.label ?? key,
    description: (description as string | undefined) ?? labelled?.description,
    rules: FieldValidation.makeRules<Draft>({
      isEmpty,
      ...(required ? { required: 'Required' } : {}),
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
  make: <const Name extends string, E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    name: Name,
    input: EntityInput<E, Fields, { readonly [K in keyof Fields]: InputMember }>,
    options: { readonly inputs?: { readonly [K in keyof Fields]?: Control } } = {},
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
    })
    type Message = typeof Message.Type

    const fieldsFrom = (draft: (plan: Plan) => FieldValidation.Field<Draft>): Model['fields'] =>
      Object.fromEntries(keys.map(key => [key, draft(plans[key])])) as Model['fields']

    const initial: Model = {
      fields: fieldsFrom(plan => FieldValidation.NotValidated({ value: plan.empty })),
      errors: [],
    }
    const drafts = (model: Model): Readonly<Record<Key, FieldValidation.Field<Draft>>> =>
      model.fields
    const withField = (model: Model, key: Key, field: FieldValidation.Field<Draft>): Model => ({
      fields: { ...model.fields, [key]: field },
      errors: model.errors,
    })
    const decodeInput = Schema.decodeUnknownResult(
      Schema.toType(input.schema) as Schema.Codec<Value>,
    )

    /** Every key validated; and the value, once none of them is unacceptable. */
    const submit = (model: Model): { readonly model: Model; readonly value?: Value } => {
      const fields = fieldsFrom(plan =>
        FieldValidation.validate(plan.rules)(drafts(model)[plan.key as Key].value),
      )
      const validated: Model = { fields, errors: [] }
      if (!keys.every(key => FieldValidation.isValid(plans[key].rules)(drafts(validated)[key])))
        return { model: validated }
      const entries = keys.flatMap(key => {
        const value = Result.getOrUndefined(plans[key].check(drafts(validated)[key].value))
        return value === undefined ? [] : [[key, value] as const]
      })
      return Result.match(decodeInput(Object.fromEntries(entries)), {
        onSuccess: value => ({ model: validated, value }),
        onFailure: error => ({ model: { fields, errors: [error.message] } }),
      })
    }

    /** Shows existing values, as an edit form does; keys not given keep their draft. */
    const fill = (model: Model, values: Partial<Value>): { readonly model: Model } => ({
      model: {
        errors: [],
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
            const plan = plans[message.key]
            // A draft of another kind than the key's control holds is not an edit.
            return kindOf(message.value) === plan.kind
              ? {
                  model: withField(
                    model,
                    message.key,
                    FieldValidation.validate(plan.rules)(message.value),
                  ),
                }
              : { model }
          }
          case 'Blurred': {
            const plan = plans[message.key]
            const next = FieldValidation.validate(plan.rules)(drafts(model)[message.key].value)
            return { model: withField(model, message.key, next) }
          }
          case 'Reset':
            return { model: initial }
          case 'Submitted': {
            const { model: next, value } = submit(model)
            return value === undefined
              ? { model: next }
              : { model: next, outMessage: { _tag: 'Submitted', value } as Submitted<Value> }
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
      /** Whether a submit now would produce a value. It validates nothing in the Model. */
      canSubmit: (model: Model): boolean => submit(model).value !== undefined,
    }
  },

  /**
   * Entity metadata: the label of a member that has no schema to annotate (a
   * relation, a derived member). A field is labelled on its schema, with
   * `Schema.String.annotate({ title })`.
   */
  label: (label: string, description?: string) =>
    labelKey.of(description === undefined ? { label } : { label, description }),
}

/**
 * `foldkit-mixins-form/declared`: a form drawn from what `Declared.of(form)`
 * (`foldkit-form/metakit`) read off its input Schema. Each key's bounds, step
 * and keypad become its input's attributes; the `CalendarDay` and `Decimal`
 * controls are drawn as a date input and an amount input; and a rule over
 * several keys shows its message beside each key it reads.
 *
 * A subpath, so a form view that uses none of it carries none of it. It reads
 * the declarations by their shape and imports no metakit module.
 */
import { Option } from 'effect'
import type * as FieldValidation from 'foldkit/fieldValidation'
import type { Draft } from 'foldkit-form'
import type { FieldAttrs, RenderContext, Renderer, Renderers } from './index.js'
import { plainRenderers } from './renderers.js'

/** The input attributes of one key's declaration, each none when it says nothing. */
export interface DeclaredAttributes {
  readonly inputMode: Option.Option<string>
  readonly min: Option.Option<string>
  readonly max: Option.Option<string>
  readonly step: Option.Option<string>
}

/**
 * What `Declared.of(form)` gives, as the view reads it: `field` is the form's
 * own with the messages of a rule over several keys added, and `constraints`
 * holds each key's input attributes.
 */
export interface DeclaredForm<Key extends string, Model> {
  readonly field: (model: Model, key: Key) => FieldValidation.Field<Draft>
  readonly constraints: { readonly [K in Key]?: { readonly attributes: DeclaredAttributes } }
}

type AttrsByKey<Key extends string> = { readonly [K in Key]?: FieldAttrs }

/**
 * Each key's attrs: what its declaration implies (`min`, `max`, `step`,
 * `inputMode`), then the attrs given for the key, which win. Made once, here.
 */
const attrsOf = <Key extends string, Model>(
  declared: DeclaredForm<Key, Model>,
  given: AttrsByKey<Key> = {},
): AttrsByKey<Key> => {
  // No prototype: a key named `constructor` has attrs only if it is declared or given.
  const made: Record<string, FieldAttrs> = Object.create(null)
  const constraints: Readonly<
    Record<string, { readonly attributes: DeclaredAttributes } | undefined>
  > = declared.constraints
  const own: Readonly<Record<string, FieldAttrs | undefined>> = given
  for (const key of new Set([...Object.keys(constraints), ...Object.keys(own)])) {
    const derived = Object.hasOwn(constraints, key) ? constraints[key]?.attributes : undefined
    made[key] = {
      ...(derived === undefined
        ? {}
        : // Only what the declaration says: a key left out keeps a renderer's own default.
          Object.fromEntries(
            (['inputMode', 'min', 'max', 'step'] as const).flatMap(name =>
              Option.match(derived[name], {
                onNone: () => [],
                onSome: value => [[name, value] as const],
              }),
            ),
          )),
      ...(Object.hasOwn(own, key) ? own[key] : {}),
    }
  }
  // The keys are the declaration's and the caller's, both typed by `Key`.
  return made as AttrsByKey<Key>
}

/**
 * Renderers for the kinds a declared form adds or changes, each drawn by
 * `base`'s `Text` or `Number` renderer (the plain ones unless given, so
 * `UiForm.renderers()` draws them under the Input component's Slot) with the
 * key's `min`, `max` and `step` added to the element:
 *
 * - `CalendarDay`: `base.Text` as `type="date"`, which a browser holds to the bounds.
 * - `Decimal` (a `Money` or `Decimal` key): `base.Text`, a text input with the
 *   decimal keypad. On a text input the browser ignores `min`, `max` and
 *   `step`: they are there for a script or a stylesheet to read, and for
 *   `attrs: { key: { type: 'number' } }`, which makes the browser check them.
 * - `Number`: `base.Number`, a text input likewise, with the same caveat.
 */
const renderersOver = <Message>(
  base: Renderers<Message> = plainRenderers<Message>(),
): Renderers<Message> => {
  const from = (kind: 'Text' | 'Number'): Renderer<Message> => {
    const renderer = Object.hasOwn(base, kind) ? base[kind] : undefined
    if (renderer === undefined)
      throw new Error(`DeclaredView: the renderers it is given have no "${kind}" to draw with`)
    return renderer
  }
  const [text, number] = [from('Text'), from('Number')]
  // On `state`, which every renderer puts on the element that holds the value.
  const limited = (context: RenderContext<Message>): RenderContext<Message> => {
    const { attrs, h } = context
    return {
      ...context,
      state: [
        ...context.state,
        ...(attrs.min === undefined ? [] : [h.Min(attrs.min)]),
        ...(attrs.max === undefined ? [] : [h.Max(attrs.max)]),
        ...(attrs.step === undefined ? [] : [h.Step(attrs.step)]),
      ],
    }
  }
  return {
    Number: context => number(limited(context)),
    CalendarDay: context =>
      text(limited({ ...context, attrs: { ...context.attrs, type: 'date' } })),
    Decimal: context =>
      text(
        limited({
          ...context,
          attrs: { ...context.attrs, inputMode: context.attrs.inputMode ?? 'decimal' },
        }),
      ),
  }
}

/** What `DeclaredView.of` takes beside the form and its declarations. */
export interface DeclaredViewOptions<Key extends string, Message> {
  /** Attrs for a key, over what its declaration implies. */
  readonly attrs?: AttrsByKey<Key>
  /** The renderers the declared kinds are drawn with, and that draw every other kind: the plain ones unless given. */
  readonly renderers?: Renderers<Message>
}

const of = <
  Form extends { readonly Message: { readonly Type: unknown } },
  Key extends string,
  Model,
>(
  form: Form & { readonly field: (model: Model, key: Key) => FieldValidation.Field<Draft> },
  declared: DeclaredForm<NoInfer<Key>, NoInfer<Model>>,
  options: DeclaredViewOptions<NoInfer<Key>, Form['Message']['Type']> = {},
): {
  readonly form: Form
  readonly options: {
    readonly attrs: AttrsByKey<Key>
    readonly renderers: Renderers<Form['Message']['Type']>
  }
} => ({
  form: { ...form, field: declared.field },
  options: {
    attrs: attrsOf(declared, options.attrs),
    renderers: { ...options.renderers, ...renderersOver(options.renderers) },
  },
})

export const DeclaredView = {
  /**
   * A form and its declarations as `FormView` takes them: `form` is the form
   * read through `declared.field`, so a rule over several keys shows beside
   * its keys, and `options` holds each key's `attrs` and the `renderers` of
   * the declared kinds. Pass both on:
   *
   * @example
   * ```ts
   * const stay = DeclaredView.of(StayForm, Declared.of(StayForm))
   * const fields = FormView.fields(stay.form, stay.options)
   * ```
   */
  of,
}

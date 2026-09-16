/**
 * Declares where a bundle lives from one field name: the wrapper variant under
 * Foldkit's `Got<Field>Message` convention, the Model field and Message cases to
 * spread into the parent, and placement once the parent Model exists.
 */
import { Record, Schema } from 'effect'
import type { AnyBundle, Bundle, EachConfigParam, PlaceConfigParam } from './bundle.js'
import type { PlacedCollection } from './collection.js'
import { Link, type KeyedWrapped, type KeyedWrapper, type Wrapped, type Wrapper } from './link.js'
import type { Placed } from './placed.js'

/** `search` → `GotSearchMessage`. */
export type WrapperTag<Field extends string> = `Got${Capitalize<Field>}Message`

type Parts<B> =
  B extends Bundle<
    infer Name,
    infer Args,
    infer Model,
    infer Message,
    infer OutMessage,
    infer R,
    infer S,
    infer ViewInputs,
    infer Resources,
    infer Helpers
  >
    ? {
        Name: Name
        Args: Args
        Model: Model
        Message: Message
        OutMessage: OutMessage
        R: R
        S: S
        ViewInputs: ViewInputs
        Resources: Resources
        Helpers: Helpers
      }
    : never

export interface Declared<B extends AnyBundle, Field extends string> {
  readonly field: Field
  readonly wrapper: Wrapper<WrapperTag<Field>, Parts<B>['Message']>
  /** Spread into the parent's `Schema.Struct`. */
  readonly fields: { readonly [K in Field]: Schema.Codec<Parts<B>['Model'], unknown> }
  /** Spread into the parent's `defineMessageUnion`. */
  readonly cases: Wrapper<WrapperTag<Field>, Parts<B>['Message']>['cases']
  /** Places the bundle in a parent whose `Field` holds the bundle's Model. */
  readonly at: <Parent extends { readonly [K in Field]: Parts<B>['Model'] }>() => <
    OutStepMessage = never,
    R2 = never,
  >(
    ...config: PlaceConfigParam<
      Parts<B>['Args'],
      Parent,
      Wrapped<WrapperTag<Field>, Parts<B>['Message']>,
      Parts<B>['Message'],
      Parts<B>['OutMessage'],
      OutStepMessage,
      R2
    >
  ) => Placed<
    Parts<B>['Name'],
    Parent,
    Wrapped<WrapperTag<Field>, Parts<B>['Message']> | OutStepMessage,
    Parts<B>['Model'],
    Parts<B>['Message'],
    Parts<B>['R'] | R2,
    Parts<B>['S'],
    Parts<B>['ViewInputs'],
    Parts<B>['Resources'],
    Parts<B>['Helpers']
  >
}

export interface DeclaredEach<B extends AnyBundle, Field extends string> {
  readonly field: Field
  readonly wrapper: KeyedWrapper<WrapperTag<Field>, Parts<B>['Message']>
  /** Spread into the parent's `Schema.Struct`: a record of items by key. */
  readonly fields: {
    readonly [K in Field]: Schema.$Record<
      typeof Schema.String,
      Schema.Codec<Parts<B>['Model'], unknown>
    >
  }
  readonly cases: KeyedWrapper<WrapperTag<Field>, Parts<B>['Message']>['cases']
  /** Places the bundle once per key of the parent's `Field`. */
  readonly each: <
    Parent extends { readonly [K in Field]: Readonly<Record<string, Parts<B>['Model']>> },
  >() => <OutStepMessage = never, R2 = never>(
    ...config: EachConfigParam<
      Parts<B>['Args'],
      Parent,
      KeyedWrapped<WrapperTag<Field>, Parts<B>['Message']>,
      Parts<B>['Message'],
      Parts<B>['OutMessage'],
      OutStepMessage,
      R2
    >
  ) => PlacedCollection<
    Parts<B>['Name'],
    Parent,
    KeyedWrapped<WrapperTag<Field>, Parts<B>['Message']> | OutStepMessage,
    Parts<B>['Model'],
    Parts<B>['Message'],
    Parts<B>['R'] | R2,
    Parts<B>['S'],
    Parts<B>['ViewInputs'],
    Parts<B>['Helpers']
  >
}

const wrapperTag = <Field extends string>(field: Field): WrapperTag<Field> =>
  `Got${field.charAt(0).toUpperCase()}${field.slice(1)}Message` as WrapperTag<Field>

// `AnyBundle` erases the bundle's types, so the calls below are checked loosely
// and the declared result restores them. The type tests pin that restoration.
export const declare = <B extends AnyBundle, const Field extends string>(
  bundle: B,
  field: Field,
): Declared<B, Field> => {
  const wrapper = Link.wrapper(wrapperTag(field), bundle.Message)
  return {
    field,
    wrapper,
    fields: Record.singleton(field, bundle.Model),
    cases: wrapper.cases,
    at:
      () =>
      (...config: ReadonlyArray<unknown>) =>
        (bundle.at as (...args: ReadonlyArray<unknown>) => unknown)(
          Link.field<Record<string, unknown>>()(field, wrapper),
          ...config,
        ),
  } as unknown as Declared<B, Field>
}

export const declareEach = <B extends AnyBundle, const Field extends string>(
  bundle: B,
  field: Field,
): DeclaredEach<B, Field> => {
  const wrapper = Link.keyedWrapper(wrapperTag(field), bundle.Message)
  return {
    field,
    wrapper,
    fields: Record.singleton(field, Schema.Record(Schema.String, bundle.Model)),
    cases: wrapper.cases,
    each:
      () =>
      (...config: ReadonlyArray<unknown>) =>
        (bundle.each as unknown as (...args: ReadonlyArray<unknown>) => unknown)(
          Link.collection<Record<string, Readonly<Record<string, unknown>>>>()(field, wrapper),
          ...config,
        ),
  } as unknown as DeclaredEach<B, Field>
}

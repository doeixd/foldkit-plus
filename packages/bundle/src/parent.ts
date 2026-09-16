/**
 * A parent scope: the parent's Model and Message stated once, as the Schema
 * values the application already has, so placing, linking, and assembling
 * need no type arguments and every callback is typed from context.
 */
import type { Schema } from 'effect'
import type { AnyBundle, EachConfigParam, PlaceConfigParam } from './bundle.js'
import { assemble, type Assembly } from './assembly.js'
import type { PlacedCollection } from './collection.js'
import {
  declare,
  declareEach,
  type BundleParts,
  type Declared,
  type DeclaredEach,
  type WrapperTag,
} from './declare.js'
import {
  Link,
  type AnyMessage,
  type KeyedWrapped,
  type Link as LinkType,
  type Wrapped,
  type Wrapper,
} from './link.js'
import type { Invalid, Placed } from './placed.js'

type P<B> = BundleParts<B>

/** Collections cannot place a bundle with Managed Resources; reported at the bundle. */
export type WithoutResources<B> = [keyof P<B>['Resources']] extends [never]
  ? unknown
  : Invalid<'A collection cannot place a bundle with Managed Resources: the runtime provides a resource by one tag, so every item would share it'>

/** Reported at the placement when the parent Message lacks its wrapper variant. */
type VariantCheck<Variant, Message> = [Variant] extends [Message]
  ? unknown
  : Invalid<"The parent Message does not include this placement's wrapper variant; spread its cases into defineMessageUnion">

type PlacedBy<
  B extends AnyBundle,
  Model,
  LinkMessage,
  OutStepMessage,
  R2,
  Field extends string,
> = Placed<
  P<B>['Name'],
  Model,
  LinkMessage | OutStepMessage,
  P<B>['Model'],
  P<B>['Message'],
  P<B>['R'] | R2,
  P<B>['S'],
  P<B>['ViewInputs'],
  P<B>['Resources'],
  P<B>['Helpers'],
  Field
>

type CollectionBy<
  B extends AnyBundle,
  Model,
  LinkMessage,
  OutStepMessage,
  R2,
  Field extends string,
> = PlacedCollection<
  P<B>['Name'],
  Model,
  LinkMessage | OutStepMessage,
  P<B>['Model'],
  P<B>['Message'],
  P<B>['R'] | R2,
  P<B>['S'],
  P<B>['ViewInputs'],
  P<B>['Helpers'],
  Field
>

/** Keys of the parent Model whose value is exactly the bundle's Model. */
type FieldsHolding<Model, Child> = {
  [K in keyof Model]: [Model[K]] extends [Child] ? ([Child] extends [Model[K]] ? K : never) : never
}[keyof Model] &
  string

type RecordFieldsHolding<Model, Child> = {
  [K in keyof Model]: Model[K] extends Readonly<Record<string, infer V>>
    ? [V] extends [Child]
      ? [Child] extends [V]
        ? K
        : never
      : never
    : never
}[keyof Model] &
  string

export interface Parent<Model, Message extends AnyMessage, Services = never> {
  readonly Model: Schema.Codec<Model, unknown>
  readonly Message: Schema.Codec<Message, unknown>

  /** The same scope, with the services the parent's own update may require. */
  readonly withServices: <S>() => Parent<Model, Message, S>

  /** A placement declared with `Bundle.declare`. */
  readonly at: <
    B extends AnyBundle,
    const Field extends FieldsHolding<Model, P<B>['Model']>,
    OutStepMessage = never,
    R2 = never,
  >(
    declared: Declared<B, Field>,
    ...config: PlaceConfigParam<
      P<B>['Args'],
      Model,
      Wrapped<WrapperTag<Field>, P<B>['Message']>,
      P<B>['Message'],
      P<B>['OutMessage'],
      OutStepMessage,
      R2
    > &
      VariantCheck<Wrapped<WrapperTag<Field>, P<B>['Message']>, Message>
  ) => PlacedBy<B, Model, Wrapped<WrapperTag<Field>, P<B>['Message']>, OutStepMessage, R2, Field>

  /** A bundle in a field of the parent, with the wrapper `Got<Field>Message`. */
  readonly place: <
    B extends AnyBundle,
    const Field extends FieldsHolding<Model, P<B>['Model']>,
    OutStepMessage = never,
    R2 = never,
  >(
    bundle: B,
    field: Field,
    ...config: PlaceConfigParam<
      P<B>['Args'],
      Model,
      Wrapped<WrapperTag<Field>, P<B>['Message']>,
      P<B>['Message'],
      P<B>['OutMessage'],
      OutStepMessage,
      R2
    > &
      VariantCheck<Wrapped<WrapperTag<Field>, P<B>['Message']>, Message>
  ) => PlacedBy<B, Model, Wrapped<WrapperTag<Field>, P<B>['Message']>, OutStepMessage, R2, Field>

  /** A collection declared with `Bundle.declareEach`. */
  readonly each: <
    B extends AnyBundle,
    const Field extends RecordFieldsHolding<Model, P<B>['Model']>,
    OutStepMessage = never,
    R2 = never,
  >(
    declared: DeclaredEach<B, Field>,
    ...config: EachConfigParam<
      P<B>['Args'],
      Model,
      KeyedWrapped<WrapperTag<Field>, P<B>['Message']>,
      P<B>['Message'],
      P<B>['OutMessage'],
      OutStepMessage,
      R2
    > &
      VariantCheck<KeyedWrapped<WrapperTag<Field>, P<B>['Message']>, Message>
  ) => CollectionBy<
    B,
    Model,
    KeyedWrapped<WrapperTag<Field>, P<B>['Message']>,
    OutStepMessage,
    R2,
    Field
  >

  /** A bundle per key of a record field, with the wrapper `Got<Field>Message`. */
  readonly placeEach: <
    B extends AnyBundle,
    const Field extends RecordFieldsHolding<Model, P<B>['Model']>,
    OutStepMessage = never,
    R2 = never,
  >(
    bundle: B & WithoutResources<B>,
    field: Field,
    ...config: EachConfigParam<
      P<B>['Args'],
      Model,
      KeyedWrapped<WrapperTag<Field>, P<B>['Message']>,
      P<B>['Message'],
      P<B>['OutMessage'],
      OutStepMessage,
      R2
    > &
      VariantCheck<KeyedWrapped<WrapperTag<Field>, P<B>['Message']>, Message>
  ) => CollectionBy<
    B,
    Model,
    KeyedWrapped<WrapperTag<Field>, P<B>['Message']>,
    OutStepMessage,
    R2,
    Field
  >

  /** The one list of the parent's placements and collections. */
  readonly assemble: <
    const Ps extends ReadonlyArray<
      | Placed<string, Model, Message, any, any, any, any, any, any, any>
      | PlacedCollection<string, Model, Message, any, any, any, any, any, any, any, any>
    >,
  >(
    ...placements: Ps
  ) => Assembly<Model, Message, Ps, Services>

  /** Links into this parent, without restating its type. */
  readonly link: {
    readonly field: <
      const Key extends keyof Model & string,
      const Tag extends string,
      ChildMessage,
    >(
      key: Key,
      wrapper: Wrapper<Tag, ChildMessage>,
      options?: { readonly when?: (parent: Model) => boolean },
    ) => LinkType<Model, Wrapped<Tag, ChildMessage>, Model[Key], ChildMessage>
    readonly optional: ReturnType<typeof Link.optional<Model>>
    readonly collection: ReturnType<typeof Link.collection<Model>>
    readonly collectionById: ReturnType<typeof Link.collectionById<Model>>
  }
}

// Types above are the contract; the implementation dispatches on the argument's
// shape and delegates to `declare`, `at`, and `each`, which checked each part.
type Loose = (...args: ReadonlyArray<unknown>) => any

const make = <Model, Message extends AnyMessage, Services>(
  Model: Schema.Codec<Model, unknown>,
  Message: Schema.Codec<Message, unknown>,
): Parent<Model, Message, Services> => ({
  Model,
  Message,
  withServices: () => make(Model, Message),
  at: ((declared: any, ...config: ReadonlyArray<unknown>) =>
    (declared.at() as Loose)(...config)) as Parent<Model, Message, Services>['at'],
  place: ((bundle: any, field: string, ...config: ReadonlyArray<unknown>) =>
    (declare(bundle, field).at() as Loose)(...config)) as Parent<Model, Message, Services>['place'],
  each: ((declared: any, ...config: ReadonlyArray<unknown>) =>
    (declared.each() as Loose)(...config)) as Parent<Model, Message, Services>['each'],
  placeEach: ((bundle: any, field: string, ...config: ReadonlyArray<unknown>) =>
    (declareEach(bundle, field).each() as Loose)(...config)) as Parent<
    Model,
    Message,
    Services
  >['placeEach'],
  assemble: ((...placements: ReadonlyArray<any>) =>
    assemble<Model, Message, Services>()(placements)) as Parent<
    Model,
    Message,
    Services
  >['assemble'],
  link: {
    field: (key, wrapper, options) => Link.field<Model>()(key, wrapper, options),
    optional: Link.optional<Model>(),
    collection: Link.collection<Model>(),
    collectionById: Link.collectionById<Model>(),
  },
})

/**
 * The parent scope, from the application's own Schemas:
 * `const Page = Bundle.parent({ Model, Message })`.
 */
export const parent = <Model, Message extends AnyMessage>(config: {
  readonly Model: Schema.Codec<Model, unknown>
  readonly Message: Schema.Codec<Message, unknown>
}): Parent<Model, Message> => make(config.Model, config.Message)

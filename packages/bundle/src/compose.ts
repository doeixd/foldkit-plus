/**
 * A parent stated once, as its own fields plus the bundles it places, with the
 * Model, the Message union, the placements and the assembly derived from it.
 * It is sugar over `declare`, `parent`, `at`, and `assemble`: each step builds
 * the same values those would, so everything they check still holds.
 *
 * Steps are pipeable, so each one is typed by the parent built so far: an
 * `onOut` knows the Model, a later step sees every earlier child.
 */
import { Pipeable, Schema } from 'effect'
import { defineMessageUnion, type MessageUnion } from 'foldkit/message'
import type { Assembly, PlacedIn } from './assembly.js'
import type { AnyBundle, EachConfigParam, PlaceConfigParam } from './bundle.js'
import { declare, declareEach, type BundleParts, type WrapperTag } from './declare.js'
import type { KeyedWrapped, Wrapped } from './link.js'
import { parent, type CollectionBy, type PlacedBy, type WithoutResources } from './parent.js'
import type { Invalid } from './placed.js'
import type { AnyWiring, Wiring } from './wiring.js'

type P<B> = BundleParts<B>

/** The Message cases of a parent: its own, and a wrapper per child. */
type Cases = Readonly<Record<string, Schema.Struct.Fields>>

/** A child as the composition records it, for its placed type. */
interface Child<B extends AnyBundle, Kind extends 'one' | 'each', OutStepMessage, R2> {
  readonly bundle: B
  readonly kind: Kind
  readonly outStepMessage?: OutStepMessage
  readonly requirements?: R2
}
type AnyChild = Child<AnyBundle, 'one' | 'each', any, any>

type ModelOf<Fields extends Schema.Struct.Fields> = Schema.Struct.Type<Fields>
type MessageOf<C extends Cases> = MessageUnion<C>['Type']

type PlacedChild<C, Model, Message, Field extends string> =
  C extends Child<infer B, 'one', infer OutStepMessage, infer R2>
    ? PlacedBy<B, Model, Wrapped<WrapperTag<Field>, P<B>['Message']>, OutStepMessage, R2, Field>
    : C extends Child<infer B, 'each', infer OutStepMessage, infer R2>
      ? CollectionBy<
          B,
          Model,
          KeyedWrapped<WrapperTag<Field>, P<B>['Message']>,
          OutStepMessage,
          R2,
          Field
        >
      : never

type ChildrenOf<Children, Model, Message> = {
  readonly [K in keyof Children & string]: PlacedChild<Children[K], Model, Message, K>
}

/**
 * A parent: `Model` and `Message` to hand to `Surface.application` or the
 * runtime, each child placed under its field, and the assembly of all of them.
 */
export interface Composition<
  Fields extends Schema.Struct.Fields,
  C extends Cases,
  Children,
  Services = never,
  Ws extends ReadonlyArray<AnyWiring> = readonly [],
>
  extends Pipeable.Pipeable {
  /** The parent's Model: its own fields, and each child's under its field. */
  readonly Model: Schema.Struct<Fields>
  /** The parent's Message: its own cases, and `Got<Field>Message` per child. */
  readonly Message: MessageUnion<C>
  /** Each child as placed, by field: `children.hello.view(model, h)`, `children.hello.helpers`. */
  readonly children: ChildrenOf<Children, ModelOf<Fields>, MessageOf<C>>
  /** The one assembly of every child and wiring: `initial`, `update`, `subscriptions`, `complete`. */
  readonly placements: AssemblyOf<
    ModelOf<Fields>,
    MessageOf<C>,
    ReadonlyArray<
      ChildrenOf<Children, ModelOf<Fields>, MessageOf<C>>[keyof Children & string] | Ws[number]
    >,
    Services
  >
}

// Deferred until the types are concrete: only then can the items be seen to fit.
type AssemblyOf<Model, Message, Items, Services> =
  Items extends ReadonlyArray<PlacedIn<Model, Message>>
    ? Assembly<Model, Message, Items, Services>
    : never

/** Any composition, for the steps that accept one. */
export type AnyComposition = Composition<any, any, any, any, any>

/** The recorded parts a composition is built from, in the order they were added. */
interface Spec {
  readonly fields: Schema.Struct.Fields
  readonly cases: Cases
  readonly children: ReadonlyArray<{
    readonly field: string
    readonly kind: 'one' | 'each'
    readonly bundle: AnyBundle
    readonly config: ReadonlyArray<unknown>
  }>
  readonly wirings: ReadonlyArray<AnyWiring>
}

const specs = new WeakMap<object, Spec>()

const specOf = (composition: object): Spec => {
  const spec = specs.get(composition)
  if (spec === undefined) {
    throw new Error(
      'foldkit-bundle: a composition step was given something Bundle.compose did not make',
    )
  }
  return spec
}

// `AnyBundle` and the recorded config erase the types; the Composition
// interface restores them, and the type tests pin that restoration.
const build = (spec: Spec): AnyComposition => {
  const fields: { [key: string]: Schema.Struct.Fields[string] } = { ...spec.fields }
  const cases: Record<string, Schema.Struct.Fields> = { ...spec.cases }
  const declared = spec.children.map(child => {
    if (child.field in fields) {
      throw new Error(`Bundle.compose: the field "${child.field}" is declared twice`)
    }
    const declaration =
      child.kind === 'one'
        ? declare(child.bundle, child.field)
        : declareEach(child.bundle as never, child.field)
    Object.assign(fields, declaration.fields)
    for (const [tag, value] of Object.entries(declaration.cases)) {
      if (tag in cases) {
        throw new Error(`Bundle.compose: the Message case "${tag}" is declared twice`)
      }
      cases[tag] = value as Schema.Struct.Fields
    }
    return { child, declaration }
  })
  const Model = Schema.Struct(fields)
  const Message = defineMessageUnion(cases as never)
  const page = parent({ Model, Message } as never) as ReturnType<typeof parent<any, any>>
  const children = Object.fromEntries(
    declared.map(({ child, declaration }) => [
      child.field,
      child.kind === 'one'
        ? (page.at as (...args: ReadonlyArray<unknown>) => unknown)(declaration, ...child.config)
        : (page.each as (...args: ReadonlyArray<unknown>) => unknown)(declaration, ...child.config),
    ]),
  )
  const placements = (page.assemble as (...items: ReadonlyArray<unknown>) => unknown)(
    ...Object.values(children),
    ...spec.wirings,
  )
  const composition = {
    Model,
    Message,
    children,
    placements,
    pipe() {
      // eslint-disable-next-line prefer-rest-params
      return Pipeable.pipeArguments(this, arguments)
    },
  } as unknown as AnyComposition
  specs.set(composition, spec)
  return composition
}

const extend = (self: object, change: (spec: Spec) => Spec): AnyComposition =>
  build(change(specOf(self)))

/**
 * A parent from its own fields, as `Schema.Struct` takes them. Add its own
 * Messages with `Bundle.withMessages` and its children with `Bundle.withChild`
 * and `Bundle.withEach`, through `pipe`.
 */
export const compose = <const Fields extends Schema.Struct.Fields>(
  fields: Fields,
): Composition<Fields, {}, {}> =>
  build({ fields, cases: {}, children: [], wirings: [] }) as unknown as Composition<Fields, {}, {}>

/** The parent's own Message cases, as `defineMessageUnion` takes them. */
export const withMessages =
  <const Own extends Cases>(own: Own) =>
  <
    Fields extends Schema.Struct.Fields,
    C extends Cases,
    Children,
    Services,
    Ws extends ReadonlyArray<AnyWiring>,
  >(
    self: Composition<Fields, C, Children, Services, Ws>,
  ): Composition<Fields, C & Own, Children, Services, Ws> =>
    extend(self, spec => {
      const repeated = Object.keys(own).find(tag => tag in spec.cases)
      if (repeated !== undefined) {
        throw new Error(`Bundle.withMessages: the Message case "${repeated}" is declared twice`)
      }
      return { ...spec, cases: { ...spec.cases, ...own } }
    }) as unknown as Composition<Fields, C & Own, Children, Services, Ws>

/** Reported at the field when the parent already has one by that name. */
type FreshField<Field extends string, Fields> = Field extends keyof Fields
  ? Invalid<'The parent already has a field by this name'>
  : Field

type WithOne<Fields, Field extends string, B> = Fields & {
  readonly [K in Field]: Schema.Codec<P<B>['Model'], unknown>
}
type WithOneCases<C, Field extends string, B> = C & {
  readonly [K in WrapperTag<Field>]: { readonly message: Schema.Codec<P<B>['Message'], unknown> }
}

/**
 * A child in a field of the parent, with the wrapper `Got<Field>Message`. The
 * config is what `Page.at` takes: `args` when the bundle has them, `onOut` when
 * it has an OutMessage, typed by the parent as it is at this step.
 */
export const withChild =
  <
    const Field extends string,
    B extends AnyBundle,
    Fields extends Schema.Struct.Fields,
    C extends Cases,
    Children,
    Services,
    Ws extends ReadonlyArray<AnyWiring>,
    OutStepMessage = never,
    R2 = never,
  >(
    field: FreshField<Field, Fields>,
    bundle: B,
    ...config: PlaceConfigParam<
      P<B>['Args'],
      ModelOf<WithOne<Fields, Field, B>>,
      Wrapped<WrapperTag<Field>, P<B>['Message']>,
      P<B>['Message'],
      P<B>['OutMessage'],
      OutStepMessage,
      R2
    >
  ) =>
  (
    self: Composition<Fields, C, Children, Services, Ws>,
  ): Composition<
    WithOne<Fields, Field, B>,
    WithOneCases<C, Field, B>,
    Children & { readonly [K in Field]: Child<B, 'one', OutStepMessage, R2> },
    Services,
    Ws
  > =>
    extend(self, spec => ({
      ...spec,
      children: [...spec.children, { field: field as string, kind: 'one', bundle, config }],
    })) as never

type WithEach<Fields, Field extends string, B> = Fields & {
  readonly [K in Field]: Schema.$Record<typeof Schema.String, Schema.Codec<P<B>['Model'], unknown>>
}
type WithEachCases<C, Field extends string, B> = C & {
  readonly [K in WrapperTag<Field>]: {
    readonly key: Schema.Codec<string, string>
    readonly message: Schema.Codec<P<B>['Message'], unknown>
  }
}

/**
 * A child per key of a record field of the parent, with the wrapper
 * `Got<Field>Message` carrying the key. The config is what `Page.each` takes.
 */
export const withEach =
  <
    const Field extends string,
    B extends AnyBundle,
    Fields extends Schema.Struct.Fields,
    C extends Cases,
    Children,
    Services,
    Ws extends ReadonlyArray<AnyWiring>,
    OutStepMessage = never,
    R2 = never,
  >(
    field: FreshField<Field, Fields>,
    bundle: B & WithoutResources<B>,
    ...config: EachConfigParam<
      P<B>['Args'],
      ModelOf<WithEach<Fields, Field, B>>,
      KeyedWrapped<WrapperTag<Field>, P<B>['Message']>,
      P<B>['Message'],
      P<B>['OutMessage'],
      OutStepMessage,
      R2
    >
  ) =>
  (
    self: Composition<Fields, C, Children, Services, Ws>,
  ): Composition<
    WithEach<Fields, Field, B>,
    WithEachCases<C, Field, B>,
    Children & { readonly [K in Field]: Child<B, 'each', OutStepMessage, R2> },
    Services,
    Ws
  > =>
    extend(self, spec => ({
      ...spec,
      children: [...spec.children, { field: field as string, kind: 'each', bundle, config }],
    })) as never

/**
 * An integration's wiring (Remote, Mirror, Sync, Agent), joined to the
 * assembly after the children. A wiring is usually made from the composition's
 * own Model, so add it in a second `pipe` once that Model exists.
 */
export const withWiring =
  <const W extends ReadonlyArray<AnyWiring>>(...wirings: W) =>
  <
    Fields extends Schema.Struct.Fields,
    C extends Cases,
    Children,
    Services,
    Ws extends ReadonlyArray<AnyWiring>,
  >(
    self: Composition<Fields, C, Children, Services, Ws> &
      ([W[number]] extends [Wiring<ModelOf<Fields>, MessageOf<C>, any>]
        ? unknown
        : Invalid<"A wiring is for another parent's Model or Message">),
  ): Composition<Fields, C, Children, Services, readonly [...Ws, ...W]> =>
    extend(self, spec => ({ ...spec, wirings: [...spec.wirings, ...wirings] })) as never

/** The services the parent's own update may require, as `Bundle.parent(...).withServices` states them. */
export const withServices =
  <S>() =>
  <
    Fields extends Schema.Struct.Fields,
    C extends Cases,
    Children,
    Ws extends ReadonlyArray<AnyWiring>,
  >(
    self: Composition<Fields, C, Children, any, Ws>,
  ): Composition<Fields, C, Children, S, Ws> =>
    self as unknown as Composition<Fields, C, Children, S, Ws>

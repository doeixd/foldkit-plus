/**
 * Extends a bundle without forking it. Each combinator returns a new bundle and
 * works data-first or in a pipe: `Counter.pipe(Bundle.rename('Clicks'))`.
 */
import { Function } from 'effect'
import type * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { make, type AnyBundle, type Bundle, type BundleSpec, type Helper } from './bundle.js'
import type { BundleParts } from './declare.js'

type P<B> = BundleParts<B>

type Rebuilt<
  B,
  Changes extends Partial<{ Name: string; S: unknown; Helpers: unknown }> = {},
> = Bundle<
  Changes extends { Name: infer N extends string } ? N : P<B>['Name'],
  P<B>['Args'],
  P<B>['Model'],
  P<B>['Message'],
  P<B>['OutMessage'],
  P<B>['R'],
  Changes extends { S: infer S } ? S : P<B>['S'],
  P<B>['ViewInputs'],
  P<B>['Resources'],
  Extract<
    Changes extends { Helpers: infer H } ? H : P<B>['Helpers'],
    Readonly<Record<string, HelperOf<B>>>
  >
>

type UpdateOf<B> = (
  model: P<B>['Model'],
  message: P<B>['Message'],
  args: P<B>['Args'],
) => Update.ReturnWithOutMessage<P<B>['Model'], P<B>['Message'], P<B>['OutMessage'], P<B>['R']>

type InitOf<B> = (args: P<B>['Args']) => Update.Return<P<B>['Model'], P<B>['Message'], P<B>['R']>

const specOf = (
  bundle: AnyBundle,
): BundleSpec<string, any, any, any, any, any, any, any, any, any> => {
  const { with: _with, at: _at, each: _each, pipe: _pipe, ...spec } = bundle
  return spec
}

const rebuild = (bundle: AnyBundle, changes: object): any => make({ ...specOf(bundle), ...changes })

/** A new name, for the placement keys and the Module contract. */
export const rename: {
  <const Name extends string>(
    name: Name,
  ): <B extends AnyBundle>(self: B) => Rebuilt<B, { Name: Name }>
  <B extends AnyBundle, const Name extends string>(self: B, name: Name): Rebuilt<B, { Name: Name }>
} = Function.dual(2, (self: AnyBundle, name: string) => rebuild(self, { name }))

/** Wraps `update`, for logging, guards, or extra transitions. */
export const mapUpdate: {
  <B extends AnyBundle>(f: (update: UpdateOf<B>) => UpdateOf<B>): (self: B) => Rebuilt<B>
  <B extends AnyBundle>(self: B, f: (update: UpdateOf<B>) => UpdateOf<B>): Rebuilt<B>
} = Function.dual(2, (self: AnyBundle, f: (update: AnyBundle['update']) => AnyBundle['update']) =>
  rebuild(self, { update: f(self.update) }),
)

/** Wraps `init`, for example to start an extra Command. */
export const mapInit: {
  <B extends AnyBundle>(f: (init: InitOf<B>) => InitOf<B>): (self: B) => Rebuilt<B>
  <B extends AnyBundle>(self: B, f: (init: InitOf<B>) => InitOf<B>): Rebuilt<B>
} = Function.dual(2, (self: AnyBundle, f: (init: AnyBundle['init']) => AnyBundle['init']) =>
  rebuild(self, { init: f(self.init) }),
)

type ViewOf<B> = Submodel.View<P<B>['Model'], P<B>['Message'], P<B>['ViewInputs']>

/** Replaces or wraps the view; the result must still come from `Submodel.defineView`. */
export const mapView: {
  <B extends AnyBundle>(f: (view: ViewOf<B> | undefined) => ViewOf<B>): (self: B) => Rebuilt<B>
  <B extends AnyBundle>(self: B, f: (view: ViewOf<B> | undefined) => ViewOf<B>): Rebuilt<B>
} = Function.dual(2, (self: AnyBundle, f: (view: AnyBundle['view']) => AnyBundle['view']) =>
  rebuild(self, { view: f(self.view) }),
)

/** Adds programmatic entry points beside the bundle's own. */
export const withHelpers: {
  <B extends AnyBundle, const Helpers extends Readonly<Record<string, HelperOf<B>>>>(
    helpers: Helpers,
  ): (self: B) => Rebuilt<B, { Helpers: P<B>['Helpers'] & Helpers }>
  <B extends AnyBundle, const Helpers extends Readonly<Record<string, HelperOf<B>>>>(
    self: B,
    helpers: Helpers,
  ): Rebuilt<B, { Helpers: P<B>['Helpers'] & Helpers }>
} = Function.dual(2, (self: AnyBundle, helpers: object) =>
  rebuild(self, { helpers: { ...self.helpers, ...helpers } }),
)

type HelperOf<B> = Helper<P<B>['Model'], P<B>['Message'], P<B>['OutMessage'], P<B>['R']>

/** Adds Subscriptions beside the bundle's own. A duplicate key throws, as in `Subscription.aggregate`. */
export const withSubscriptions: {
  <B extends AnyBundle, S2 = never>(
    subscriptions: (
      args: P<B>['Args'],
    ) => Subscription.Subscriptions<P<B>['Model'], P<B>['Message'], S2>,
  ): (self: B) => Rebuilt<B, { S: P<B>['S'] | S2 }>
  <B extends AnyBundle, S2 = never>(
    self: B,
    subscriptions: (
      args: P<B>['Args'],
    ) => Subscription.Subscriptions<P<B>['Model'], P<B>['Message'], S2>,
  ): Rebuilt<B, { S: P<B>['S'] | S2 }>
} = Function.dual(
  2,
  (self: AnyBundle, extra: (args: unknown) => Subscription.Subscriptions<unknown, any, unknown>) =>
    rebuild(self, {
      subscriptions: (args: unknown) =>
        Subscription.aggregate<unknown, any, unknown>()(
          self.subscriptions?.(args) ?? {},
          extra(args),
        ),
    }),
)

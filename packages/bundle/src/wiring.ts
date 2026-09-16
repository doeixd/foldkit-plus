/**
 * How an integration (Remote, Mirror, Sync, Agent) joins an assembly. The same
 * shape is declared in `foldkit-surface` as `Wiring`; it is repeated here
 * structurally so `foldkit-bundle` does not depend on Surface.
 */
import type { Option } from 'effect'
import type * as ManagedResource from 'foldkit/managedResource'
import type * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import type { Url } from 'foldkit/url'

export interface Wiring<Model, Message, R = never> {
  /** Names the integration in errors and the Module: `remote:Board`, `mirror:filters`. */
  readonly key: string
  /** Message tags `route` handles. Two items handling one tag is an error unless it is `shared`. */
  readonly handles: readonly string[]
  /** Tags several integrations may handle, each for its own values. */
  readonly shared?: readonly string[] | undefined
  /**
   * Folds a Message this integration handles; `None` for any other. A method, so
   * a wiring that routes only its own variants fits an assembly over the whole
   * application union.
   */
  route?(model: Model, message: Message): Option.Option<Update.Return<Model, Message, R>>
  /** Runs once when the application starts, after placements. */
  readonly init?: Update.Step<Model, Message, R> | undefined
  /** Applies the URL to the Model, at startup and whenever the URL changes. */
  readonly onUrl?: ((model: Model, url: Url) => Model) | undefined
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, R> | undefined
  readonly resources?:
    Readonly<Record<string, ManagedResource.Entry<Model, Message, any, any, any>>> | undefined
  /** Its Module contract, read by `foldkit-bundle-surface`. */
  readonly contract?: object | undefined
}

export type AnyWiring = Wiring<any, any, any>

export const isWiring = (value: unknown): value is AnyWiring =>
  typeof value === 'object' &&
  value !== null &&
  'handles' in value &&
  Array.isArray((value as { readonly handles: unknown }).handles)

/**
 * A bundle whose `update` and `view` load on demand. The declaration, what
 * the parent Schema and the boot need, stays in the boot chunk: `Model`,
 * `Message`, `args`, `init`, and the `subscriptions`, `resources` and
 * `helpers` Foldkit wires at boot. The bodies live in a chunk that loads on
 * the first Message inside the bundle, or when `load` is called.
 */
import { Effect } from 'effect'
import * as Submodel from 'foldkit/submodel'
import type { AnyMessage } from './link.js'
import { make, type Bundle, type BundleSpec, type Helper, type ResourceEntries } from './bundle.js'

/** The bodies a lazy bundle loads: its `update`, and its `view` if it has one. */
export interface Body<Model, Message extends AnyMessage, Args, OutMessage, R, ViewInputs> {
  readonly update: BundleSpec<
    string,
    Args,
    Model,
    Message,
    OutMessage,
    R,
    never,
    ViewInputs,
    {},
    {}
  >['update']
  readonly view?: Submodel.View<Model, Message, ViewInputs>
}

/** A lazy bundle's declaration: a spec without the bodies, plus what to show until they load. */
export type LazySpec<
  Name extends string,
  Args,
  Model,
  Message extends AnyMessage,
  OutMessage,
  R,
  S,
  ViewInputs,
  Resources extends ResourceEntries<Model, Message>,
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>>,
> = Omit<
  BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  'update' | 'view'
> & {
  /** Rendered until the bodies load; nothing by default. */
  readonly while?: Submodel.View<Model, Message, ViewInputs>
}

export interface Lazy<
  Name extends string,
  Args,
  Model,
  Message extends AnyMessage,
  OutMessage,
  R,
  S,
  ViewInputs,
  Resources extends ResourceEntries<Model, Message>,
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>>,
> extends Bundle<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers> {
  /** Loads the bodies, once; later calls return the same promise. */
  readonly load: () => Promise<void>
  readonly isLoaded: () => boolean
}

/** Any lazy bundle, for code that loads bodies without caring which. */
export interface Loadable {
  readonly name: string
  readonly load: () => Promise<void>
  readonly isLoaded: () => boolean
}

/**
 * A bundle whose bodies load on demand. Until they have, a Message reaching
 * `update` leaves the Model as it is and returns one Command, which loads
 * the bodies and yields the same Message again, so nothing is lost and the
 * Model ends where an eager bundle's would; the view renders `while`, or
 * nothing. That early Message passes through `update` twice, which a
 * `mapUpdate` wrapper and a replay of recorded Messages after the load both
 * see: load the bodies before the first interaction to avoid it. `subscriptions`, `resources` and `helpers` stay in the
 * declaration: Foldkit starts the first two at boot, and a helper runs
 * synchronously, so none can wait for a chunk.
 */
export const lazy = <
  const Name extends string,
  Model,
  Message extends AnyMessage,
  Args = void,
  OutMessage = never,
  R = never,
  S = never,
  ViewInputs = void,
  Resources extends ResourceEntries<Model, Message> = {},
  Helpers extends Readonly<Record<string, Helper<Model, Message, OutMessage, R>>> = {},
>(
  spec: LazySpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>,
  load: () => Promise<Body<Model, Message, Args, OutMessage, R, ViewInputs>>,
): Lazy<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers> => {
  const { while: placeholder, ...declaration } = spec
  let body: Body<Model, Message, Args, OutMessage, R, ViewInputs> | undefined
  let loading: Promise<void> | undefined
  // A load that fails is forgotten, so the next Message or `load()` tries again
  // rather than awaiting the same rejection for the rest of the session.
  const start = () =>
    (loading ??= load().then(
      loaded => {
        body = loaded
      },
      (error: unknown) => {
        loading = undefined
        throw error
      },
    ))
  const view = Submodel.defineView<Model, Message, ViewInputs>(((
    ...args: ReadonlyArray<unknown>
  ) => {
    const current = (body?.view ?? placeholder) as
      | ((...args: ReadonlyArray<unknown>) => ReturnType<Submodel.View<Model, Message, void>>)
      | undefined
    return current === undefined ? null : current(...args)
  }) as never)
  const bundle = make({
    ...declaration,
    update: (model, message, args) =>
      body === undefined
        ? {
            model,
            commands: [
              {
                name: `Load${spec.name}`,
                effect: Effect.promise(start).pipe(Effect.map(() => message)),
              },
            ],
          }
        : body.update(model, message, args),
    view,
  } as BundleSpec<Name, Args, Model, Message, OutMessage, R, S, ViewInputs, Resources, Helpers>)
  return { ...bundle, load: start, isLoaded: () => body !== undefined }
}

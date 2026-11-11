import { Option } from 'effect'
import { RemoteData } from 'foldkit-remote'

/** What a read holds: its value once it is Ready or Refreshing, nothing while it waits or has failed. */
export const heldOf = <A>(read: RemoteData<A>): Option.Option<A> =>
  RemoteData.match(read, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: Option.some,
    Refreshing: Option.some,
    Failed: () => Option.none(),
    NotFound: () => Option.none(),
  })

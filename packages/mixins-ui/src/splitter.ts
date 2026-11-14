import { Option } from 'effect'
import type { Behaviors } from 'foldkit-mixins'

/**
 * What the keys on a window splitter's handle send, for `Resizable` and
 * `Sidebar` to share: the APG's arrows, Home and End, and Enter. Each side
 * says what its key does, or `none` where the key would change nothing (Home at
 * the smallest place), which leaves the key alone.
 */
export interface SplitterKeys<Message> {
  /** The panels lie one over the other: the arrows are ArrowUp and ArrowDown. */
  readonly stacked: boolean
  /** Under `rtl` a side-by-side split's ArrowLeft grows its first panel. */
  readonly direction: 'ltr' | 'rtl' | undefined
  /** One step toward the first panel's smallest. */
  readonly shrink: Message
  /** One step toward the first panel's largest. */
  readonly grow: Message
  /** Home: the smallest place the handle may stand, collapsed where a panel collapses there. */
  readonly smallest: Option.Option<Message>
  /** End: the largest place. */
  readonly largest: Option.Option<Message>
  /** Enter: collapse the collapsible panel, or put it back. */
  readonly toggle: Option.Option<Message>
}

/** The keydown routes of a splitter's handle, for `Behaviors.Keyboard.behavior`. */
export const routes = <Message>(
  keys: SplitterKeys<Message>,
): ReadonlyArray<Behaviors.Keyboard.Route<unknown, Message>> => {
  const send = (name: string, key: string, message: Message) => ({
    name,
    key,
    toMessage: () => Option.some(message),
  })
  const [shrinking, growing] = keys.stacked
    ? (['ArrowUp', 'ArrowDown'] as const)
    : keys.direction === 'rtl'
      ? (['ArrowRight', 'ArrowLeft'] as const)
      : (['ArrowLeft', 'ArrowRight'] as const)
  return [
    send('Shrink', shrinking, keys.shrink),
    send('Grow', growing, keys.grow),
    ...Option.match(keys.smallest, {
      onNone: () => [],
      onSome: message => [send('Smallest', 'Home', message)],
    }),
    ...Option.match(keys.largest, {
      onNone: () => [],
      onSome: message => [send('Largest', 'End', message)],
    }),
    ...Option.match(keys.toggle, {
      onNone: () => [],
      onSome: message => [send('Toggle', 'Enter', message)],
    }),
  ]
}

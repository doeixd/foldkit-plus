import type { Attribute, ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'
import type { ComponentType, ReactNode } from 'react'
import { HostElement, ensureHostElementDefined, type HostInput } from './host.js'

/** Prop names of `Props` that can be declared as events: callbacks whose return value React ignores. */
export type EventName<Props> = {
  [K in keyof Props]-?: NonNullable<Props[K]> extends (...args: any) => infer Result
    ? [Result] extends [void]
      ? K
      : never
    : never
}[keyof Props] &
  string

type EventArgs<Props, K extends keyof Props> =
  NonNullable<Props[K]> extends (...args: infer Args) => any ? Args : never

/** Options for one render of a React island inside a Foldkit view. */
export type ViewOptions<Props, Events extends keyof Props, Message> = ({} extends Omit<
  Props,
  Events
>
  ? { readonly props?: Omit<Props, Events> }
  : { readonly props: Omit<Props, Events> }) & {
  /** Maps each declared event's arguments to the Message it dispatches. An omitted event is not passed to the component. */
  readonly messages?: { readonly [K in Events]?: (...args: EventArgs<Props, K>) => Message }
  /** Rendered while the component suspends. Every island has its own Suspense boundary. */
  readonly suspenseFallback?: ReactNode
  /** Catches render errors inside the island instead of unmounting its React root. */
  readonly errorBoundary?: {
    readonly fallback: (error: unknown) => ReactNode
    readonly toMessage?: (error: unknown) => Message
  }
  /** Attributes on the Foldkit-owned host element, such as `h.Key` or `h.Class`. */
  readonly hostAttributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
}

export interface ReactComponent<Props, Events extends keyof Props> {
  /** Renders the component as an island that React owns and Foldkit places. */
  readonly view: <Message>(
    options: ViewOptions<Props, Events, Message>,
    h: HtmlBuilder<Message>,
  ) => Html
}

/**
 * Wraps a React component for use in a Foldkit view. Event props must be
 * named: a function prop such as `renderItem` is an ordinary prop, not an event.
 */
export const define = <Props extends object, const Events extends EventName<Props> = never>(
  component: ComponentType<Props>,
  config?: { readonly events: ReadonlyArray<Events> },
): ReactComponent<Props, Events> => {
  const events: ReadonlySet<string> = new Set(config?.events)
  return {
    view: (options, h) => {
      ensureHostElementDefined()
      const input: HostInput = {
        component,
        props: (options.props ?? {}) as Readonly<Record<string, unknown>>,
        // Only declared events become callbacks, whatever else the object carries at runtime.
        messages: Object.fromEntries(
          Object.entries(options.messages ?? {}).filter(([name]) => events.has(name)),
        ),
        suspenseFallback: options.suspenseFallback ?? null,
        errorBoundary: options.errorBoundary,
      }
      const host = HostElement.withMessage(h)
      return host(
        [
          ...(options.hostAttributes ?? []),
          host.Input(input),
          host.OnFoldkitReactMessage(message => message),
        ],
        [],
      )
    },
  }
}

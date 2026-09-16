import type { Inbound, Outbound, Ports } from 'foldkit/port'
import type { InboundPortHandle, OutboundPortHandle } from 'foldkit/runtime'
import { createElement, useEffect, useRef, type CSSProperties, type FunctionComponent } from 'react'
import { useFoldkitElement, type Program } from './useFoldkitElement.js'

type Channels<P, Side extends 'inbound' | 'outbound'> = P extends { readonly [S in Side]?: infer C }
  ? C extends Readonly<Record<string, unknown>>
    ? C
    : {}
  : {}

type Encoded<Port> =
  Port extends Inbound<any, infer E> ? E : Port extends Outbound<any, infer E> ? E : never

/** Selects an inbound Port's value from props; the Port receives it again only when it changes. */
export type InboundBinding<Props, Value> =
  | ((props: Props) => Value)
  | {
      readonly select: (props: Props) => Value
      /** Defaults to `Object.is`. */
      readonly equals: (previous: Value, next: Value) => boolean
    }

export interface FoldkitComponentConfig<Props, P extends Ports | undefined> {
  /** Builds the program. Props here are initial configuration: later changes do not reach it. */
  readonly make: (container: HTMLElement, props: Props) => Program<P>
  /** Props that keep flowing in, one binding per inbound Port. */
  readonly inbound?: {
    readonly [K in keyof Channels<P, 'inbound'>]?: InboundBinding<
      Props,
      Encoded<Channels<P, 'inbound'>[K]>
    >
  }
  /** Outbound Port values, delivered with the latest props, typically to call a callback prop. */
  readonly outbound?: {
    readonly [K in keyof Channels<P, 'outbound'>]?: (
      value: Encoded<Channels<P, 'outbound'>[K]>,
      props: Props,
    ) => void
  }
  /** Props that name the program's identity: a changed key replaces the runtime. */
  readonly restartKey?: (props: Props) => unknown
}

export type HostProps = { readonly className?: string; readonly style?: CSSProperties }

type Binding = {
  readonly select: (props: unknown) => unknown
  readonly equals: (previous: unknown, next: unknown) => boolean
}

/** Wraps a Foldkit program as a React component whose props reach it only through Ports. */
export const define = <Props extends object, P extends Ports | undefined>(
  config: FoldkitComponentConfig<Props, P>,
): FunctionComponent<Props & HostProps> => {
  const inbound = (
    Object.entries(config.inbound ?? {}) as Array<[string, InboundBinding<unknown, unknown>]>
  ).map(([name, binding]): readonly [string, Binding] => [
    name,
    typeof binding === 'function' ? { select: binding, equals: Object.is } : binding,
  ])
  const outbound = Object.entries(config.outbound ?? {}) as Array<
    [string, (value: unknown, props: Props) => void]
  >

  const FoldkitComponent: FunctionComponent<Props & HostProps> = props => {
    const latest = useRef(props)
    latest.current = props
    // Last value sent per Port, reset for each runtime so a fresh one receives every value.
    const sent = useRef<{ handle: unknown; values: Map<string, unknown> }>({
      handle: undefined,
      values: new Map(),
    })

    const { ref, handle } = useFoldkitElement<P>({
      make: container => config.make(container, latest.current),
      restartKey: config.restartKey?.(props),
      onEmbed: embedded => {
        const ports = embedded.ports as Readonly<Record<string, OutboundPortHandle<unknown>>>
        const unsubscribes = outbound.map(([name, deliver]) =>
          ports[name]?.subscribe(value => deliver(value, latest.current)),
        )
        return () => unsubscribes.forEach(unsubscribe => unsubscribe?.())
      },
    })

    useEffect(() => {
      if (!handle) return
      if (sent.current.handle !== handle) sent.current = { handle, values: new Map() }
      const { values } = sent.current
      const ports = handle.ports as Readonly<Record<string, InboundPortHandle<unknown>>>
      for (const [name, { select, equals }] of inbound) {
        const value = select(props)
        if (values.has(name) && equals(values.get(name), value)) continue
        // Recorded even if the Schema rejects it, so an invalid value is logged once, not every render.
        values.set(name, value)
        ports[name]?.send(value)
      }
    })

    return createElement('div', { ref, className: props.className, style: props.style })
  }
  return FoldkitComponent
}

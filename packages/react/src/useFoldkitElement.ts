import type { Ports } from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'

/** A program `Runtime.embed` can start without Flags options. */
export type Program<P extends Ports | undefined> = Runtime.MakeRuntimeReturn<
  P,
  void,
  never,
  'Application' | 'Element'
>

export interface FoldkitElementOptions<P extends Ports | undefined> {
  /** Builds the program for a container this hook creates. Read once per runtime. */
  readonly make: (container: HTMLElement) => Program<P>
  /** A change disposes the running program and embeds a fresh one. */
  readonly restartKey?: unknown
  /**
   * Runs right after `embed`, before any outbound value is delivered, so a
   * subscription here sees emissions from init Commands. Return a cleanup.
   */
  readonly onEmbed?: (handle: Runtime.EmbedHandle<P>) => void | (() => void)
}

export interface FoldkitElement<P extends Ports | undefined, E extends HTMLElement> {
  /** Attach to the element the Foldkit program renders inside. React must give it no children. */
  readonly ref: RefObject<E | null>
  /** The running program's Ports, or `undefined` before the first effect and after unmount. */
  readonly handle: Runtime.EmbedHandle<P> | undefined
}

/**
 * Embeds a Foldkit program under a React-owned element for the component's
 * lifetime. The host talks to it only through the handle's Ports.
 */
export const useFoldkitElement = <
  P extends Ports | undefined,
  E extends HTMLElement = HTMLDivElement,
>(
  options: FoldkitElementOptions<P>,
): FoldkitElement<P, E> => {
  const ref = useRef<E>(null)
  const [handle, setHandle] = useState<Runtime.EmbedHandle<P>>()
  const latest = useRef(options)
  latest.current = options
  // The runtime resolves its container by id.
  const id = `foldkit-${useId().replace(/[^\w-]/g, '')}`

  useEffect(() => {
    const host = ref.current
    if (!host) return
    // Foldkit patches its container in place, so it gets an element React never renders.
    const container = document.createElement('div')
    container.id = id
    host.appendChild(container)
    const embedded = Runtime.embed(latest.current.make(container))
    const cleanup = latest.current.onEmbed?.(embedded)
    setHandle(embedded)
    return () => {
      cleanup?.()
      embedded.dispose()
      // The host has no React children; clear whatever node the runtime left in place.
      host.replaceChildren()
      setHandle(undefined)
    }
  }, [id, options.restartKey])

  return { ref, handle }
}

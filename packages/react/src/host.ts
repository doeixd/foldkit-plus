import { Schema } from 'effect'
import { CustomElement } from 'foldkit'
import {
  Component,
  Suspense,
  createElement,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'

export const HOST_TAG = 'foldkit-react-host'
const MESSAGE_EVENT = 'foldkit-react-message'

/** Everything one island render needs. Foldkit writes a fresh one per view as a DOM property. */
export interface HostInput {
  readonly component: ComponentType<any>
  readonly props: Readonly<Record<string, unknown>>
  readonly messages: Readonly<Record<string, unknown>>
  readonly suspenseFallback: ReactNode
  readonly errorBoundary:
    | {
        readonly fallback: (error: unknown) => ReactNode
        readonly toMessage?: (error: unknown) => unknown
      }
    | undefined
}

export const HostElement = CustomElement.define({
  tag: HOST_TAG,
  properties: { input: Schema.Any },
  events: { 'foldkit-react-message': Schema.Any },
})

interface BoundaryProps {
  readonly input: HostInput
  readonly emit: (message: unknown) => void
  readonly children?: ReactNode
}

class Boundary extends Component<BoundaryProps, { readonly error: { value: unknown } | null }> {
  override state = { error: null as { value: unknown } | null }

  static getDerivedStateFromError(value: unknown) {
    return { error: { value } }
  }

  override componentDidCatch(value: unknown, _info: ErrorInfo) {
    const toMessage = this.props.input.errorBoundary?.toMessage
    if (toMessage) this.props.emit(toMessage(value))
  }

  override render() {
    const { error } = this.state
    const errorBoundary = this.props.input.errorBoundary
    // Without a configured boundary the error propagates to the root, as it would in plain React.
    if (error && errorBoundary) return errorBoundary.fallback(error.value)
    if (error) throw error.value
    return this.props.children
  }
}

const defineHostElement = () => {
  class FoldkitReactHost extends HTMLElement {
    #root: Root | undefined
    #input: HostInput | undefined
    // One stable callback per event name, so a React child's effects keyed on
    // `onChange` do not rerun on every Foldkit render.
    readonly #callbacks = new Map<string, (...args: Array<unknown>) => void>()

    get input(): HostInput | undefined {
      return this.#input
    }

    set input(input: HostInput) {
      this.#input = input
      this.#render()
    }

    connectedCallback() {
      this.#root ??= createRoot(this)
      this.#render()
    }

    disconnectedCallback() {
      // A keyed move disconnects and reconnects in the same task; only a node
      // still detached after the microtask was really removed.
      queueMicrotask(() => {
        if (this.isConnected || !this.#root) return
        this.#root.unmount()
        this.#root = undefined
      })
    }

    #emit = (message: unknown) => {
      this.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: message }))
    }

    #callback(name: string) {
      let callback = this.#callbacks.get(name)
      if (!callback) {
        callback = (...args) => {
          const toMessage = this.#input?.messages[name] as
            ((...args: Array<unknown>) => unknown) | undefined
          if (toMessage) this.#emit(toMessage(...args))
        }
        this.#callbacks.set(name, callback)
      }
      return callback
    }

    #render() {
      const input = this.#input
      if (!this.#root || !input) return
      const props: Record<string, unknown> = { ...input.props }
      for (const [name, toMessage] of Object.entries(input.messages)) {
        if (typeof toMessage === 'function') props[name] = this.#callback(name)
      }
      this.#root.render(
        createElement(
          Boundary,
          { input, emit: this.#emit },
          createElement(
            Suspense,
            { fallback: input.suspenseFallback },
            createElement(input.component, props),
          ),
        ),
      )
    }
  }
  customElements.define(HOST_TAG, FoldkitReactHost)
}

/**
 * Registers `<foldkit-react-host>` on first use rather than at import, keeping
 * the package side-effect free. A server render has no registry and emits the
 * empty host, which the client upgrades.
 */
export const ensureHostElementDefined = () => {
  if (typeof customElements !== 'undefined' && !customElements.get(HOST_TAG)) defineHostElement()
}

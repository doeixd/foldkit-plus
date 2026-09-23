/**
 * The render context: what the page's server-owned parts do, set around one
 * synchronous call of the view. `SSR.static` reads it to decide whether a
 * region renders, replays, or adopts the server's markup, and the resumable
 * builder reads it to decide whether to mark the bindings it builds. With no
 * context, as in a client-only render, both behave as ordinary view code.
 *
 * - `collect`: the server's render. Each region runs once and is kept, and
 *   each binding is recorded in render order.
 * - `replay`: the server's second render, from the browser's Model. Each
 *   region is the one already rendered, so it never reads the browser's Model;
 *   bindings are recorded again, to be compared with the first render's.
 * - `resume`: the browser. Each region is the markup the server left in the
 *   page, and its render never runs; no binding is marked.
 */
import type { Html } from 'foldkit/html'

export type Region = ReadonlyArray<Html | string>

/**
 * An element's binding as the server's render records it, before encoding:
 * the DOM event, the element for diagnostics, and the Message it causes. For a
 * Message with a hole, `message` is the Message with the hole filled by a
 * placeholder, and `hole` names the fields the event fills.
 */
export interface Binding {
  readonly event: string
  readonly element: string
  readonly message: unknown
  readonly hole?: ReadonlyArray<string> | undefined
  readonly options?: unknown
}

export type RenderContext =
  | {
      readonly mode: 'collect'
      readonly regions: Map<string, Region>
      readonly duplicates: Set<string>
      readonly bindings: Array<Binding>
    }
  | {
      readonly mode: 'replay'
      readonly regions: ReadonlyMap<string, Region>
      readonly bindings: Array<Binding>
    }
  | {
      readonly mode: 'resume'
      readonly snapshots: ReadonlyMap<string, string>
      readonly reported: Set<string>
    }

let context: RenderContext | undefined

/** The context of the view call in progress, if any. */
export const current = (): RenderContext | undefined => context

export const within = <A>(next: RenderContext, run: () => A): A => {
  const previous = context
  context = next
  try {
    return run()
  } finally {
    context = previous
  }
}

/** The config whose view runs inside `next`. */
export const withContext = <Config extends { readonly view: (model: any, h: any) => unknown }>(
  config: Config,
  next: RenderContext,
): Config => ({
  ...config,
  view: (model: unknown, h: unknown) => within(next, () => config.view(model, h)),
})

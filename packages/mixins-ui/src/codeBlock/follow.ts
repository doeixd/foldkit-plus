import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'
import { CodeBlockSlots } from './slots.js'

/** How near the end, in pixels, counts as at it. */
const NEAR = 8

/**
 * While the reader is at the end of a body that scrolls, the end stays in
 * view as the code grows; a reader who scrolls up is left there until they
 * scroll back down. Without a `ResizeObserver` (a DOM with no layout) it does
 * nothing.
 */
const FollowEnd = Mount.defineStream('CodeBlockFollow', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const code = element.firstElementChild
          if (code === null || typeof ResizeObserver === 'undefined') return () => {}
          let following = true
          const scrolled = () => {
            following = element.scrollHeight - element.clientHeight - element.scrollTop <= NEAR
          }
          const grew = () => {
            if (following) element.scrollTop = element.scrollHeight
          }
          const observer = new ResizeObserver(grew)
          element.addEventListener('scroll', scrolled, { passive: true })
          observer.observe(code)
          return () => {
            observer.disconnect()
            element.removeEventListener('scroll', scrolled)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

/**
 * Keeps a growing block's end in view while the reader is at it, as an
 * agent writes code: pass it in `mixins`, and give the body a
 * `max-block-size` so it scrolls. Not a default: its Mount sends no Message,
 * which a Scene test of every page drawing a block could not resolve.
 */
export const follow = [
  Behavior.forSlots(CodeBlockSlots)<unknown, never>(
    {
      body: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FollowEnd(),
      }),
    },
    { name: 'CodeBlockFollow' },
  ).mixin,
] as const

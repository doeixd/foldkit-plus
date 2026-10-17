import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** The attribute on the mounted element naming the element `TrackBox` follows, by id. */
export const TRACK_TARGET_ATTRIBUTE = 'data-target'

/** The custom properties `TrackBox` writes for `name`, as `measured` names `Measure`'s. */
export const trackedBox = (name: string) =>
  ({
    x: `--fk-${name}-x`,
    y: `--fk-${name}-y`,
    w: `--fk-${name}-w`,
    h: `--fk-${name}-h`,
    radius: `--fk-${name}-radius`,
  }) as const

/** Sent as the followed element changes: its id, and whether it is on the page. */
export const TrackedTarget = Schema.TaggedStruct('TrackedTarget', {
  target: Schema.String,
  found: Schema.Boolean,
})
export type TrackedTarget = typeof TrackedTarget.Type

/**
 * The radius a box of `width` by `height` draws for a computed
 * `border-top-left-radius` of `value` (`8px`, `50%`, `8px 4px`): its
 * horizontal length in pixels, a share of the width for a percentage, and
 * never more than half the shorter side, where the browser stops it.
 */
export const cornerRadius = (value: string, width: number, height: number): number => {
  const first = value.trim().split(/\s+/)[0] ?? ''
  const length = parseFloat(first)
  if (!Number.isFinite(length)) return 0
  const pixels = first.endsWith('%') ? (length * width) / 100 : length
  return Math.max(0, Math.min(pixels, width / 2, height / 2))
}

/**
 * Follows another element's box, as a Mount: the element whose id is the
 * mounted element's `data-target` (`TRACK_TARGET_ATTRIBUTE`). Its box in
 * viewport pixels is written on the mounted element as `--fk-<name>-x`,
 * `-y`, `-w` and `-h`, and with `radius`, its top left corner's radius as
 * `--fk-<name>-radius` (`cornerRadius`), so a fixed overlay drawn from them
 * (a tour's cutout, a coach mark's ring) sits over it. While nothing is
 * followed they are removed, so a stylist's fallbacks apply.
 *
 * The box is read again on a scroll anywhere (heard on the way down, since
 * `scroll` does not bubble), a window resize, the followed element's own
 * resize, and any change to the document's elements, which is also how a
 * target drawn anew under the same id is found. `data-target` is read again
 * whenever it changes, so one element can glide from target to target
 * without being drawn again, which a Mount's args, read once, could not do.
 * What moves the target by any other way (a stylesheet added) is seen at the
 * next of these.
 *
 * Whether a target is on the page is the parent's to act on (a tour shows
 * the step in the middle instead), so each change of the target or of
 * whether it is found sends `TrackedTarget`, starting with the first one.
 * Since it sends a Message, a component may draw it by default: a Scene test
 * resolves it with what the parent maps it to. An empty `data-target` follows
 * nothing and sends nothing.
 */
export const TrackBox = Mount.defineStream('TrackBox', {
  messages: [TrackedTarget],
  args: {
    /** The custom properties' prefix: `tour` writes `--fk-tour-x`. */
    name: Schema.String,
    /** Whether to write the target's corner radius too; it reads the target's computed style. */
    radius: Schema.optional(Schema.Boolean),
  },
  execute: ({ element, name, radius = false }) =>
    Stream.callback<TrackedTarget>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const document = element.ownerDocument
          const view = document.defaultView
          const properties = trackedBox(name)
          const style = element instanceof HTMLElement ? element.style : undefined
          let target: Element | null = null
          let told: TrackedTarget | undefined

          const place = () => {
            if (style === undefined) return
            if (target === null) {
              for (const property of Object.values(properties)) style.removeProperty(property)
              return
            }
            const box = target.getBoundingClientRect()
            style.setProperty(properties.x, `${box.left}px`)
            style.setProperty(properties.y, `${box.top}px`)
            style.setProperty(properties.w, `${box.width}px`)
            style.setProperty(properties.h, `${box.height}px`)
            if (radius) {
              const corner = getComputedStyle(target).borderTopLeftRadius
              style.setProperty(
                properties.radius,
                `${cornerRadius(corner, box.width, box.height)}px`,
              )
            }
          }
          // Looks the target up again, telling the parent when what it follows, or whether
          // that is found, changed.
          const follow = () => {
            const id = element.getAttribute(TRACK_TARGET_ATTRIBUTE) ?? ''
            const found = id === '' ? null : document.getElementById(id)
            if (found !== target) {
              if (target !== null) resized.unobserve(target)
              if (found !== null) resized.observe(found)
              target = found
            }
            place()
            if (id !== '' && (told?.target !== id || told.found !== (found !== null))) {
              told = TrackedTarget.make({ target: id, found: found !== null })
              Queue.offerUnsafe(queue, told)
            }
          }

          // Every observer is made before any observes, so one that throws (jsdom has no
          // ResizeObserver) leaves nothing attached.
          const resized = new ResizeObserver(place)
          const changed = new MutationObserver(follow)
          changed.observe(element, {
            attributes: true,
            attributeFilter: [TRACK_TARGET_ATTRIBUTE],
          })
          changed.observe(document, { childList: true, subtree: true })
          view?.addEventListener('scroll', place, { capture: true, passive: true })
          view?.addEventListener('resize', place)
          follow()
          return () => {
            changed.disconnect()
            resized.disconnect()
            view?.removeEventListener('scroll', place, { capture: true })
            view?.removeEventListener('resize', place)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

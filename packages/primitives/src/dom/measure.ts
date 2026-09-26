/**
 * Measures marked elements as a Mount, for a view to draw something over them,
 * such as an editor's selection outline, with no Message and no Model: where
 * an element is, is presentation, known to the DOM and to no transition.
 *
 * For each named target, the first element in the mounted one's subtree that
 * matches its selector is measured relative to the mounted element's scroll
 * box, which is what an absolutely placed child of it is laid out in. The
 * mounted element gets `--fk-<name>-x`, `-y`, `-w` and `-h` in pixels, and
 * `--fk-<name>-display`: `block` while a target is found, `none` while none is.
 *
 * It measures again when the subtree changes (a selection moves), when the
 * mounted element scrolls, when the window resizes, and when the mounted
 * element or a measured one changes size, at most once a frame.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** The custom properties `Measure` writes for a target named `name`. */
export const measured = (name: string) =>
  ({
    x: `--fk-${name}-x`,
    y: `--fk-${name}-y`,
    w: `--fk-${name}-w`,
    h: `--fk-${name}-h`,
    display: `--fk-${name}-display`,
  }) as const

export const Measure = Mount.defineStream('Measure', {
  messages: [Schema.Never],
  args: {
    /** Each target by name, as a selector within the element: `{ selected: '[aria-selected="true"]' }`. */
    targets: Schema.Record(Schema.String, Schema.String),
  },
  execute: ({ element, targets }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const container = element as HTMLElement
          const names = Object.keys(targets)
          let watched: ReadonlyArray<Element> = []
          let frame: number | undefined

          const measure = () => {
            frame = undefined
            const box = container.getBoundingClientRect()
            const found: Array<Element> = []
            for (const name of names) {
              const property = measured(name)
              const target = container.querySelector(targets[name]!)
              if (target === null) {
                container.style.setProperty(property.display, 'none')
                continue
              }
              found.push(target)
              const rect = target.getBoundingClientRect()
              // Relative to the scroll box: where the content is, not where the viewport shows it.
              const x = rect.left - box.left - container.clientLeft + container.scrollLeft
              const y = rect.top - box.top - container.clientTop + container.scrollTop
              container.style.setProperty(property.x, `${x}px`)
              container.style.setProperty(property.y, `${y}px`)
              container.style.setProperty(property.w, `${rect.width}px`)
              container.style.setProperty(property.h, `${rect.height}px`)
              container.style.setProperty(property.display, 'block')
            }
            // A measured element that changes size, as an image loading does, is measured again.
            if (found.length !== watched.length || found.some((each, at) => each !== watched[at])) {
              for (const each of watched) sizes.unobserve(each)
              for (const each of found) sizes.observe(each)
              watched = found
            }
          }
          const soon = () => {
            if (frame === undefined) frame = requestAnimationFrame(measure)
          }

          // Both made before either observes: where one is missing (jsdom has no
          // ResizeObserver), the Mount fails with nothing attached to call `measure`.
          const changes = new MutationObserver(soon)
          const sizes = new ResizeObserver(soon)
          // Its own properties change the container's style too, but writing the same
          // values again records nothing, so a measure that changed nothing rests.
          changes.observe(container, { subtree: true, childList: true, attributes: true })
          sizes.observe(container)
          container.addEventListener('scroll', soon, { passive: true })
          window.addEventListener('resize', soon)
          measure()
          return () => {
            if (frame !== undefined) cancelAnimationFrame(frame)
            changes.disconnect()
            sizes.disconnect()
            container.removeEventListener('scroll', soon)
            window.removeEventListener('resize', soon)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

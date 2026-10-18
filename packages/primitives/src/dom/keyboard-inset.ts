import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/**
 * The custom property `KeyboardInset` writes on its element: how much of the layout
 * viewport's bottom the on-screen keyboard (or anything else the visual viewport leaves
 * out) covers, in pixels.
 */
export const KEYBOARD_INSET = '--fk-keyboard-inset'

/**
 * The part of the layout viewport's height below the visual viewport: what the on-screen
 * keyboard covers. Rounded down, since a fraction of a pixel of zoom is no keyboard.
 */
export const keyboardInset = (view: {
  readonly innerHeight: number
  readonly visualViewport: { readonly height: number; readonly offsetTop: number } | null
}): number =>
  view.visualViewport === null
    ? 0
    : Math.max(
        0,
        Math.floor(view.innerHeight - view.visualViewport.height - view.visualViewport.offsetTop),
      )

/**
 * The on-screen keyboard's height as a Mount, with no Message and no Model: where it is
 * is the browser's. iOS Safari, and Chrome on Android unless the page asks otherwise,
 * leave the layout viewport as it is when the keyboard opens, so a panel fixed to the
 * screen keeps its height and its bottom under the keys. This writes `KEYBOARD_INSET` on
 * the element, from the visual viewport's size and scroll, for a style to pad or shrink by
 * (`var(--fk-keyboard-inset, 0px)`), and removes it when the element goes. Where there is
 * no visual viewport it writes nothing.
 */
export const KeyboardInset = Mount.defineStream('KeyboardInset', {
  messages: [Schema.Never],
  args: {},
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const view = element.ownerDocument.defaultView
          const viewport = view?.visualViewport
          if (
            !(element instanceof HTMLElement) ||
            view === null ||
            view === undefined ||
            viewport === null ||
            viewport === undefined
          ) {
            return () => {}
          }
          const target = element
          const measure = () => target.style.setProperty(KEYBOARD_INSET, `${keyboardInset(view)}px`)
          measure()
          viewport.addEventListener('resize', measure)
          viewport.addEventListener('scroll', measure)
          return () => {
            viewport.removeEventListener('resize', measure)
            viewport.removeEventListener('scroll', measure)
            target.style.removeProperty(KEYBOARD_INSET)
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})

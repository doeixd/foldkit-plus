/**
 * A floating toolbar's position (§11, §143): the element placed over the page's selection while
 * that selection lies in the editor's host, re-placed as the selection, the page's scroll, or the
 * window's size changes.
 *
 * Whether the toolbar is drawn is the view's, from the Model (`RichText.coversText`); this only
 * moves it. It writes `position`, `top`, `left`, and `data-placement` on the element itself, as
 * `foldkit-mixins-ui`'s Anchor does, so a Style on the element must leave those alone. It listens
 * only while mounted, which is only while a toolbar is drawn.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

interface Box {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/**
 * Where the floating box goes, in viewport coordinates: centred over the target and `gap` above
 * it, or below it when there is no room above; kept inside the viewport's width.
 */
export const placeOver = (
  target: Box,
  floating: Pick<Box, 'width' | 'height'>,
  viewport: Pick<Box, 'width'>,
  gap: number,
): { readonly top: number; readonly left: number; readonly placement: 'top' | 'bottom' } => {
  const above = target.top - gap - floating.height
  const centred = target.left + target.width / 2 - floating.width / 2
  return {
    top: above >= 0 ? above : target.top + target.height + gap,
    left: Math.max(0, Math.min(centred, viewport.width - floating.width)),
    placement: above >= 0 ? 'top' : 'bottom',
  }
}

/** Places `element` over the selection in `hostId` now and on each change, until released. */
export const anchorToSelection = (
  element: Element & ElementCSSInlineStyle,
  hostId: string,
  gap: number,
) => {
  const owner = element.ownerDocument
  const view = owner.defaultView
  if (view === null) return () => {}
  const place = () => {
    const selection = view.getSelection()
    const host = owner.getElementById(hostId)
    if (selection === null || selection.rangeCount === 0 || host === null) return
    const range = selection.getRangeAt(0)
    if (range.collapsed || !host.contains(range.commonAncestorContainer)) return
    const at = placeOver(
      range.getBoundingClientRect(),
      element.getBoundingClientRect(),
      { width: view.innerWidth },
      gap,
    )
    element.style.position = 'fixed'
    element.style.top = `${at.top}px`
    element.style.left = `${at.left}px`
    element.setAttribute('data-placement', at.placement)
  }
  place()
  owner.addEventListener('selectionchange', place)
  // Capture: a scrolling container's scroll does not bubble, but it passes the window first.
  view.addEventListener('scroll', place, true)
  view.addEventListener('resize', place)
  return () => {
    owner.removeEventListener('selectionchange', place)
    view.removeEventListener('scroll', place, true)
    view.removeEventListener('resize', place)
  }
}

/** `anchorToSelection` as a Mount, for the element a floating toolbar is drawn in. */
export const selectionAnchor = Mount.defineStream('RichTextSelectionAnchor', {
  args: {
    /** The editor host's id: a selection anywhere else leaves the element where it is. */
    hostId: Schema.String,
    /** Pixels between the selection and the element. */
    gap: Schema.Number,
  },
  messages: [Schema.Never],
  execute: ({ element, hostId, gap }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        // A Mount's element is one the view drew, an HTML or SVG element, and both carry `style`.
        Effect.sync(() =>
          anchorToSelection(element as Element & ElementCSSInlineStyle, hostId, gap),
        ),
        release => Effect.sync(release),
      ),
    ),
})

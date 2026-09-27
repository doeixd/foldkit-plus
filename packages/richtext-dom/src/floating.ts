/**
 * Chrome placed against the editor's content (§143, §144): a floating toolbar over the page's
 * selection, and a block handle beside its block, each re-placed as the page lays out again.
 *
 * Whether either is drawn is the view's, from the Model; these only move it. They write
 * `position`, `top`, `left`, and `data-placement` on the element itself, as `foldkit-mixins-ui`'s
 * Anchor does, so a Style on the element must leave those alone. They listen only while mounted.
 *
 * A Mount reads its args once, when its element is inserted; a later render with other args
 * patches the same element and the Mount never sees them. So a caller whose block changes keys
 * the element by it (`h.Key(node)`), and each block gets a fresh element and a fresh Mount.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { attachmentIn } from './host.js'

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

/** Where a handle goes: beside the block's first line, `gap` to its left, never past the left edge. */
export const placeBeside = (
  target: Box,
  floating: Pick<Box, 'width'>,
  gap: number,
): { readonly top: number; readonly left: number; readonly placement: 'left' } => ({
  top: target.top,
  left: Math.max(0, target.left - gap - floating.width),
  placement: 'left',
})

type Styled = Element & ElementCSSInlineStyle

const write = (
  element: Styled,
  at: { readonly top: number; readonly left: number; readonly placement: string },
) => {
  element.style.position = 'fixed'
  element.style.top = `${at.top}px`
  element.style.left = `${at.left}px`
  element.setAttribute('data-placement', at.placement)
}

/** Calls `place` on any scroll and on resize, until the returned release. */
const onLayout = (view: Window, place: () => void) => {
  // Capture: a scrolling container's scroll does not bubble, but it passes the window first.
  view.addEventListener('scroll', place, true)
  view.addEventListener('resize', place)
  return () => {
    view.removeEventListener('scroll', place, true)
    view.removeEventListener('resize', place)
  }
}

/** Places `element` over the selection in `hostId` now and on each change, until released. */
export const anchorToSelection = (element: Styled, hostId: string, gap: number) => {
  const owner = element.ownerDocument
  const view = owner.defaultView
  if (view === null) return () => {}
  const place = () => {
    const selection = view.getSelection()
    const host = owner.getElementById(hostId)
    if (selection === null || selection.rangeCount === 0 || host === null) return
    const range = selection.getRangeAt(0)
    if (range.collapsed || !host.contains(range.commonAncestorContainer)) return
    write(
      element,
      placeOver(
        range.getBoundingClientRect(),
        element.getBoundingClientRect(),
        { width: view.innerWidth },
        gap,
      ),
    )
  }
  place()
  owner.addEventListener('selectionchange', place)
  const release = onLayout(view, place)
  return () => {
    owner.removeEventListener('selectionchange', place)
    release()
  }
}

/**
 * Places `element` beside block `node` of the editor in `hostId` now and on each change, until
 * released. A block missing from the editor leaves the element where it is.
 */
export const anchorToBlock = (
  element: Styled,
  hostId: string,
  node: RichText.NodeId,
  gap: number,
) => {
  const owner = element.ownerDocument
  const view = owner.defaultView
  const host = owner.getElementById(hostId)
  if (view === null || host === null) return () => {}
  const place = () => {
    const block = attachmentIn(host)?.current().elements.get(node)
    if (block === undefined) return
    write(element, placeBeside(block.getBoundingClientRect(), element.getBoundingClientRect(), gap))
  }
  place()
  // A patch moves blocks without moving the page: text typed above one, or the move a handle sent.
  const observer = new view.MutationObserver(place)
  observer.observe(host, { childList: true, subtree: true, characterData: true })
  const release = onLayout(view, place)
  return () => {
    observer.disconnect()
    release()
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
        // A Mount's element is one the view drew, an HTML or SVG element, and both carry `style`.
        Effect.sync(() => anchorToSelection(element as Styled, hostId, gap)),
        release => Effect.sync(release),
      ),
    ),
})

/** `anchorToBlock` as a Mount, for the element a block handle is drawn in. Key that element by `node`. */
export const blockAnchor = Mount.defineStream('RichTextBlockAnchor', {
  args: {
    /** The editor host's id. */
    hostId: Schema.String,
    /** The block the handle stands for. */
    node: RichText.NodeId,
    /** Pixels between the handle and the block. */
    gap: Schema.Number,
  },
  messages: [Schema.Never],
  execute: ({ element, hostId, node, gap }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => anchorToBlock(element as Styled, hostId, node, gap)),
        release => Effect.sync(release),
      ),
    ),
})

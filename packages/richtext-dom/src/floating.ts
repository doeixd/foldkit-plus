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

/**
 * Where a box goes under a caret, in viewport coordinates: `gap` below it, or above it when there
 * is no room below; kept inside the viewport's width. What a slash menu opens at.
 */
export const placeUnder = (
  target: Box,
  floating: Pick<Box, 'width' | 'height'>,
  viewport: Pick<Box, 'width' | 'height'>,
  gap: number,
): { readonly top: number; readonly left: number; readonly placement: 'top' | 'bottom' } => {
  const below = target.top + target.height + gap
  const fits = below + floating.height <= viewport.height
  return {
    top: fits ? below : Math.max(0, target.top - gap - floating.height),
    left: Math.max(0, Math.min(target.left, viewport.width - floating.width)),
    placement: fits ? 'bottom' : 'top',
  }
}

/**
 * The box a range occupies. A caret in an empty text node has no box of its own (every
 * browser reports zeros), so it is read from the element the caret is in.
 */
const rangeBox = (range: Range): Box => {
  const box = range.getBoundingClientRect()
  if (box.width !== 0 || box.height !== 0 || box.top !== 0 || box.left !== 0) return box
  const container = range.startContainer
  const element = container instanceof Element ? container : container.parentElement
  return element === null ? box : element.getBoundingClientRect()
}

/**
 * Where a block's toolbar goes: `gap` above the block's top, aligned with its left edge, or just
 * inside its top when there is no room above (a block at the top of the window).
 */
export const placeAbove = (
  target: Box,
  floating: Pick<Box, 'width' | 'height'>,
  viewport: Pick<Box, 'width'>,
  gap: number,
): { readonly top: number; readonly left: number; readonly placement: 'top' | 'inside' } => {
  const above = target.top - gap - floating.height
  return {
    top: above >= 0 ? above : Math.max(0, target.top + gap),
    left: Math.max(0, Math.min(target.left, viewport.width - floating.width)),
    placement: above >= 0 ? 'top' : 'inside',
  }
}

/** Where a handle goes: level with the block's top, `gap` to its left, never past the left edge. */
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

/**
 * Places `element` over the selection in `hostId` now and on each change, until released. With
 * `caret`, it follows a collapsed selection too, under it, as a slash menu does; otherwise a
 * caret leaves it where it is, as a toolbar for selected text wants.
 */
export const anchorToSelection = (element: Styled, hostId: string, gap: number, caret = false) => {
  const owner = element.ownerDocument
  const view = owner.defaultView
  if (view === null) return () => {}
  // Fixed before anything is measured: in flow the element's box is not the one it floats with.
  element.style.position = 'fixed'
  const place = () => {
    const selection = view.getSelection()
    const host = owner.getElementById(hostId)
    if (selection === null || selection.rangeCount === 0 || host === null) return
    const range = selection.getRangeAt(0)
    if ((range.collapsed && !caret) || !host.contains(range.commonAncestorContainer)) return
    const floating = element.getBoundingClientRect()
    write(
      element,
      caret
        ? placeUnder(
            rangeBox(range),
            floating,
            { width: view.innerWidth, height: view.innerHeight },
            gap,
          )
        : placeOver(rangeBox(range), floating, { width: view.innerWidth }, gap),
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
  side: 'left' | 'above' = 'left',
) => {
  const owner = element.ownerDocument
  const view = owner.defaultView
  if (view === null) return () => {}
  element.style.position = 'fixed'
  // A patch moves blocks without moving the page: text typed above one, or the move a handle sent.
  // The host is looked up on each placement, since it can be drawn after the handle or replaced:
  // while it is missing the page is watched for it, and once found its parent is watched too.
  const observer = new view.MutationObserver(() => place())
  let observed: Element | null | undefined
  const place = () => {
    const host = owner.getElementById(hostId)
    if (host !== observed) {
      observer.disconnect()
      if (host === null) {
        observer.observe(owner.documentElement, { childList: true, subtree: true })
      } else {
        observer.observe(host, { childList: true, subtree: true, characterData: true })
        if (host.parentElement !== null) observer.observe(host.parentElement, { childList: true })
      }
      observed = host
    }
    if (host === null) return
    const block = attachmentIn(host)?.current().elements.get(node)
    if (block === undefined) return
    const box = block.getBoundingClientRect()
    const floating = element.getBoundingClientRect()
    write(
      element,
      side === 'above'
        ? placeAbove(box, floating, { width: view.innerWidth }, gap)
        : placeBeside(box, floating, gap),
    )
  }
  place()
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
    /** Follow a caret as well, under it: a slash menu's place. Absent, only selected text. */
    caret: Schema.optionalKey(Schema.Boolean),
  },
  messages: [Schema.Never],
  execute: ({ element, hostId, gap, caret }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        // A Mount's element is one the view drew, an HTML or SVG element, and both carry `style`.
        Effect.sync(() => anchorToSelection(element as Styled, hostId, gap, caret === true)),
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
    /** Beside the block's left edge (a handle), or above it (a block's toolbar). Default left. */
    side: Schema.optionalKey(Schema.Literals(['left', 'above'])),
  },
  messages: [Schema.Never],
  execute: ({ element, hostId, node, gap, side }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => anchorToBlock(element as Styled, hostId, node, gap, side ?? 'left')),
        release => Effect.sync(release),
      ),
    ),
})

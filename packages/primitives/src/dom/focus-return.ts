import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { activeOutside, backToOpener, fallBack, isHtml, lostIn, returnOf } from './focus-way.js'
import * as LayerStack from './layer-stack.js'

const TRAIL = 8
/** The elements each document last focused, oldest first; held weakly, so a removed subtree is not kept. */
const trails = new WeakMap<Document, Array<WeakRef<HTMLElement>>>()

/**
 * Follows what takes focus in `doc`. Focus has usually moved into an overlay
 * before its Mount runs (a Command shows it as soon as the Message lands), so
 * what had it first is read from here rather than from `activeElement`; the
 * page's own document is followed from when this module loads, before any
 * overlay opens, and another (a frame's) from its first `FocusReturn`.
 */
const follow = (doc: Document): Array<WeakRef<HTMLElement>> => {
  const known = trails.get(doc)
  if (known !== undefined) return known
  const trail: Array<WeakRef<HTMLElement>> = []
  trails.set(doc, trail)
  doc.addEventListener(
    'focusin',
    event => {
      const target = event.target
      if (!isHtml(target) || target === doc.body) return
      if (trail.at(-1)?.deref() === target) return
      // What left the document since is no opener any more.
      const kept = trail.filter(each => each.deref()?.isConnected === true)
      trail.splice(0, trail.length, ...kept.slice(-(TRAIL - 1)), new WeakRef(target))
    },
    true,
  )
  return trail
}

if (typeof document !== 'undefined') follow(document)

/** What had focus before the overlay took it: the focused element outside it, else the latest one that was. */
export const openerOf = (overlay: Element): HTMLElement | undefined => {
  const trail = follow(overlay.ownerDocument)
  return (
    activeOutside(overlay) ??
    trail
      .map(each => each.deref())
      .reverse()
      .find(each => each !== undefined && each.isConnected && !overlay.contains(each))
  )
}

/**
 * Gives focus a way back for an overlay whose own restoring is not ours (a
 * Dialog's: it returns to its opener, and to `body` when that is gone). It
 * takes the opener when the overlay mounts; when the overlay unmounts with
 * focus lost (on `body`, or inside it), focus goes back to the opener, else
 * by the rules of `fallBack`. Focus the user moved elsewhere is left alone, and nothing is
 * focused on mount: `FocusScope` does that. It sends no Message. It opens a
 * layer of the document's stack while mounted, so the layers opened before it
 * read as covered: a `FocusScope` below contains nothing meanwhile, and a
 * `HideOutside` below leaves this overlay shown.
 */
export const FocusReturn = Mount.defineStream('FocusReturn', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => ({
          way: returnOf(openerOf(element)),
          release: LayerStack.open(element),
        })),
        ({ way, release }) =>
          Effect.sync(() => {
            const below = LayerStack.below(element)
            release()
            if (lostIn(element) && !backToOpener(way)) fallBack(element, way, below)
          }),
      ),
    ),
})

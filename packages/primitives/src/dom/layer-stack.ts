/**
 * The open layers of the document, in the order they opened, for the Mounts
 * that act on a layer (`FocusScope`, `HideOutside`): the topmost owns
 * containment. An element is one layer however many of those Mounts it
 * holds, and stays one until the last lets it go. Each layer carries a mark,
 * so a lower one can name the layers above it to `Dom.inertOthers`.
 */

/** The `data-` name (without the prefix) of an open layer's place in the stack. */
export const LAYER_MARK = 'fk-layer'

interface Layer {
  readonly element: Element
  readonly mark: string
  holders: number
}

const layers: Array<Layer> = []
const listeners = new Set<() => void>()
let minted = 0

const changed = () => {
  for (const listener of [...listeners]) listener()
}

/**
 * Holds `element` as a layer until the returned release is called; `onChange`
 * is called whenever another layer opens or closes, and not after release.
 */
export const open = (element: Element, onChange?: () => void): (() => void) => {
  let layer = layers.find(each => each.element === element)
  const opened = layer === undefined
  if (layer === undefined) {
    layer = { element, mark: String((minted += 1)), holders: 0 }
    element.setAttribute(`data-${LAYER_MARK}`, layer.mark)
    layers.push(layer)
  }
  layer.holders += 1
  if (onChange !== undefined) listeners.add(onChange)
  if (opened) changed()
  const held = layer
  let released = false
  return () => {
    if (released) return
    released = true
    if (onChange !== undefined) listeners.delete(onChange)
    held.holders -= 1
    if (held.holders > 0) return
    layers.splice(layers.indexOf(held), 1)
    held.element.removeAttribute(`data-${LAYER_MARK}`)
    changed()
  }
}

/** The selectors of the layers opened after `element`'s, which it must not cover. */
export const selectorsAbove = (element: Element): ReadonlyArray<string> => {
  const at = layers.findIndex(layer => layer.element === element)
  return at === -1 ? [] : layers.slice(at + 1).map(layer => `[data-${LAYER_MARK}="${layer.mark}"]`)
}

/** Whether a layer opened after `element`'s is still open: then that one owns containment. */
export const isCovered = (element: Element): boolean => selectorsAbove(element).length > 0

const shown = new Set<() => void>()

/**
 * Calls `listener` each time a lower layer has stopped hiding the layers
 * above it, which it does a frame after one opens: a layer drawn where a
 * lower one had hidden cannot take focus before. Returns the unsubscribe.
 */
export const whenShown = (listener: () => void): (() => void) => {
  shown.add(listener)
  return () => shown.delete(listener)
}

/** Says a lower layer no longer hides the layers above it. */
export const showed = (): void => {
  for (const listener of [...shown]) listener()
}

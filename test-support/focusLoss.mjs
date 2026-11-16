/**
 * Finds a node removed while it held focus, which the browser reports to no one:
 * a focused element that a render replaces simply stops being focused, and the
 * page reads that as the user leaving. Opt in from a browser test around the
 * interaction that must keep its focus (`watchFocusLoss()`, act, read `losses`,
 * `dispose()`); it is not global, since a dialog closing legitimately removes a
 * focused node before focus is returned.
 *
 * It watches the DOM calls Foldkit's differ patches with (`removeChild`,
 * `replaceChild`) and `Element.remove`, not mutation records: the record is
 * delivered after the code that moved focus onwards has run.
 */
/** @returns {import('./focusLoss.d.mts').FocusLossWatch} */
export const watchFocusLoss = () => {
  const losses = []
  const { removeChild, replaceChild } = Node.prototype
  const { remove } = Element.prototype
  const note = (from, removed) => {
    const focused = document.activeElement
    if (from !== null && focused !== null && focused !== document.body && removed.contains(focused))
      losses.push({ focused, removed, from })
  }
  Node.prototype.removeChild = function (child) {
    note(this, child)
    return removeChild.call(this, child)
  }
  Node.prototype.replaceChild = function (next, old) {
    note(this, old)
    return replaceChild.call(this, next, old)
  }
  Element.prototype.remove = function () {
    note(this.parentNode, this)
    remove.call(this)
  }
  return {
    losses,
    dispose: () => {
      Node.prototype.removeChild = removeChild
      Node.prototype.replaceChild = replaceChild
      Element.prototype.remove = remove
    },
  }
}

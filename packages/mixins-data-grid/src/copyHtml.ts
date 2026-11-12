import { Clipboard } from 'foldkit-data-grid'

/**
 * Adds `text/html` to the clipboard the grid's own copy or cut wrote. The
 * view's copy handlers sit on the grid's root and write `text/plain` only; this
 * runs after them, on the same root, and derives the table from that text, so
 * the two cannot disagree.
 *
 * It acts only when the event is aimed at what the grid itself focuses (the
 * root, a cell or a header), a handler took the event, and nothing has written
 * HTML: a field or an element an application draws inside a cell, or a handler
 * that wrote its own clipboard, must not gain grid markup built from its text.
 */
export const copyHtmlOn = (root: Element): (() => void) => {
  const gridFocus = (target: EventTarget | null) =>
    target === root ||
    (target instanceof Element &&
      ['gridcell', 'columnheader'].includes(target.getAttribute('role') ?? ''))
  const listener = (event: Event) => {
    const data = (event as ClipboardEvent).clipboardData
    if (!gridFocus(event.target) || !event.defaultPrevented || data === null) return
    if (data.getData('text/html') !== '') return
    const text = data.getData('text/plain')
    if (text === '') return
    data.setData('text/html', Clipboard.toHtml(Clipboard.parseTsv(text)))
  }
  root.addEventListener('copy', listener)
  root.addEventListener('cut', listener)
  return () => {
    root.removeEventListener('copy', listener)
    root.removeEventListener('cut', listener)
  }
}

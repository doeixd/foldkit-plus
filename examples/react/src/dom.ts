/**
 * A browser for the Node demo. React DOM decides at import whether a DOM
 * exists, so this runs before `demo.ts` is imported.
 */
import { JSDOM } from 'jsdom'

export const installDom = () => {
  if (typeof document === 'undefined') {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>')
    for (const name of [
      'window',
      'document',
      'navigator',
      'HTMLElement',
      'HTMLInputElement',
      'Element',
      'Node',
      'Event',
      'CustomEvent',
      'MouseEvent',
      'customElements',
      'getComputedStyle',
      'MutationObserver',
    ]) {
      // Node 22 already defines some of these, such as a read-only `navigator`.
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: window[name as keyof typeof window],
      })
    }
  }
  // The Foldkit runtime renders on animation frames; a timer keeps the demo deterministic in Node.
  const frames = new Map<number, ReturnType<typeof setTimeout>>()
  let nextFrame = 0
  globalThis.requestAnimationFrame = callback => {
    const id = ++nextFrame
    frames.set(
      id,
      setTimeout(() => (frames.delete(id), callback(performance.now())), 0),
    )
    return id
  }
  globalThis.cancelAnimationFrame = id => {
    clearTimeout(frames.get(id))
    frames.delete(id)
  }
}

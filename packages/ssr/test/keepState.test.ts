// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { BINDER_TOUCHED_ATTRIBUTE, holdPageState, restorePageState } from '../src/keep.js'

const rootOf = (markup: string): HTMLElement => {
  const root = document.createElement('main')
  root.innerHTML = markup
  return root
}

describe('holdPageState and restorePageState', () => {
  it('captures and restores scroll position on root, scrollable descendants, and window', () => {
    const root = rootOf('<div id="scroller"></div><div id="flat"></div>')
    const scroller = root.querySelector('#scroller')!
    const flat = root.querySelector('#flat')!

    root.scrollTop = 120
    root.scrollLeft = 15
    scroller.scrollTop = 240
    scroller.scrollLeft = 30

    const scrollToSpy = vi.fn()
    vi.stubGlobal('scrollTo', scrollToSpy)
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 12 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 340 })

    try {
      const held = holdPageState(root)
      expect(held.scrolls).toHaveLength(2)
      expect(held.scrolls.some(entry => entry.element === flat)).toBe(false)

      // Simulate hydration resetting scroll offsets.
      root.scrollTop = 0
      root.scrollLeft = 0
      scroller.scrollTop = 0
      scroller.scrollLeft = 0

      restorePageState(held)

      expect(root.scrollTop).toBe(120)
      expect(root.scrollLeft).toBe(15)
      expect(scroller.scrollTop).toBe(240)
      expect(scroller.scrollLeft).toBe(30)
      expect(scrollToSpy).toHaveBeenCalledWith(12, 340)
    } finally {
      Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
      vi.unstubAllGlobals()
    }
  })

  it('captures and restores <details> elements toggled open or closed before boot', () => {
    const root = rootOf(
      '<details id="opened"><summary>A</summary></details><details id="closed" open><summary>B</summary></details>',
    )
    const opened = root.querySelector<HTMLDetailsElement>('#opened')!
    const closed = root.querySelector<HTMLDetailsElement>('#closed')!

    // User opens the first and closes the second before hydration.
    opened.open = true
    closed.open = false

    const held = holdPageState(root)

    // Simulate hydration resetting both to served defaults.
    opened.removeAttribute('open')
    closed.setAttribute('open', '')
    expect(opened.open).toBe(false)
    expect(closed.open).toBe(true)

    restorePageState(held)

    expect(opened.open).toBe(true)
    expect(opened.hasAttribute('open')).toBe(true)
    expect(closed.open).toBe(false)
    expect(closed.hasAttribute('open')).toBe(false)
  })

  it('captures and restores binder-touched controls after simulated hydration reset', () => {
    const root = rootOf(`
      <input id="text" type="text" value="served" ${BINDER_TOUCHED_ATTRIBUTE} />
      <textarea id="area" ${BINDER_TOUCHED_ATTRIBUTE}>served-area</textarea>
      <input id="check" type="checkbox" ${BINDER_TOUCHED_ATTRIBUTE} />
      <input id="radio-a" name="r" type="radio" checked ${BINDER_TOUCHED_ATTRIBUTE} />
      <input id="radio-b" name="r" type="radio" ${BINDER_TOUCHED_ATTRIBUTE} />
      <select id="single" ${BINDER_TOUCHED_ATTRIBUTE}>
        <option value="a" selected>A</option>
        <option value="b">B</option>
      </select>
      <select id="multi" multiple ${BINDER_TOUCHED_ATTRIBUTE}>
        <option value="x" selected>X</option>
        <option value="y">Y</option>
        <option value="z">Z</option>
      </select>
      <button id="toggle" type="button" aria-pressed="false" ${BINDER_TOUCHED_ATTRIBUTE}>Star</button>
      <button id="panel" type="button" aria-expanded="true" ${BINDER_TOUCHED_ATTRIBUTE}>Menu</button>
      <dialog id="dlg" ${BINDER_TOUCHED_ATTRIBUTE}></dialog>
    `)

    const text = root.querySelector<HTMLInputElement>('#text')!
    const area = root.querySelector<HTMLTextAreaElement>('#area')!
    const check = root.querySelector<HTMLInputElement>('#check')!
    const radioA = root.querySelector<HTMLInputElement>('#radio-a')!
    const radioB = root.querySelector<HTMLInputElement>('#radio-b')!
    const single = root.querySelector<HTMLSelectElement>('#single')!
    const multi = root.querySelector<HTMLSelectElement>('#multi')!
    const toggle = root.querySelector<HTMLButtonElement>('#toggle')!
    const panel = root.querySelector<HTMLButtonElement>('#panel')!
    const dlg = root.querySelector<HTMLElement>('#dlg')!

    text.value = 'typed-by-binder'
    text.setSelectionRange(2, 5, 'backward')
    area.value = 'edited-area'
    area.setSelectionRange(1, 4)
    check.checked = true
    radioB.checked = true
    single.value = 'b'
    multi.options[0]!.selected = false
    multi.options[1]!.selected = true
    multi.options[2]!.selected = true
    toggle.setAttribute('aria-pressed', 'true')
    panel.removeAttribute('aria-expanded')
    dlg.setAttribute('open', '')

    const held = holdPageState(root)

    // Simulate hydration resetting every element back to served markup.
    text.value = 'served'
    text.setSelectionRange(0, 0)
    area.value = 'served-area'
    area.setSelectionRange(0, 0)
    check.checked = false
    radioA.checked = true
    single.value = 'a'
    multi.options[0]!.selected = true
    multi.options[1]!.selected = false
    multi.options[2]!.selected = false
    toggle.setAttribute('aria-pressed', 'false')
    panel.setAttribute('aria-expanded', 'true')
    dlg.removeAttribute('open')

    restorePageState(held)

    expect(text.value).toBe('typed-by-binder')
    expect([text.selectionStart, text.selectionEnd, text.selectionDirection]).toEqual([
      2,
      5,
      'backward',
    ])
    expect(area.value).toBe('edited-area')
    expect([area.selectionStart, area.selectionEnd]).toEqual([1, 4])
    expect(check.checked).toBe(true)
    expect(radioA.checked).toBe(false)
    expect(radioB.checked).toBe(true)
    expect(single.value).toBe('b')
    expect(Array.from(multi.options).map(option => option.selected)).toEqual([false, true, true])
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(panel.hasAttribute('aria-expanded')).toBe(false)
    expect(dlg.hasAttribute('open')).toBe(true)
  })
})

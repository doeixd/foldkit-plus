// @vitest-environment jsdom
/**
 * The showcase page on the real runtime: every island boots from the same
 * `entry.ts` the dev server serves, and one interaction per widget reaches
 * its Model and redraws. Proves the page is interactive, not just drawn.
 * (`embed` replaces each container with its rendering, so the test queries
 * the drawn page, not the staged divs.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const click = (target: Element): void => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const button = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll('button')].find(each => each.textContent === text)
  if (found === undefined) throw new Error(`no button reading ${text}`)
  return found as HTMLButtonElement
}

describe('showcase islands', () => {
  it('every widget answers one interaction', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    document.body.innerHTML = [
      'toolbar',
      'toggle',
      'toggle-group',
      'accordion',
      'number-field',
      'checkbox-group',
      'meter',
      'command',
    ]
      .map(id => `<div id="${id}"></div>`)
      .join('')
    await import('../src/entry.js')

    // The toolbar drew over its container.
    expect(document.querySelector('[role="toolbar"]')).not.toBeNull()

    // Toolbar: pressing Bold presses it.
    const bold = button('Bold')
    click(bold)
    await vi.waitFor(() => expect(bold.getAttribute('aria-pressed')).toBe('true'))

    // Toggle: muting says muted.
    const mute = button('Mute')
    click(mute)
    await vi.waitFor(() => expect(mute.textContent).toBe('Muted'))

    // Toggle group: picking center presses it.
    const center = button('center')
    click(center)
    await vi.waitFor(() => expect(center.getAttribute('aria-pressed')).toBe('true'))

    // Accordion: opening Team shows its body.
    click(button('Team'))
    await vi.waitFor(() => expect(document.body.textContent).toContain('Invite, remove'))

    // Number field: stepping up reaches 4.
    click(button('+'))
    await vi.waitFor(() =>
      expect(document.querySelector('[role="spinbutton"]')?.textContent).toBe('4'),
    )

    // Checkbox group: picking cheese checks its box.
    const boxes = [
      ...document.querySelectorAll('input[type="checkbox"]'),
    ] as Array<HTMLInputElement>
    const cheese = boxes.find(box => box.getAttribute('aria-label') === 'cheese')
    if (cheese === undefined) throw new Error('no cheese box')
    click(cheese.closest('label')!)
    await vi.waitFor(() => expect(cheese.checked).toBe(true))

    // Meter: using 10 more reaches 72.
    click(button('Use 10'))
    await vi.waitFor(() => expect(document.body.textContent).toContain('72 of 100 GB'))

    // Command: typing narrows to two options.
    const search = document.querySelector('input[type="search"]') as HTMLInputElement
    search.value = 'new'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBe(2))
  })
})

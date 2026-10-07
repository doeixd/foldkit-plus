// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isSwipeExcludedTarget } from '../src/toastUtils.js'

const element = (html: string): Element => {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.firstElementChild!
}

describe('isSwipeExcludedTarget', () => {
  it('excludes interactive descendants', () => {
    const host = element('<div><button>close</button></div>')
    const button = host.querySelector('button')!
    expect(isSwipeExcludedTarget('mouse', button)).toBe(true)
    expect(isSwipeExcludedTarget('touch', button)).toBe(true)
  })

  it('excludes links and editable content', () => {
    const host = element('<div><a href="/x">x</a><div contenteditable>t</div></div>')
    expect(isSwipeExcludedTarget('mouse', host.querySelector('a')!)).toBe(true)
    expect(isSwipeExcludedTarget('mouse', host.querySelector('[contenteditable]')!)).toBe(
      true,
    )
  })

  it('excludes marked text for mouse and pen but not touch', () => {
    const host = element('<div><p data-toast-swipe-ignore>text</p></div>')
    const text = host.querySelector('p')!
    expect(isSwipeExcludedTarget('mouse', text)).toBe(true)
    expect(isSwipeExcludedTarget('pen', text)).toBe(true)
    expect(isSwipeExcludedTarget('touch', text)).toBe(false)
  })

  it('includes plain entry content for every pointer type', () => {
    const host = element('<div><p>plain</p></div>')
    const text = host.querySelector('p')!
    for (const pointerType of ['mouse', 'pen', 'touch']) {
      expect(isSwipeExcludedTarget(pointerType, text)).toBe(false)
    }
  })

  it('includes nothing when there is no target', () => {
    expect(isSwipeExcludedTarget('mouse', null)).toBe(false)
  })
})

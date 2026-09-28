// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Style } from '../src/index.js'

afterEach(() => {
  document.head.replaceChildren()
})

describe('Style.install', () => {
  it('puts the sheet in the head once, however often it is called', () => {
    const first = Style.install('body{color:red}')
    const second = Style.install('body{color:red}')
    expect(second).toBe(first)
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(first.textContent).toBe('body{color:red}')
  })

  it('keeps a sheet the server already wrote, and adds a different one', () => {
    const rendered = document.createElement('style')
    rendered.textContent = 'body{color:red}'
    document.head.append(rendered)
    expect(Style.install('body{color:red}')).toBe(rendered)
    const other = Style.install('body{color:blue}')
    expect(other).not.toBe(rendered)
    expect(document.head.querySelectorAll('style')).toHaveLength(2)
  })

  it('returns the element, so a caller can take the sheet away', () => {
    Style.install('body{color:red}').remove()
    expect(document.head.querySelectorAll('style')).toHaveLength(0)
    expect(Style.install('body{color:red}').isConnected).toBe(true)
  })
})

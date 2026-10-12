// @vitest-environment jsdom
/**
 * Copying a code block the server drew: the click finds which button it landed
 * on, and the Command copies that block's code and marks its button done.
 */
import { Effect, Option } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COPY_ATTRIBUTE } from '../src/library.js'
import { CopyCode, Message, codeCopyOf } from '../src/main.js'

/** Two blocks as the build draws them: a figure, its copy button, its code. */
const page = () => {
  document.body.innerHTML = ['one\ntwo', 'three']
    .map(
      code =>
        `<figure><div><span>ts</span><button ${COPY_ATTRIBUTE}=""><span>Copy</span></button></div><pre><code>${code}</code></pre></figure>`,
    )
    .join('<p>between</p>')
  return Array.from(document.querySelectorAll<HTMLElement>(`[${COPY_ATTRIBUTE}]`))
}
const clickOn = (target: Element) => {
  const event = new MouseEvent('click', { bubbles: true })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('codeCopyOf', () => {
  it('names the button a click lands in, by its place on the page', () => {
    const [, second] = page()
    expect(codeCopyOf(clickOn(second!.querySelector('span')!))).toEqual(
      Option.some(Message.PressedCodeCopy({ index: 1 })),
    )
  })

  it('ignores a click anywhere else', () => {
    page()
    expect(codeCopyOf(clickOn(document.querySelector('p')!))).toEqual(Option.none())
  })
})

describe('CopyCode', () => {
  it("copies that block's code and marks its button, leaving the other", async () => {
    const written: Array<string> = []
    vi.stubGlobal('navigator', {
      clipboard: { writeText: async (text: string) => void written.push(text) },
    })
    const [first, second] = page()
    expect(await Effect.runPromise(CopyCode({ index: 0 }).effect)).toEqual(Message.CopiedCode())
    expect(written).toEqual(['one\ntwo'])
    expect([first!.dataset['copied'], first!.textContent]).toEqual(['true', 'Copied'])
    expect([second!.dataset['copied'], second!.textContent]).toEqual([undefined, 'Copy'])
  })

  it('reports a refused clipboard and leaves the button as it was', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    })
    const [first] = page()
    expect(await Effect.runPromise(CopyCode({ index: 0 }).effect)).toEqual(Message.FailedToCopy())
    expect(first!.textContent).toBe('Copy')
  })
})

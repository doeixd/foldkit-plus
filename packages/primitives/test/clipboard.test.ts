// @vitest-environment jsdom
/**
 * The clipboard: success goes through the fake, denial yields the failure,
 * and no clipboard API yields the failure without throwing.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClipboardMessage, ClipboardReadMessage, copyText, readText } from '../src/dom/index.js'

const written: Array<string> = []
let held = ''
let denied = false

const installClipboard = () => {
  written.length = 0
  denied = false
  Object.defineProperty(window.navigator, 'clipboard', {
    value: {
      writeText: (text: string) => {
        if (denied) return Promise.reject(new Error('denied'))
        written.push(text)
        return Promise.resolve()
      },
      readText: () => (denied ? Promise.reject(new Error('denied')) : Promise.resolve(held)),
    },
    configurable: true,
  })
  vi.stubGlobal('navigator', window.navigator)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('writes and yields Copied', async () => {
    installClipboard()
    const command = copyText('hi')
    expect(command.name).toBe('Clipboard.copy')
    expect(await Effect.runPromise(command.effect)).toEqual(ClipboardMessage.Copied())
    expect(written).toEqual(['hi'])
  })

  it('yields CopyFailed on denial', async () => {
    installClipboard()
    denied = true
    expect(await Effect.runPromise(copyText('hi').effect)).toEqual(
      ClipboardMessage.CopyFailed({ message: 'denied' }),
    )
  })

  it('yields CopyFailed without a clipboard API', async () => {
    vi.stubGlobal('navigator', {})
    expect(await Effect.runPromise(copyText('hi').effect)).toEqual(
      ClipboardMessage.CopyFailed({ message: 'clipboard is unavailable' }),
    )
  })
})

describe('readText', () => {
  it('yields what the clipboard holds', async () => {
    installClipboard()
    held = 'copied elsewhere'
    expect(await Effect.runPromise(readText().effect)).toEqual(
      ClipboardReadMessage.Read({ text: 'copied elsewhere' }),
    )
  })

  it('yields ReadFailed on denial, and without a clipboard API', async () => {
    installClipboard()
    denied = true
    expect(await Effect.runPromise(readText().effect)).toEqual(
      ClipboardReadMessage.ReadFailed({ message: 'denied' }),
    )
    vi.stubGlobal('navigator', {})
    expect(await Effect.runPromise(readText().effect)).toEqual(
      ClipboardReadMessage.ReadFailed({ message: 'clipboard is unavailable' }),
    )
  })
})

// @vitest-environment jsdom
/**
 * Share: success shares, dismissal is Dismissed (not failure), rejection is
 * ShareFailed, and no share API yields ShareFailed without throwing.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareMessage, share } from '../src/dom/index.js'

class Dismissal extends Error {
  override readonly name = 'AbortError'
}

const installShare = (behavior: () => Promise<void>) => {
  Object.defineProperty(window.navigator, 'share', {
    value: (data: unknown) => {
      void data
      return behavior()
    },
    configurable: true,
  })
  vi.stubGlobal('navigator', window.navigator)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('share', () => {
  it('shares and yields Shared', async () => {
    installShare(() => Promise.resolve())
    const command = share({ title: 'Hi' })
    expect(command.name).toBe('Share.share')
    expect(await Effect.runPromise(command.effect)).toEqual(ShareMessage.Shared())
  })

  it('yields Dismissed on sheet dismissal', async () => {
    installShare(() => Promise.reject(new Dismissal('dismissed')))
    expect(await Effect.runPromise(share({ text: 'hi' }).effect)).toEqual(ShareMessage.Dismissed())
  })

  it('yields ShareFailed on rejection', async () => {
    installShare(() => Promise.reject(new Error('not supported')))
    expect(await Effect.runPromise(share({ url: 'https://example.com' }).effect)).toEqual(
      ShareMessage.ShareFailed({ message: 'not supported' }),
    )
  })

  it('yields ShareFailed without a share API', async () => {
    vi.stubGlobal('navigator', {})
    expect(await Effect.runPromise(share({ text: 'hi' }).effect)).toEqual(
      ShareMessage.ShareFailed({ message: 'share is unavailable' }),
    )
  })
})

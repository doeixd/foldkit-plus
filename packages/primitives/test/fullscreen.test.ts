// @vitest-environment jsdom
/**
 * Fullscreen: enter/exit Commands through fakes (success, rejection,
 * missing API) and the fullscreenchange entry against the real document.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  FullscreenMessage,
  enterFullscreen,
  exitFullscreen,
  fullscreenChanges,
} from '../src/device/index.js'
import { takeMessages } from './support.js'

const stubElement = (request: () => Promise<void>) =>
  ({
    requestFullscreen: request,
  }) as unknown as Element

describe('enterFullscreen', () => {
  it('requests and yields Entered', async () => {
    let requested = 0
    const command = enterFullscreen(
      stubElement(() => {
        requested++
        return Promise.resolve()
      }),
    )
    expect(command.name).toBe('Fullscreen.enter')
    expect(await Effect.runPromise(command.effect)).toEqual(FullscreenMessage.Entered())
    expect(requested).toBe(1)
  })

  it('yields Failed when the request rejects', async () => {
    const command = enterFullscreen(stubElement(() => Promise.reject(new Error('denied'))))
    expect(await Effect.runPromise(command.effect)).toEqual(
      FullscreenMessage.Failed({ message: 'denied' }),
    )
  })

  it('yields Failed without the element capability', async () => {
    expect(await Effect.runPromise(enterFullscreen({} as Element).effect)).toEqual(
      FullscreenMessage.Failed({ message: 'fullscreen is unavailable' }),
    )
  })

  it('falls back to the legacy prefix', async () => {
    let requested = 0
    const legacy = {
      webkitRequestFullscreen: () => {
        requested++
        return Promise.resolve()
      },
    } as unknown as Element
    expect(await Effect.runPromise(enterFullscreen(legacy).effect)).toEqual(
      FullscreenMessage.Entered(),
    )
    expect(requested).toBe(1)
  })
})

describe('exitFullscreen', () => {
  it('exits and yields Exited', async () => {
    const original = document.exitFullscreen
    let exited = 0
    Object.defineProperty(document, 'exitFullscreen', {
      value: () => {
        exited++
        return Promise.resolve()
      },
      configurable: true,
    })
    try {
      expect(await Effect.runPromise(exitFullscreen().effect)).toEqual(FullscreenMessage.Exited())
      expect(exited).toBe(1)
    } finally {
      Object.defineProperty(document, 'exitFullscreen', { value: original, configurable: true })
    }
  })

  it('yields Failed when exiting rejects', async () => {
    const original = document.exitFullscreen
    Object.defineProperty(document, 'exitFullscreen', {
      value: () => Promise.reject(new Error('no element')),
      configurable: true,
    })
    try {
      expect(await Effect.runPromise(exitFullscreen().effect)).toEqual(
        FullscreenMessage.Failed({ message: 'no element' }),
      )
    } finally {
      Object.defineProperty(document, 'exitFullscreen', { value: original, configurable: true })
    }
  })

  it('falls back to the legacy prefix', async () => {
    const originalExit = document.exitFullscreen
    const originalWebkit = (document as unknown as Record<string, unknown>).webkitExitFullscreen
    let exited = 0
    Object.defineProperty(document, 'exitFullscreen', { value: undefined, configurable: true })
    Object.defineProperty(document, 'webkitExitFullscreen', {
      value: () => {
        exited++
        return Promise.resolve()
      },
      configurable: true,
    })
    try {
      expect(await Effect.runPromise(exitFullscreen().effect)).toEqual(FullscreenMessage.Exited())
      expect(exited).toBe(1)
    } finally {
      Object.defineProperty(document, 'exitFullscreen', { value: originalExit, configurable: true })
      Object.defineProperty(document, 'webkitExitFullscreen', {
        value: originalWebkit,
        configurable: true,
      })
    }
  })

  it('yields Failed without the document capability', async () => {
    const originalExit = document.exitFullscreen
    const originalWebkit = (document as unknown as Record<string, unknown>).webkitExitFullscreen
    Object.defineProperty(document, 'exitFullscreen', { value: undefined, configurable: true })
    Object.defineProperty(document, 'webkitExitFullscreen', {
      value: undefined,
      configurable: true,
    })
    try {
      expect(await Effect.runPromise(exitFullscreen().effect)).toEqual(
        FullscreenMessage.Failed({ message: 'fullscreen is unavailable' }),
      )
    } finally {
      Object.defineProperty(document, 'exitFullscreen', { value: originalExit, configurable: true })
      Object.defineProperty(document, 'webkitExitFullscreen', {
        value: originalWebkit,
        configurable: true,
      })
    }
  })
})

describe('fullscreenChanges', () => {
  it('starts with the current answer, then follows flips', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(fullscreenChanges(), 2))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        Object.defineProperty(document, 'fullscreenElement', {
          value: document.documentElement,
          configurable: true,
        })
        document.dispatchEvent(new Event('fullscreenchange'))
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      FullscreenMessage.Changed({ active: false }),
      FullscreenMessage.Changed({ active: true }),
    ])
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
  })
})

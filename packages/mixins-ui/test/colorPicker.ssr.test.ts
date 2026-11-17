// @vitest-environment jsdom
/**
 * The color picker draws the same markup on a server and in a browser: its view reads
 * nothing from the environment, so a runtime with an `EyeDropper` and one without draw the
 * same page, and the button appears only where the application asks for it. A drawing that
 * differs between the two is replaced when a server-rendered page takes over.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorPicker } from '../src/index.js'
import { parsed } from './ssr.js'

const model = ColorPicker.init({ id: 'accent', color: ColorPicker.color('#3b82f6') })

const drawnWith = async (eyedropper?: boolean): Promise<Element> => {
  const page = await parsed(model, (current, h) =>
    ColorPicker.view({ model: current, label: 'Accent', onMessage: () => null, eyedropper }, h),
  )
  const group = page.querySelector('[role="group"]')
  expect(group).not.toBeNull()
  return group!
}

afterEach(() => vi.unstubAllGlobals())

describe('ColorPicker.view on a server', () => {
  it('draws the same markup whether or not the runtime has an eyedropper', async () => {
    const without = (await drawnWith()).outerHTML
    vi.stubGlobal('EyeDropper', class {})
    expect(ColorPicker.canEyedrop()).toBe(true)
    const withOne = (await drawnWith()).outerHTML
    expect(withOne).toBe(without)
    expect(without).not.toContain('Pick a color from the screen')
  })

  it('draws the button when asked, identically with or without an eyedropper in the runtime', async () => {
    const asked = (await drawnWith(true)).outerHTML
    expect(asked).toContain('Pick a color from the screen')
    vi.stubGlobal('EyeDropper', class {})
    expect((await drawnWith(true)).outerHTML).toBe(asked)
  })
})

describe('ColorPicker.Eyedrop', () => {
  const run = () => Effect.runPromise(ColorPicker.Eyedrop().effect)

  it('answers a cancel, with no thrown defect, where the runtime has no eyedropper', async () => {
    const answer = await run()
    expect(answer._tag).toBe('CancelledEyedropper')
  })

  it('answers a cancel when the user closes the eyedropper', async () => {
    vi.stubGlobal(
      'EyeDropper',
      class {
        open = () => Promise.reject(new DOMException('closed', 'AbortError'))
      },
    )
    expect((await run())._tag).toBe('CancelledEyedropper')
  })

  it('answers the color it read', async () => {
    vi.stubGlobal(
      'EyeDropper',
      class {
        open = () => Promise.resolve({ sRGBHex: '#00ff00' })
      },
    )
    const answer = await run()
    expect(answer._tag).toBe('GotEyedropperColor')
    expect(answer).toMatchObject({ hex: '#00ff00' })
  })
})

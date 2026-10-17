/**
 * The signature pad in a real browser: a drag draws a stroke under the
 * pointer, a pen pressed hard draws wider than one pressed lightly, the line
 * and "Sign here" are where a signer looks and the words go once something
 * is signed, a typed name sits on the line, undo and clear take strokes
 * away, and the PNG export draws what the pad shows.
 */
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import { SignaturePad as Recipe } from '../src/recipes/signaturePad.js'
import * as SignaturePad from '../src/signaturePad.js'
import { SignaturePadSlots } from '../src/signaturePad.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(SignaturePadSlots)(Recipe({}))

const Model = Schema.Struct({
  pad: SignaturePad.Model,
  exported: Schema.OptionFromNullOr(Schema.String),
})
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'signature-pad-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { pad: SignaturePad.init({ id: 'sign' }), exported: Option.none() } }),
      update: (model: Model, message: SignaturePad.Message) => {
        const next = SignaturePad.update(model.pad, message)
        const exported = message._tag === 'ExportedPng' ? Option.some(message.url) : model.exported
        return {
          model: modifyFields(model, { pad: () => next.model, exported: () => exported }),
          commands: mapMessages(next.commands ?? [], message => message),
        }
      },
      view: (model: Model, h: HtmlBuilder<SignaturePad.Message>) =>
        h.div(
          // Border box, as the reset has it: 400 pixels inside the padding.
          [h.Style({ padding: '2rem', inlineSize: 'calc(400px + 4rem)' })],
          [
            SignaturePad.view(
              { model: model.pad, label: 'Signature', onMessage: message => message, style },
              h,
            ),
            h.button(
              [
                h.Id('export'),
                h.OnClick(
                  SignaturePad.Message.RequestedPng({ scale: 2, background: Option.none() }),
                ),
              ],
              ['Export'],
            ),
            ...Option.match(model.exported, {
              onNone: () => [],
              onSome: url => [h.output([h.Id('exported'), h.DataAttribute('url', url)], [])],
            }),
          ],
        ),
    }),
  )
}

const control = () => document.getElementById('sign-control')
const paths = () => Array.from(document.querySelectorAll<SVGPathElement>('#sign-segments path'))
/** The control's padding box, which the strokes are drawn in. */
const inner = () => {
  const pad = control()!
  const { left, top } = pad.getBoundingClientRect()
  return {
    left: left + pad.clientLeft,
    top: top + pad.clientTop,
    width: pad.clientWidth,
    height: pad.clientHeight,
  }
}
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

const ready = async () => {
  await vi.waitFor(() => expect(control()).not.toBeNull())
  // The pad measures itself as it is drawn.
  await frame()
}

/** A stroke through `points`, in the control's pixels, by one pointer. */
const draw = (
  points: ReadonlyArray<readonly [number, number]>,
  pointer: { readonly type?: string; readonly pressure?: number } = {},
) => {
  const pad = control()!
  const box = inner()
  const at = (type: string, [x, y]: readonly [number, number]) =>
    pad.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 5,
        pointerType: pointer.type ?? 'mouse',
        pressure: pointer.pressure ?? 0.5,
        button: 0,
        clientX: box.left + x,
        clientY: box.top + y,
      }),
    )
  const [first, ...rest] = points
  at('pointerdown', first!)
  for (const point of rest) at('pointermove', point)
  at('pointerup', rest[rest.length - 1] ?? first!)
}

const across = (y: number, from = 20, to = 220): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: 21 }, (_, step) => [from + ((to - from) * step) / 20, y] as const)

const exported = async () => {
  const before = document.getElementById('exported')?.dataset['url']
  document.getElementById('export')!.click()
  const url = await vi.waitFor(() => {
    const found = document.getElementById('exported')?.dataset['url']
    expect(found).not.toBe(before)
    return found!
  })
  const image = new Image()
  image.src = url
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  return {
    width: canvas.width,
    height: canvas.height,
    alpha: (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3],
    /** How many pixels have any ink. */
    inked: () => {
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let count = 0
      for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha]! > 0) count += 1
      return count
    },
  }
}

test('a drag draws a stroke under the pointer, and the page does not take it', async () => {
  const mounted = mount()
  try {
    await ready()
    expect(getComputedStyle(control()!).touchAction).toBe('none')
    draw(across(60))
    await vi.waitFor(() => expect(paths()).toHaveLength(1))
    const pad = inner()
    const ink = paths()[0]!.getBoundingClientRect()
    // From the first point to the last, a pen's width about the line.
    // The cap reaches back the half-pressure radius, 2 pixels, from the first point at 20.
    expect(ink.left - pad.left).toBeCloseTo(18, 0)
    expect(ink.right - pad.left).toBeGreaterThan(205)
    expect(ink.right - pad.left).toBeLessThan(226)
    expect(ink.top - pad.top).toBeGreaterThan(54)
    expect(ink.bottom - pad.top).toBeLessThan(66)
    expect(control()!.getAttribute('aria-label')).toBe('Signature: signed, 1 stroke')
  } finally {
    mounted.dispose()
  }
})

test('a pen pressed hard draws wider than one pressed lightly', async () => {
  const mounted = mount()
  try {
    await ready()
    draw(across(40), { type: 'pen', pressure: 1 })
    draw(across(110), { type: 'pen', pressure: 0.1 })
    await vi.waitFor(() => expect(paths()).toHaveLength(2))
    const [hard, light] = paths().map(path => path.getBoundingClientRect().height)
    expect(light!).toBeLessThan(hard! * 0.6)
  } finally {
    mounted.dispose()
  }
})

test('the line and "Sign here" are drawn to sign on, and the words go once signed', async () => {
  const mounted = mount()
  try {
    await ready()
    const pad = inner()
    const guide = document
      .querySelector<HTMLElement>('#sign-control > div')!
      .getBoundingClientRect()
    expect(guide.top - pad.top).toBeCloseTo(pad.height * SignaturePad.BASELINE, 0)
    const words = Array.from(control()!.querySelectorAll('span')).find(
      span => span.textContent === 'Sign here',
    )!
    // Just above the line, at its start.
    expect(words.getBoundingClientRect().bottom).toBeLessThanOrEqual(guide.top)
    expect(words.getBoundingClientRect().left).toBeCloseTo(guide.left, 0)
    expect(getComputedStyle(words).opacity).toBe('1')
    draw(across(40))
    await vi.waitFor(() => expect(getComputedStyle(words).opacity).toBe('0'))
  } finally {
    mounted.dispose()
  }
})

test('a typed name sits on the line, and names what the pad holds', async () => {
  const mounted = mount()
  try {
    await ready()
    await userEvent.type(document.getElementById('sign-typed')!, 'Ada Lovelace')
    const name = await vi.waitFor(() => {
      const found = document.getElementById('sign-typed-name')
      expect(found?.textContent).toBe('Ada Lovelace')
      return found!
    })
    const pad = inner()
    expect(name.getBoundingClientRect().bottom - pad.top).toBeCloseTo(
      pad.height * SignaturePad.BASELINE,
      0,
    )
    expect(control()!.getAttribute('aria-label')).toBe('Signature: signed as Ada Lovelace')
    const typed = await exported()
    expect(typed.inked()).toBeGreaterThan(100)
  } finally {
    mounted.dispose()
  }
})

test('undo takes the last stroke away, and clear takes them all', async () => {
  const mounted = mount()
  try {
    await ready()
    draw(across(40))
    draw(across(110))
    await vi.waitFor(() => expect(paths()).toHaveLength(2))
    await userEvent.click(document.querySelector<HTMLElement>('button[aria-label="Undo"]')!)
    await vi.waitFor(() => expect(paths()).toHaveLength(1))
    await userEvent.click(document.querySelector<HTMLElement>('button[aria-label="Clear"]')!)
    await vi.waitFor(() => expect(paths()).toHaveLength(0))
    expect(control()!.getAttribute('aria-label')).toBe('Signature: empty')
  } finally {
    mounted.dispose()
  }
})

test('the PNG export draws the strokes where the pad shows them, at its scale', async () => {
  const mounted = mount()
  try {
    await ready()
    const pad = inner()
    draw(across(60))
    await vi.waitFor(() => expect(paths()).toHaveLength(1))
    const png = await exported()
    expect([png.width, png.height]).toEqual([Math.round(pad.width * 2), Math.round(pad.height * 2)])
    // On the line, twice the pad's pixels; well away from it, clear.
    expect(png.alpha(240, 120)).toBe(255)
    expect(png.alpha(240, 260)).toBe(0)
    expect(png.alpha(600, 120)).toBe(0)
  } finally {
    mounted.dispose()
  }
})

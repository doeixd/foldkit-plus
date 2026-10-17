// @vitest-environment jsdom
/**
 * The signature pad as markup and as a Model. The markup: a group named by
 * its label, the control an image named by what it holds, the line and
 * "Sign here" hidden from assistive technology, undo and clear enabled only
 * when they would do something, and the typed field labelled. The Model:
 * strokes built from what the pointer reports, scaled into the pad's own
 * coordinates, close points dropped, a second pointer ignored. The drawing:
 * an outline as wide as the pen and its pressure, thinner when fast, and an
 * SVG document that reads back.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SignaturePad, SignaturePadSlots, Patterns } from '../src/index.js'
import { SignaturePad as Recipe } from '../src/recipes/signaturePad.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(SignaturePadSlots)(Recipe({}))
const { Message } = SignaturePad

const step = (from: SignaturePad.Model, sent: SignaturePad.Message) =>
  SignaturePad.update(from, sent).model
const steps = (from: SignaturePad.Model, ...sent: ReadonlyArray<SignaturePad.Message>) =>
  sent.reduce(step, from)

const box = { width: 400, height: 160 }
const measured = step(SignaturePad.init({ id: 'sign' }), Message.Measured(box))
const at = (x: number, y: number, pressure = 0.5) => ({ x, y, pressure })

/** One stroke through `points`, drawn on a control of `box`'s size. */
const stroke = (
  from: SignaturePad.Model,
  points: ReadonlyArray<ReturnType<typeof at>>,
  pen = false,
) => {
  const [first, ...rest] = points
  return steps(
    from,
    Message.Began({ ...box, point: first!, pen }),
    Message.Extended({ ...box, points: rest }),
    Message.Ended(),
  )
}

const line = stroke(measured, [at(10, 50), at(60, 50), at(110, 50)])

interface More {
  readonly model?: SignaturePad.Model
  readonly disabled?: boolean
}

const Pad = SlotView.forMessages<TestMessage>().define(SignaturePadSlots, (more: More, _, h) =>
  SignaturePad.view(
    { model: measured, label: 'Signature', onMessage: () => message('Clicked'), style, ...more },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Pad, more)

/** The points a path passes through, as numbers. */
const pointsOf = (d: string) =>
  Array.from(d.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g), ([, x, y]) => ({
    x: Number(x),
    y: Number(y),
  }))
const extent = (d: string) => {
  const points = pointsOf(d)
  const ys = points.map(point => point.y)
  const xs = points.map(point => point.x)
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  }
}
const pen = SignaturePad.init({ id: 'p' }).pen

describe('SignaturePad.view', () => {
  it('meets the signature pad pattern', () => {
    expect(A11y.validate(Patterns.SignaturePad, SignaturePadSlots)).toEqual([])
  })

  it('is a group named by its label, the control an image named by what it holds', () => {
    const pad = drawn()
    const [group] = Inert.byRole(pad, 'group')
    const [label] = Inert.bySlot(pad, 'label')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.value(group, 'data-empty')).toBe('')
    const [control] = Inert.bySlot(pad, 'control')
    expect([Inert.value(control, 'role'), Inert.value(control, 'aria-label')]).toEqual([
      'img',
      'Signature: empty',
    ])
    const name = (model: SignaturePad.Model) =>
      Inert.value(Inert.bySlot(drawn({ model }), 'control')[0], 'aria-label')
    expect(name(stroke(line, [at(10, 90), at(80, 90)]))).toBe('Signature: signed, 2 strokes')
    expect(name(step(measured, Message.Typed({ text: ' Ada Lovelace ' })))).toBe(
      'Signature: signed as Ada Lovelace',
    )
  })

  it('draws the line and the words to sign on, hidden from assistive technology', () => {
    const pad = drawn()
    for (const slot of ['guide', 'placeholder'] as const)
      expect(Inert.value(Inert.bySlot(pad, slot)[0], 'aria-hidden')).toBe('true')
    expect(Inert.text(Inert.bySlot(pad, 'placeholder')[0])).toBe('Sign here')
  })

  it('draws nothing outside a Slot', () => {
    expect(Inert.unslotted(drawn({ model: line }))).toEqual([])
  })

  it('draws each stroke as a path in the pad’s coordinates', () => {
    const pad = drawn({ model: line })
    const [segments] = Inert.bySlot(pad, 'segments')
    expect(Inert.value(segments, 'viewBox')).toBe('0 0 400 160')
    const paths = Inert.bySlot(pad, 'stroke')
    expect(paths.map(path => Inert.value(path, 'd'))).toEqual([
      SignaturePad.pathOf(line.strokes[0]!, line.pen),
    ])
    expect(Inert.value(Inert.byRole(pad, 'group')[0], 'data-drawn')).toBe('')
  })

  it('enables undo and clear only when they would do something', () => {
    const disabledOf = (model: SignaturePad.Model) =>
      (['undo', 'clear'] as const).map(slot =>
        Inert.value(Inert.bySlot(drawn({ model }), slot)[0], 'disabled'),
      )
    expect(disabledOf(measured)).toEqual([true, true])
    expect(disabledOf(line)).toEqual([undefined, undefined])
    // A typed name can be cleared, but there is no stroke to undo.
    expect(disabledOf(step(measured, Message.Typed({ text: 'Ada' })))).toEqual([true, undefined])
  })

  it('shows a typed name on the line while nothing is drawn', () => {
    const typed = step(measured, Message.Typed({ text: 'Ada' }))
    expect(Inert.text(Inert.bySlot(drawn({ model: typed }), 'typedName')[0])).toBe('Ada')
    const both = step(line, Message.Typed({ text: 'Ada' }))
    expect(Inert.bySlot(drawn({ model: both }), 'typedName')).toEqual([])
  })

  it('labels the typed field, and takes nothing when disabled', () => {
    const pad = drawn({ disabled: true })
    const [label] = Inert.bySlot(pad, 'fallbackLabel')
    const [input] = Inert.bySlot(pad, 'input')
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
    expect(Inert.value(input, 'disabled')).toBe(true)
    const [control] = Inert.bySlot(pad, 'control')
    expect(Inert.value(control, 'aria-disabled')).toBe('true')
    expect(control?.data?.hook?.insert).toBeUndefined()
    expect(Inert.value(Inert.bySlot(drawn(), 'control')[0], 'aria-disabled')).toBeUndefined()
  })
})

describe('SignaturePad.update', () => {
  it('builds a stroke from a press, its moves and its release', () => {
    expect(line.strokes).toEqual([
      { points: [at(10, 50), at(60, 50), at(110, 50)], pressure: false },
    ])
    expect(line.drawing).toEqual(Option.none())
    expect(stroke(measured, [at(1, 1, 0.8), at(9, 9, 0.2)], true).strokes[0]?.pressure).toBe(true)
  })

  it('scales a control drawn at another size into the pad’s coordinates', () => {
    const smaller = steps(
      measured,
      Message.Began({ width: 200, height: 80, point: at(10, 10), pen: false }),
      Message.Extended({ width: 200, height: 80, points: [at(50, 40, 2)] }),
      Message.Ended(),
    )
    expect(smaller.strokes[0]?.points).toEqual([at(20, 20), at(100, 80, 1)])
    expect(smaller.space).toEqual(Option.some(box))
  })

  it('takes its coordinates from the first press when nothing measured it', () => {
    const unmeasured = stroke(SignaturePad.init({ id: 's' }), [at(1, 1), at(5, 5)])
    expect(unmeasured.space).toEqual(Option.some(box))
    expect(step(measured, Message.Measured({ width: 10, height: 10 }))).toBe(measured)
  })

  it('drops points nearer the last than a pixel', () => {
    const started = step(measured, Message.Began({ ...box, point: at(10, 10), pen: false }))
    const near = step(started, Message.Extended({ ...box, points: [at(10.5, 10), at(10.2, 10.3)] }))
    expect(near).toBe(started)
    const some = step(started, Message.Extended({ ...box, points: [at(10.5, 10), at(12, 10)] }))
    expect(Option.getOrThrow(some.drawing).points).toEqual([at(10, 10), at(12, 10)])
  })

  it('ignores a second pointer, and a move or a release with no stroke under way', () => {
    const started = step(measured, Message.Began({ ...box, point: at(10, 10), pen: false }))
    expect(step(started, Message.Began({ ...box, point: at(90, 90), pen: false }))).toBe(started)
    expect(step(measured, Message.Extended({ ...box, points: [at(50, 50)] }))).toBe(measured)
    expect(step(measured, Message.Ended())).toBe(measured)
  })

  it('undoes the last stroke, clears all, and keeps its Model when there is nothing to', () => {
    const two = stroke(line, [at(10, 90), at(80, 90)])
    expect(step(two, Message.Undid()).strokes).toEqual(line.strokes)
    const typed = step(two, Message.Typed({ text: 'Ada' }))
    const cleared = step(typed, Message.Cleared())
    expect([cleared.strokes, cleared.typed]).toEqual([[], ''])
    expect(step(measured, Message.Undid())).toBe(measured)
    expect(step(measured, Message.Cleared())).toBe(measured)
    expect(step(typed, Message.Typed({ text: 'Ada' }))).toBe(typed)
  })

  it('exports a PNG as a Command', () => {
    const asked = SignaturePad.update(
      line,
      Message.RequestedPng({ scale: 2, background: Option.none() }),
    )
    expect(asked.model).toBe(line)
    expect(asked.commands?.map(command => command.name)).toEqual(['SignaturePad.ExportPng'])
  })
})

describe('SignaturePad.pathOf', () => {
  const straight = (pressure: number, real: boolean, gap = 10) => ({
    points: Array.from({ length: 12 }, (_, step) => at(20 + step * gap, 50, pressure)),
    pressure: real,
  })

  it('outlines a stroke as wide as the pen around its points, capped at both ends', () => {
    const d = SignaturePad.pathOf(straight(1, true), pen)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const { left, right, top, bottom } = extent(d)
    // At full pressure a radius of 0.8 of the pen's size (its thinning 0.6), on either side.
    expect(top).toBeGreaterThan(50 - pen.size * 0.8 - 0.01)
    expect(top).toBeLessThan(50 - pen.size * 0.7)
    expect(bottom).toBeLessThan(50 + pen.size * 0.8 + 0.01)
    expect(bottom).toBeGreaterThan(50 + pen.size * 0.7)
    expect(left).toBeLessThan(20)
    expect(right).toBeGreaterThan(110)
  })

  it('outlines a short stroke whole, its round caps turning outward', () => {
    // A pen at half pressure: a radius of half its size the whole way.
    const short = { points: [at(20, 50), at(25, 50), at(30, 50)], pressure: true }
    const points = pointsOf(SignaturePad.pathOf(short, pen))
    const area = Math.abs(
      points.reduce((sum, point, step) => {
        const next = points[(step + 1) % points.length]!
        return sum + point.x * next.y - next.x * point.y
      }, 0) / 2,
    )
    const radius = pen.size / 2
    const { left, right } = extent(SignaturePad.pathOf(short, pen))
    const length = right - left - 2 * radius
    // A capsule: a rectangle and a circle. A cap turned inward crosses the outline and cancels.
    expect(area / (length * 2 * radius + Math.PI * radius ** 2)).toBeCloseTo(1, 1)
  })

  it('draws a pen’s pressure as it changes along the stroke', () => {
    const rising = {
      points: Array.from({ length: 12 }, (_, step) => at(20 + step * 10, 50, step < 6 ? 0.1 : 1)),
      pressure: true,
    }
    const end = pointsOf(SignaturePad.pathOf(rising, pen)).filter(point => point.x > 100)
    const ys = end.map(point => point.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(pen.size * 0.8 * 2 * 0.9)
  })

  it('draws a pen’s light pressure thinner than its heavy one', () => {
    const height = (pressure: number) => {
      const { top, bottom } = extent(SignaturePad.pathOf(straight(pressure, true), pen))
      return bottom - top
    }
    expect(height(0.1)).toBeLessThan(height(1) * 0.6)
  })

  it('draws a fast stroke thinner than a slow one, where no pressure is reported', () => {
    const height = (gap: number) => {
      const { top, bottom } = extent(SignaturePad.pathOf(straight(0.5, false, gap), pen))
      return bottom - top
    }
    expect(height(12)).toBeLessThan(height(1))
  })

  it('draws a single press as a dot', () => {
    const { left, right, top, bottom } = extent(
      SignaturePad.pathOf({ points: [at(50, 50)], pressure: false }, pen),
    )
    expect(right - left).toBeCloseTo(bottom - top, 1)
    expect(right - left).toBeGreaterThan(0)
  })
})

describe('SignaturePad.toSvg', () => {
  const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml')

  it('writes the strokes as a document that reads back', () => {
    const two = stroke(line, [at(10, 90), at(80, 90)])
    const read = parse(Option.getOrThrow(SignaturePad.toSvg(two, { color: '#123456' })))
    const svg = read.documentElement
    expect([svg.getAttribute('viewBox'), svg.getAttribute('fill')]).toEqual([
      '0 0 400 160',
      '#123456',
    ])
    expect(Array.from(read.querySelectorAll('path'), path => path.getAttribute('d'))).toEqual(
      two.strokes.map(each => SignaturePad.pathOf(each, two.pen)),
    )
  })

  it('writes a typed name as text, escaped, and nothing for an empty pad', () => {
    const typed = step(measured, Message.Typed({ text: '<Ada> & "Co"' }))
    const read = parse(Option.getOrThrow(SignaturePad.toSvg(typed)))
    expect(read.querySelector('parsererror')).toBeNull()
    expect(read.querySelector('text')?.textContent).toBe('<Ada> & "Co"')
    expect(SignaturePad.toSvg(measured)).toEqual(Option.none())
    expect(SignaturePad.isEmpty(step(measured, Message.Typed({ text: '  ' })))).toBe(true)
  })
})

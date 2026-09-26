// @vitest-environment jsdom
/**
 * A Style's rules arrive with the Slot that draws them: drawing a class queues
 * its CSS once, into one element, after the page's own stylesheets, and never
 * repeats what a stylesheet on the page already carries.
 */
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { afterEach, expect, it } from 'vitest'

const TestSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const L = Layers.standard
const Look = Style.forSlots(TestSlots)(
  { root: Style.self({ color: 'rgb(1, 2, 3)' }) },
  { name: 'Look', layer: L.layer('app') },
)
const View = SlotView.define(TestSlots, (_: void, slots, h) => h.div(slots.root.attrs(), [])).pipe(
  Style.attach(Look),
)
const [rule] = Look.rules
if (rule === undefined) throw new Error('the Look compiles to one class')

const injected = () => document.querySelector('style[data-foldkit-styles]')
const draw = async () => {
  View(undefined, SlotView.inertBuilder())
  // Injection waits for the microtask after the draw.
  await Promise.resolve()
}

afterEach(() => {
  document.head.innerHTML = ''
})

it('inserts a drawn class’s CSS once, after the layer order', async () => {
  await draw()
  await draw()
  const text = injected()?.textContent ?? ''
  expect(text.startsWith(`@layer ${L.names.join(', ')};`)).toBe(true)
  expect(text.split(rule.className).length - 1).toBe(rule.css.split(rule.className).length - 1)
  expect(text).toContain(rule.css)
})

it('leaves out what a stylesheet on the page already carries', async () => {
  const sheet = document.createElement('style')
  sheet.textContent = Style.stylesheet(Look)
  document.head.appendChild(sheet)
  await draw()
  expect(injected()?.textContent ?? '').not.toContain(rule.className)
})

it('starts afresh when its element is gone', async () => {
  await draw()
  injected()?.remove()
  await draw()
  expect(injected()?.textContent ?? '').toContain(rule.css)
})

it('inserts a drawn Style’s keyframes once', async () => {
  const pulse = Style.keyframes({ from: { opacity: '0' }, to: { opacity: '1' } })
  const Pulsing = SlotView.define(TestSlots, (_: void, slots, h) =>
    h.div(slots.root.attrs(), []),
  ).pipe(
    Style.attach(
      Style.forSlots(TestSlots)({
        root: Style.compose(pulse.style, Style.self({ animationName: pulse.name })),
      }),
    ),
  )
  Pulsing(undefined, SlotView.inertBuilder())
  Pulsing(undefined, SlotView.inertBuilder())
  await Promise.resolve()
  expect((injected()?.textContent ?? '').split(`@keyframes ${pulse.name}`).length - 1).toBe(1)
})

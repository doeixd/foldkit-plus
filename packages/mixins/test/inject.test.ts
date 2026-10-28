// @vitest-environment jsdom
/**
 * A Style's rules arrive with the Slot that draws them: drawing a class queues
 * its CSS once, into one element, after the page's own stylesheets, and never
 * repeats what a stylesheet on the page already carries.
 */
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { raise } from 'foldkit-mixins/theme'
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

it('adds nothing, not even an element, when the page’s sheets carry what is drawn', async () => {
  const sheet = document.createElement('style')
  sheet.textContent = Style.stylesheet(Look)
  document.head.appendChild(sheet)
  await draw()
  expect(injected()).toBeNull()
})

it('counts again when a sheet it counted is removed', async () => {
  const sheet = document.createElement('style')
  sheet.textContent = Style.stylesheet(Look)
  document.head.appendChild(sheet)
  await draw()
  sheet.remove()
  await draw()
  expect(injected()?.textContent ?? '').toContain(rule.css)
})

it('repeats a layer order the page declares, and not the standard one', async () => {
  const sheet = document.createElement('style')
  sheet.textContent = '@layer base, app;'
  document.head.appendChild(sheet)
  await draw()
  const text = injected()?.textContent ?? ''
  expect(text).toContain(rule.css)
  expect(text).not.toContain('@layer reset')
  // First, so the injected sheet cannot reorder the page's layers if it ever
  // stands ahead of the page's own sheet: a layer is placed where first named.
  expect(text.startsWith('@layer base, app;')).toBe(true)
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

it('gives a server the CSS of the classes a page’s markup uses, and no others', () => {
  const Unused = Style.forSlots(TestSlots)({ root: Style.self({ color: 'rgb(9, 9, 9)' }) })
  const [unused] = Unused.rules
  if (unused === undefined) throw new Error('the unused Style compiles to one class')
  const css = Style.usedIn(`<div class="x ${rule.className}"></div>`)
  expect(css.startsWith(`@layer ${L.names.join(', ')};`)).toBe(true)
  expect(css).toContain(rule.css)
  expect(css).not.toContain(unused.className)
})

/** A Style whose classes need a global rule, one of them drawn only for some input. */
const Marked = Style.forSlots(TestSlots)({
  root: Style.compose(
    Style.global('.marked{--depth:1}@layer mine, yours;'),
    Style.self({ color: 'rgb(4, 5, 6)' }),
    Style.whenInput((on: boolean) => on, Style.self({ color: 'rgb(7, 8, 9)' })),
  ),
})
const [base, conditional] = Marked.rules
if (base === undefined || conditional === undefined)
  throw new Error('the Marked Style compiles to two classes')
const count = (text: string, part: string) => text.split(part).length - 1

it('gives a server the global rules of the Styles whose classes a page uses, once each', () => {
  const both = Style.usedIn(`<div class="${base.className} ${conditional.className}"></div>`)
  expect(count(both, '.marked{--depth:1}')).toBe(1)
  // A layer order is the page's to declare.
  expect(both).not.toContain('@layer mine')
  // The conditional class alone is enough to need them.
  expect(Style.usedIn(`<div class="${conditional.className}"></div>`)).toContain('.marked{')
  expect(Style.usedIn(`<div class="${rule.className}"></div>`)).not.toContain('.marked{')
})

it('gives a server the depth rules of a raised element', () => {
  const Raised = Style.forSlots(TestSlots)({ root: raise(2) })
  const css = Style.usedIn(`<div class="fk-raised ${Raised.rules[0]?.className}"></div>`)
  expect(css).toContain('.fk-raised{')
})

it('injects no global rule that the page’s server-written sheet carries', async () => {
  const sheet = document.createElement('style')
  sheet.textContent = Style.usedIn(`<div class="${base.className} ${conditional.className}">`)
  document.head.appendChild(sheet)
  const MarkedView = SlotView.define(TestSlots, (on: boolean, slots, h) =>
    h.div(slots.root.attrs(), []),
  ).pipe(Style.attach(Marked))
  MarkedView(true, SlotView.inertBuilder())
  await Promise.resolve()
  expect(injected()).toBeNull()
})

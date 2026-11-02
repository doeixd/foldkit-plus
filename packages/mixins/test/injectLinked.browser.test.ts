/**
 * A stylesheet a build links (`<link data-foldkit-styles-href>`) counts as
 * carrying its classes and global rules, as a `<style>` does: a drawn class
 * it holds is not injected again, and a draw before it loads waits for it.
 */
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { afterEach, expect, it } from 'vitest'
import { ensure } from '../src/inject.js'

const TestSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const Look = Style.forSlots(TestSlots)(
  { root: Style.self({ color: 'rgb(1, 2, 3)' }) },
  { name: 'LinkedLook', layer: Layers.standard.layer('app') },
)
const View = SlotView.define(TestSlots, (_: void, slots, h) => h.div(slots.root.attrs(), [])).pipe(
  Style.attach(Look),
)
const [rule] = Look.rules
if (rule === undefined) throw new Error('the Look compiles to one class')

const KEYFRAMES = '@keyframes linked-fade{from{opacity:0}to{opacity:1}}'

const injected = () => document.querySelector('style[data-foldkit-styles]')
const draw = async () => {
  View(undefined, SlotView.inertBuilder())
  await Promise.resolve()
}

/** A linked sheet of `css`, and the moment it has loaded. */
const link = (css: string) => {
  const element = document.createElement('link')
  element.rel = 'stylesheet'
  element.setAttribute('data-foldkit-styles-href', '')
  const loaded = new Promise<void>(resolve => element.addEventListener('load', () => resolve()))
  element.href = URL.createObjectURL(new Blob([css], { type: 'text/css' }))
  return { element, loaded }
}

afterEach(() => {
  document.head.innerHTML = ''
})

it('injects nothing for a class the loaded link holds', async () => {
  const sheet = link(Style.stylesheet(Layers.standard.declare, Look))
  document.head.append(sheet.element)
  await sheet.loaded
  await draw()
  expect(injected()).toBeNull()
})

it('injects a class the link does not hold', async () => {
  const sheet = link('.unrelated{color:red}')
  document.head.append(sheet.element)
  await sheet.loaded
  await draw()
  expect(injected()?.textContent ?? '').toContain(rule.css)
})

it('waits for a link still loading, then injects only what it lacks', async () => {
  const sheet = link(Style.stylesheet(Layers.standard.declare, Look))
  document.head.append(sheet.element)
  await draw()
  expect(injected()).toBeNull()
  await sheet.loaded
  await new Promise(resolve => setTimeout(resolve))
  expect(injected()).toBeNull()
})

it('draws what a link that failed to load would have held', async () => {
  const element = document.createElement('link')
  element.rel = 'stylesheet'
  element.setAttribute('data-foldkit-styles-href', '')
  const failed = new Promise<void>(resolve => element.addEventListener('error', () => resolve()))
  element.href = '/no-such-sheet.css'
  document.head.append(element)
  await draw()
  await failed
  await new Promise(resolve => setTimeout(resolve))
  expect(injected()?.textContent ?? '').toContain(rule.css)
})

it('does not repeat a global rule the link holds, and adds one it lacks', async () => {
  const sheet = link(`@layer app{.x{color:red}}${KEYFRAMES}`)
  document.head.append(sheet.element)
  await sheet.loaded
  ensure({ globalCss: KEYFRAMES })
  ensure({ globalCss: '@keyframes linked-other{from{opacity:0}to{opacity:1}}' })
  await Promise.resolve()
  const text = injected()?.textContent ?? ''
  expect(text).not.toContain('linked-fade')
  expect(text).toContain('linked-other')
})

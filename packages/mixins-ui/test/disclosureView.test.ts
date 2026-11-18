/**
 * `Disclosure.view` over options, its state and `configure`: what the button
 * and panel carry, what a press asks for, and the state's no-ops.
 */
import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Disclosure, DisclosureSlots, Recipes } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const style = Style.forSlots(DisclosureSlots)(Recipes.Disclosure({}))
const base = {
  id: 'details',
  isOpen: false,
  onToggle: () => message('Clicked'),
  label: 'Shipping details',
  content: 'Shipped in two days.',
}
type More = Partial<Disclosure.DisclosureView<TestMessage>>
const draw = (options: More = {}) => Disclosure.view({ ...base, style, ...options }, h)
// Drawn through `Inert.draw`, which alone marks the Slots that `bySlot` and `unslotted` read.
const Drawn = SlotView.forMessages<TestMessage>().define(DisclosureSlots, (more: More, _, hh) =>
  Disclosure.view({ ...base, style, ...more }, hh),
)

describe('Disclosure.view', () => {
  it('draws a button naming its panel, whose open state it carries', () => {
    const [shut] = Inert.byTag(draw(), 'button')
    const [open] = Inert.byTag(draw({ isOpen: true }), 'button')
    expect(Inert.text(shut)).toBe('Shipping details')
    expect(Inert.value(shut, 'aria-expanded')).toBe('false')
    expect(Inert.value(open, 'aria-expanded')).toBe('true')
    expect(Inert.value(open, 'aria-controls')).toBe('details-panel')
  })

  it('draws every element of its own in a Slot, upstream’s two panel wrappers aside', () => {
    const drawn = Inert.draw(Drawn, { icon: h.span([], ['@']) })
    // `animatePanel`'s grid and the box inside it are upstream's, with no Slot; the recipe finds them by the panel's class.
    expect(Inert.unslotted(drawn, { inside: ['icon'] })).toEqual(['div > div', 'div > div > div'])
    expect(Inert.bySlot(drawn, 'icon')).toHaveLength(1)
    expect(Inert.bySlot(drawn, 'label')).toHaveLength(1)
    expect(Inert.bySlot(drawn, 'root')).toHaveLength(1)
  })

  it('sends the state a press asks for', () => {
    const asked = (isOpen: boolean) =>
      sends(
        h =>
          Disclosure.view(
            {
              ...base,
              isOpen,
              onToggle: open => (open ? message('Clicked') : message('Other')),
              style,
            },
            h,
          ),
        Scene.click(Scene.role('button', { name: 'Shipping details' })),
        Scene.expectOutMessage(isOpen ? message('Other') : message('Clicked')),
      )
    asked(true)
    asked(false)
  })

  it('draws no icon unless given one, and keeps a peek as the shut panel’s preview', () => {
    expect(Inert.bySlot(draw(), 'icon')).toHaveLength(0)
    expect(JSON.stringify(draw({ peek: '3em' }))).toContain('3em')
    expect(JSON.stringify(draw())).not.toContain('3em')
  })

  it('stops a disabled button from sending', () => {
    const [button] = Inert.byTag(draw({ disabled: true }), 'button')
    expect(Inert.value(button, 'aria-disabled')).toBe('true')
    expect(button?.data?.on?.['click']).toBeUndefined()
  })
})

describe('Disclosure state', () => {
  it('starts from its arg and folds a press', () => {
    const start = Disclosure.init({ isOpen: true })
    expect(start).toEqual({ isOpen: true })
    expect(Disclosure.update(start, Disclosure.Message.Toggled({ isOpen: false })).model).toEqual({
      isOpen: false,
    })
  })

  it('returns the Model it was given when the press asks for what it already is', () => {
    const open = Disclosure.init({ isOpen: true })
    expect(Disclosure.update(open, Disclosure.Message.Toggled({ isOpen: true })).model).toBe(open)
  })
})

describe('Disclosure.configure', () => {
  const App = Disclosure.configure({ base: { peek: '2em' }, presets: { plain: { peek: '0px' } } })

  it('binds a peek once, and a call or a preset overrides it', () => {
    const options = {
      id: 'details',
      isOpen: false,
      onToggle: () => message('Clicked'),
      label: 'More',
      content: 'Text',
      style,
    }
    expect(JSON.stringify(App.view(options, h))).toContain('2em')
    expect(JSON.stringify(App.view({ ...options, preset: 'plain' }, h))).not.toContain('2em')
  })

  it('refuses a preset it does not have', () => {
    expect(() =>
      App.view(
        {
          id: 'd',
          isOpen: false,
          onToggle: () => message('Clicked'),
          label: 'x',
          content: 'y',
          // A name computed at run time, past the types.
          preset: JSON.parse('"nope"'),
        },
        h,
      ),
    ).toThrow(/no preset named/)
  })
})

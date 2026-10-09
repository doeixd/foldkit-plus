import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { Message, Roving, TOOLS, initial, update, type Model } from '../src/toolbar/app.js'
import { Toolbar, ToolbarSlots, describeTools } from '../src/toolbar/view.js'
import { runDemo } from '../src/toolbar/demo.js'

const pressed = (model: Model, id: string): Model =>
  update(model, Message.PressedTool({ id })).model

/** The drawn node's click handler, if the view wired one. */
const clickOf = (node: unknown): unknown =>
  (node as { readonly data?: { readonly on?: { readonly click?: unknown } } })?.data?.on?.click

describe('update flows', () => {
  it('starts with no tab stop and nothing pressed', () => {
    expect(initial.model.toolbarFocus.current).toBe(null)
    expect(initial.model.active).toEqual(Option.none())
  })

  it('pressing a tool presses it', () => {
    expect(pressed(initial.model, 'bold').active).toEqual(Option.some('bold'))
  })

  it('focus moves through the placement', () => {
    const focused = update(
      initial.model,
      Roving.wrapper.make(RovingTabindex.Message.Focused({ id: 'italic' })),
    ).model
    expect(focused.toolbarFocus.current).toBe('italic')
    expect(focused.active).toEqual(Option.none())
  })
})

describe('view structure', () => {
  it('draws one button per tool with pressed state', () => {
    const bar = Inert.draw(Toolbar, pressed(initial.model, 'italic'))
    expect(Inert.byRole(bar, 'toolbar')).toHaveLength(1)
    const buttons = Inert.byTag(bar, 'button')
    expect(buttons).toHaveLength(TOOLS.length)
    expect(Inert.value(buttons[1], 'aria-pressed')).toBe('true')
    expect(Inert.value(buttons[0], 'aria-pressed')).toBe('false')
  })

  it('marks the disabled tool without a click', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(ToolbarSlots, Toolbar.mixins, {
      input: initial.model,
      h,
    })
    const items = describeTools()
    const strike = builders.tool.attrs([], items.slotItem(2))
    expect(Attributes.find(strike, 'AriaDisabled')?.value).toBe(true)
    expect(Attributes.find(strike, 'OnClick')).toBeUndefined()
  })

  it('enabled tools are clickable and the disabled one is not', () => {
    const bar = Inert.draw(Toolbar, initial.model)
    expect(typeof clickOf(Inert.byLabel(bar, 'Bold')[0])).toBe('function')
    const strike = Inert.byLabel(bar, 'Strikethrough')[0]
    expect(clickOf(strike)).toBeUndefined()
    expect(Inert.value(strike, 'aria-disabled')).toBe('true')
    expect(Inert.value(strike, 'title')).toBe('Unavailable with plain text selected')
  })
})

describe('demo', () => {
  it('traces start, focus, and press', () => {
    expect(runDemo()).toEqual([
      'start: current=null active=none',
      'focused italic: current=italic active=none',
      'pressed italic: current=italic active=italic',
    ])
  })
})

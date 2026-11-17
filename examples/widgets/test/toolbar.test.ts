import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { Message, Roving, TOOLS, initial, update, type Model } from '../src/toolbar/app.js'
import { Toolbar } from '../src/toolbar/view.js'
import { runDemo } from '../src/toolbar/demo.js'

const pressed = (model: Model, id: string): Model =>
  update(model, Message.PressedTool({ id })).model

/** The drawn node's click handler, if the view wired one. */
const clickOf = (node: Html | undefined): unknown => node?.data?.on?.click

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
  it('draws one button per tool with pressed state, inside one toolbar', () => {
    const bar = Inert.draw(Toolbar, pressed(initial.model, 'italic'))
    expect(Inert.byRole(bar, 'toolbar')).toHaveLength(1)
    const buttons = Inert.byTag(bar, 'button')
    expect(buttons).toHaveLength(TOOLS.length)
    expect(Inert.value(buttons[1], 'aria-pressed')).toBe('true')
    expect(Inert.value(buttons[0], 'aria-pressed')).toBe('false')
  })

  it('gives the tab stop to the first tool until focus moves it', () => {
    const tabindexes = (model: Model) =>
      Inert.byTag(Inert.draw(Toolbar, model), 'button').map(button =>
        Inert.value(button, 'tabindex'),
      )
    expect(tabindexes(initial.model)).toEqual([0, -1, -1, -1])
    const focused = update(
      initial.model,
      Roving.wrapper.make(RovingTabindex.Message.Focused({ id: 'link' })),
    ).model
    expect(tabindexes(focused)).toEqual([-1, -1, -1, 0])
  })

  it('enabled tools are clickable and the disabled one says why it is not', () => {
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

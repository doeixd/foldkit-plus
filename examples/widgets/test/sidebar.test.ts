import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, initial, update } from '../src/sidebar/app.js'
import { Sidebar, runDemo } from '../src/sidebar/view.js'

describe('update flows', () => {
  it('starts with guides open and the rail out', () => {
    expect(initial.open).toBe('guides')
    expect(initial.collapsed).toBe(false)
  })

  it('opens one section at a time', () => {
    expect(update(initial, Message.ToggledSection({ id: 'api' })).model.open).toBe('api')
    expect(update(initial, Message.ToggledSection({ id: 'guides' })).model.open).toBe(null)
  })

  it('collapsing hides the rail, not the way back', () => {
    expect(update(initial, Message.ToggledCollapse({})).model.collapsed).toBe(true)
  })
})

describe('view structure', () => {
  it('draws the toggle naming the navigation and the open section’s links', () => {
    const page = Inert.draw(Sidebar, initial)
    expect(Inert.byTag(page, 'nav')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(page, 'nav')[0], 'aria-label')).toBe('Docs')
    expect(Inert.byTag(page, 'a')).toHaveLength(2)
    expect(Inert.value(Inert.byTag(page, 'a')[0], 'href')).toBe('#install')
    expect(Inert.text(page)).toContain('Install')
    expect(Inert.text(page)).not.toContain('Components')
  })

  it('collapsed, only the toggle draws', () => {
    const page = Inert.draw(Sidebar, { ...initial, collapsed: true })
    expect(Inert.byTag(page, 'button').map(button => Inert.text(button))).toEqual(['Expand'])
    expect(Inert.byTag(page, 'nav')).toHaveLength(0)
  })
})

describe('demo', () => {
  it('traces opening and collapsing', () => {
    expect(runDemo()).toEqual([
      'start: open=guides collapsed=false',
      'opened api: open=api',
      'collapsed: collapsed=true',
    ])
  })
})

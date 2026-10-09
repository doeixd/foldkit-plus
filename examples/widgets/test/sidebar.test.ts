import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, NAV_ID, contentId, initial, update } from '../src/sidebar/app.js'
import { Sidebar, runDemo } from '../src/sidebar/view.js'

const panel = (root: ReturnType<typeof Inert.draw>, id: string) => {
  const node = Inert.byTag(root, 'ul').find(each => Inert.value(each, 'id') === contentId(id))
  if (node === undefined) throw new Error(`no panel ${id}`)
  return node
}

describe('update flows', () => {
  it('starts with guides open and the rail out', () => {
    expect(initial.open).toEqual(Option.some('guides'))
    expect(initial.collapsed).toBe(false)
  })

  it('opens one section at a time', () => {
    expect(update(initial, Message.ToggledSection({ id: 'api' })).model.open).toEqual(
      Option.some('api'),
    )
    expect(update(initial, Message.ToggledSection({ id: 'guides' })).model.open).toEqual(
      Option.none(),
    )
  })

  it('collapsing hides the rail, not the way back', () => {
    expect(update(initial, Message.ToggledCollapse({})).model.collapsed).toBe(true)
  })
})

describe('view structure', () => {
  it('draws the toggle naming the navigation and the open section’s links', () => {
    const page = Inert.draw(Sidebar, initial)
    const nav = Inert.byTag(page, 'nav')[0]
    expect(Inert.byTag(page, 'nav')).toHaveLength(1)
    expect(Inert.value(nav, 'id')).toBe(NAV_ID)
    expect(Inert.value(nav, 'aria-label')).toBe('Docs')
    expect(Inert.value(Inert.byLabel(page, 'Collapse')[0], 'aria-controls')).toBe(NAV_ID)
    expect(Inert.value(panel(page, 'guides'), 'hidden')).toBe(false)
    expect(Inert.value(panel(page, 'api'), 'hidden')).toBe(true)
    expect(Inert.value(Inert.byTag(panel(page, 'guides'), 'a')[0], 'href')).toBe('#install')
    expect(Inert.text(panel(page, 'api'))).toContain('Components')
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

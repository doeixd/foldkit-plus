/**
 * Sidebar as markup: a named navigation landmark whose toggle names it and
 * says whether it shows, sections that name their links, a shut section's
 * links and a collapsed navigation kept but inert, and the current page
 * marked.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, Sidebar, SidebarSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(SidebarSlots)(Recipes.Sidebar({}))
const drawn = (collapsed: boolean) =>
  Sidebar.view(
    {
      id: 'side',
      label: 'Workspace',
      sections: [
        {
          id: 'main',
          title: 'Main',
          links: [
            { label: 'Inbox', href: '#inbox', current: true },
            { label: 'Projects', href: '#projects' },
          ],
        },
        { id: 'more', title: 'More', links: [{ label: 'Billing', href: '#billing' }] },
      ],
      open: ['main'],
      onToggleSection: () => message('Other'),
      collapsed,
      onToggleCollapsed: message('Clicked'),
      style,
    },
    h,
  )

describe('Sidebar.view', () => {
  it('meets the sidebar pattern', () => {
    expect(A11y.validate(Patterns.Sidebar, SidebarSlots)).toEqual([])
  })

  it('names its landmark, and its toggle names it and says whether it shows', () => {
    const [nav] = Inert.byTag(drawn(false), 'nav')
    const [toggle] = Inert.byTag(drawn(false), 'button')
    expect(Inert.value(nav, 'aria-label')).toBe('Workspace')
    expect(Inert.value(toggle, 'aria-controls')).toBe(Inert.value(nav, 'id'))
    expect(Inert.value(toggle, 'aria-expanded')).toBe('true')
    const [collapsedNav] = Inert.byTag(drawn(true), 'nav')
    expect(Inert.value(collapsedNav, 'inert')).toBe('')
  })

  it("keeps a shut section's links but out of reach, and marks the current page", () => {
    const lists = Inert.byTag(drawn(false), 'ul')
    expect(Inert.value(lists[0], 'inert')).toBeUndefined()
    expect(Inert.value(lists[1], 'inert')).toBe('')
    const links = Inert.byTag(drawn(false), 'a')
    expect(links.map(link => Inert.value(link, 'aria-current'))).toEqual([
      'page',
      undefined,
      undefined,
    ])
  })

  it('flips a section open or shut, several open at once', () => {
    expect(Sidebar.toggled(['main'], 'more')).toEqual(['main', 'more'])
    expect(Sidebar.toggled(['main', 'more'], 'main')).toEqual(['more'])
  })
})

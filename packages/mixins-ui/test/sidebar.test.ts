/**
 * Sidebar as markup and as a Model: a named navigation landmark whose toggle
 * names it and says whether it shows; groups whose headings name their rows,
 * or stand as labels; branches that show and hide the links under them; a
 * shut group's rows and a collapsed navigation kept but inert, except a
 * rail's, whose icons are the navigation; the current page marked; and an
 * `update` that opens, shuts, collapses and opens the phone's Sheet.
 */
import { describe, expect, it } from 'vitest'
import { modifyFields } from 'foldkit/struct'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import * as Patterns from '../src/patterns.js'
import * as Sheet from '../src/sheet.js'
import * as Sidebar from '../src/sidebar.js'
import { SidebarSlots } from '../src/sidebar.js'
import { Sidebar as SidebarRecipe } from '../src/recipes/sidebar.js'

const style = Style.forSlots(SidebarSlots)(SidebarRecipe({}))
const h = SlotView.inertBuilder<Sidebar.Message>()

const groups: ReadonlyArray<Sidebar.SidebarGroup> = [
  {
    id: 'main',
    rows: [
      { id: 'inbox', label: 'Inbox', href: '#inbox', current: true, badge: '12' },
      {
        id: 'projects',
        label: 'Projects',
        icon: h.span([], ['P']),
        items: [{ label: 'Website', href: '#website' }],
      },
    ],
  },
  { id: 'more', title: 'More', rows: [{ id: 'billing', label: 'Billing', href: '#billing' }] },
  {
    id: 'fixed',
    title: 'Fixed',
    collapsible: false,
    rows: [{ id: 'help', label: 'Help', href: '#help' }],
  },
]

const model = Sidebar.init({
  id: 'side',
  rows: ['inbox', 'projects', 'billing', 'help'],
  open: ['main'],
})

const drawn = (
  state: Sidebar.Model = model,
  extra: Partial<Sidebar.SidebarView<Sidebar.Message>> = {},
  builder: HtmlBuilder<Sidebar.Message> = h,
) =>
  Sidebar.view(
    { model: state, onMessage: message => message, label: 'Workspace', groups, style, ...extra },
    builder,
  )

const collapsed = modifyFields(model, { collapsed: () => true })
const byLabel = (html: ReturnType<typeof drawn>, label: string) => Inert.byLabel(html, label)[0]

describe('Sidebar.view', () => {
  it('meets the sidebar pattern', () => {
    expect(A11y.validate(Patterns.Sidebar, SidebarSlots)).toEqual([])
  })

  it('names its landmark, and its toggle names it and says whether it shows', () => {
    const [nav] = Inert.byTag(drawn(), 'nav')
    const toggle = byLabel(drawn(), 'Hide Workspace')
    expect(Inert.value(nav, 'aria-label')).toBe('Workspace')
    expect(Inert.value(toggle, 'aria-controls')).toBe(Inert.value(nav, 'id'))
    expect(Inert.value(toggle, 'aria-expanded')).toBe('true')
    expect(Inert.value(nav, 'inert')).toBeUndefined()
    const [shut] = Inert.byTag(drawn(collapsed), 'nav')
    expect(Inert.value(shut, 'inert')).toBe('')
    expect(Inert.value(byLabel(drawn(collapsed), 'Show Workspace'), 'aria-expanded')).toBe('false')
  })

  it('keeps a collapsed rail in reach, its rows named by their words', () =>
    // A rail's rows are Tooltips' triggers, drawn in a runtime's frame.
    Scene.scene<Sidebar.Model, Sidebar.Message>(
      {
        update: Sidebar.update,
        view: (state, builder) => drawn(state, { collapse: 'icons' }, builder),
      },
      Scene.given(collapsed),
      Scene.tap(({ html }) => {
        const [nav] = Inert.byTag(html, 'nav')
        expect(Inert.value(nav, 'inert')).toBeUndefined()
        const inbox = Inert.byTag(html, 'a').find(link => Inert.value(link, 'href') === '#inbox')
        expect(Inert.text(inbox)).toBe('Inbox12')
        expect(Inert.value(inbox, 'id')).toBe('side-tip-inbox-trigger')
      }),
    ))

  it('has a heading button say whether its group is open and name its rows', () => {
    const drawing = drawn()
    const more = Inert.byTag(drawing, 'button').find(button => Inert.text(button) === 'More')
    const list = Inert.byTag(drawing, 'ul').find(
      each => Inert.value(each, 'id') === Inert.value(more, 'aria-controls'),
    )
    expect(Inert.value(more, 'aria-expanded')).toBe('false')
    expect(Inert.value(list, 'inert')).toBe('')
  })

  it('draws an untitled group with no heading, and a fixed one with a label for its rows', () => {
    const drawing = drawn()
    const buttons = Inert.byTag(drawing, 'button').map(button => Inert.text(button))
    expect(buttons).not.toContain('Fixed')
    const fixed = Inert.byTag(drawing, 'ul').find(each =>
      Inert.byTag(each, 'a').some(link => Inert.text(link) === 'Help'),
    )
    expect(Inert.value(fixed, 'inert')).toBeUndefined()
    expect(Inert.value(fixed, 'aria-labelledby')).toBe('side-fixed-links-heading')
  })

  it('has a branch show and hide the links under it', () => {
    const branch = (state: Sidebar.Model) =>
      Inert.byTag(drawn(state), 'button').find(button => Inert.text(button).startsWith('P'))
    expect(Inert.value(branch(model), 'aria-expanded')).toBe('false')
    const opened = modifyFields(model, { open: () => ['main', 'projects'] })
    expect(Inert.value(branch(opened), 'aria-expanded')).toBe('true')
    const nested = Inert.byTag(drawn(opened), 'ul').find(
      each => Inert.value(each, 'id') === Inert.value(branch(opened), 'aria-controls'),
    )
    expect(Inert.value(nested, 'inert')).toBeUndefined()
    expect(Inert.value(nested, 'data-nested')).toBe('')
  })

  it('marks the current page, and hides icons from assistive technology', () => {
    const links = Inert.byTag(drawn(), 'a')
    expect(links.map(link => Inert.value(link, 'aria-current'))).toEqual([
      'page',
      undefined,
      undefined,
      undefined,
    ])
    expect(Inert.text(links[0])).toBe('Inbox12')
    const [icon] = Inert.byTag(
      Inert.byTag(drawn(), 'button').find(button => Inert.text(button).startsWith('P')),
      'span',
    )
    expect(Inert.value(icon, 'aria-hidden')).toBe('true')
  })

  it('draws the opener and the Sheet only when given a Sheet style', () => {
    expect(byLabel(drawn(), 'Open Workspace')).toBeUndefined()
    expect(Inert.byTag(drawn(), 'dialog')).toEqual([])
  })
})

describe('Sidebar.update', () => {
  const step = (state: Sidebar.Model, message: Sidebar.Message) =>
    Sidebar.update(state, message).model

  it('flips a group or branch open or shut, several open at once', () => {
    expect(step(model, Sidebar.Message.ToggledSection({ id: 'more' })).open).toEqual([
      'main',
      'more',
    ])
    expect(step(model, Sidebar.Message.ToggledSection({ id: 'main' })).open).toEqual([])
  })

  it('collapses and expands', () => {
    expect(step(model, Sidebar.Message.ToggledCollapsed()).collapsed).toBe(true)
    expect(step(collapsed, Sidebar.Message.ToggledCollapsed()).collapsed).toBe(false)
  })

  it('expands to a branch pressed in a rail, open once', () => {
    const expanded = step(collapsed, Sidebar.Message.ExpandedTo({ id: 'projects' }))
    expect(expanded.collapsed).toBe(false)
    expect(expanded.open).toEqual(['main', 'projects'])
    expect(step(expanded, Sidebar.Message.ExpandedTo({ id: 'projects' })).open).toEqual([
      'main',
      'projects',
    ])
  })

  it('gives each row named a Tooltip, and ignores one it has none for', () => {
    expect(model.tips.map(tip => tip.row)).toEqual(['inbox', 'projects', 'billing', 'help'])
    expect(
      step(model, Sidebar.Message.GotTip({ row: 'nowhere', message: { _tag: 'EnteredTrigger' } })),
    ).toBe(model)
  })

  it('opens the Sheet, and closes it when a link in it is followed', () => {
    const opened = step(model, Sidebar.Message.OpenedSheet())
    expect(Sheet.isOpen(opened.sheet)).toBe(true)
    expect(Sheet.isOpen(step(opened, Sidebar.Message.FollowedInSheet()).sheet)).toBe(false)
  })
})

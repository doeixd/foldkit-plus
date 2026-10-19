/**
 * Sidebar as markup and as a Model: a named navigation landmark whose toggle
 * names it and says whether it shows; groups whose headings name their rows,
 * or stand as labels; branches that show and hide the links under them; a
 * shut group's rows and a collapsed navigation kept but inert, except a
 * rail's, whose icons are the navigation; the current page marked; a
 * resizable column's handle, a separator with its width; and an `update`
 * that opens, shuts, collapses, opens the phone's Sheet, and resizes,
 * collapsing a column dragged below half its least width.
 */
import { Option } from 'effect'
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
const resizable = Sidebar.init({ id: 'side', rows: [], width: {} })
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

  it("draws a link's action beside it, not in it, and a group's only under a heading", () => {
    const act = (label: string) => ({
      label,
      icon: h.span([], ['+']),
      message: Sidebar.Message.ToggledCollapsed(),
    })
    const drawing = drawn(model, {
      groups: [
        {
          id: 'loose',
          action: act('Untitled'),
          rows: [{ id: 'a', label: 'A', href: '#a', action: act('More for A') }],
        },
        { id: 'named', title: 'Named', action: act('Add'), rows: [] },
      ],
    })
    const more = byLabel(drawing, 'More for A')
    expect(Inert.byTag(Inert.byTag(drawing, 'a')[0], 'button')).toEqual([])
    const [item] = Inert.byTag(drawing, 'li')
    expect(Inert.value(item, 'data-action')).toBe('row')
    expect(Inert.byTag(item, 'button')).toEqual([more])
    expect(byLabel(drawing, 'Untitled')).toBeUndefined()
    const sections = Inert.byTag(drawing, 'div').filter(
      each => Inert.value(each, 'data-state') !== undefined,
    )
    expect(sections.map(each => Inert.value(each, 'data-action'))).toEqual([undefined, 'heading'])
    expect(byLabel(drawing, 'Add')).toBeDefined()
  })

  it('draws a resize handle only for a resizable column, a separator with its width', () => {
    expect(byLabel(drawn(), 'Resize Workspace')).toBeUndefined()
    const handle = byLabel(drawn(resizable), 'Resize Workspace')
    expect(Inert.value(handle, 'role')).toBe('separator')
    expect(Inert.value(handle, 'aria-controls')).toBe('side-nav')
    expect(Inert.value(handle, 'aria-valuenow')).toBe('240')
    expect(Inert.value(handle, 'aria-valuemax')).toBe('384')
    const shut = modifyFields(resizable, { collapsed: () => true })
    expect(Inert.value(byLabel(drawn(shut), 'Resize Workspace'), 'aria-valuenow')).toBe('0')
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

  describe('a resizable column', () => {
    const narrow = Sidebar.init({ id: 'side', rows: [], width: { size: 300, min: 200, max: 400 } })
    const sizeOf = (state: Sidebar.Model) => Option.map(state.width, width => width.size)
    const dragged = (state: Sidebar.Model, from: number, ...deltas: ReadonlyArray<number>) =>
      deltas.reduce(
        (each, delta) => step(each, Sidebar.Message.Resized({ delta })),
        step(state, Sidebar.Message.ResizeStarted({ from })),
      )

    it('starts within its bounds', () => {
      expect(model.width).toEqual(Option.none())
      expect(resizable.width).toEqual(Option.some({ size: 240, min: 192, max: 384 }))
      const wide = Sidebar.init({ id: 'side', rows: [], width: { size: 999, max: 320 } })
      expect(sizeOf(wide)).toEqual(Option.some(320))
    })

    it('follows a drag from the width it showed at the press, within the bounds', () => {
      expect(sizeOf(dragged(narrow, 300, 40))).toEqual(Option.some(340))
      expect(sizeOf(dragged(narrow, 300, 400))).toEqual(Option.some(400))
      expect(sizeOf(dragged(narrow, 300, -150))).toEqual(Option.some(200))
    })

    it('collapses below half its least width, keeping the width the drag began at', () => {
      const snapped = dragged(narrow, 300, -60, -201)
      expect(snapped.collapsed).toBe(true)
      expect(sizeOf(snapped)).toEqual(Option.some(300))
      // The toggle brings that width back.
      const back = step(
        step(snapped, Sidebar.Message.ResizeEnded()),
        Sidebar.Message.ToggledCollapsed(),
      )
      expect(back.collapsed).toBe(false)
      expect(sizeOf(back)).toEqual(Option.some(300))
    })

    it('expands when dragged out of its collapse', () => {
      const shut = modifyFields(narrow, { collapsed: () => true })
      expect(dragged(shut, 36, 50).collapsed).toBe(true)
      const out = dragged(shut, 36, 260)
      expect(out.collapsed).toBe(false)
      expect(sizeOf(out)).toEqual(Option.some(296))
    })

    it('ends a drag, and ignores moves outside one', () => {
      const ended = step(dragged(narrow, 300, 40), Sidebar.Message.ResizeEnded())
      expect(ended.drag).toEqual(Option.none())
      expect(step(ended, Sidebar.Message.Resized({ delta: 50 }))).toBe(ended)
      expect(step(ended, Sidebar.Message.ResizeEnded())).toBe(ended)
    })

    it('takes a width from the keys within its bounds, expanding', () => {
      const shut = modifyFields(narrow, { collapsed: () => true })
      const set = step(shut, Sidebar.Message.SetWidth({ size: 999 }))
      expect(set.collapsed).toBe(false)
      expect(sizeOf(set)).toEqual(Option.some(400))
      expect(step(narrow, Sidebar.Message.SetWidth({ size: 300 }))).toBe(narrow)
    })

    it('ignores resizing when it is not resizable', () => {
      expect(dragged(model, 240, 40)).toBe(model)
      expect(step(model, Sidebar.Message.SetWidth({ size: 300 }))).toBe(model)
    })
  })

  it('opens the Sheet, and closes it when a link in it is followed', () => {
    const opened = step(model, Sidebar.Message.OpenedSheet())
    expect(Sheet.isOpen(opened.sheet)).toBe(true)
    expect(Sheet.isOpen(step(opened, Sidebar.Message.FollowedInSheet()).sheet)).toBe(false)
  })
})

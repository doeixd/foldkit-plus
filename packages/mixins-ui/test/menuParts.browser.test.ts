/**
 * A Menu row's icon and hint, on a real runtime: the icon leads the words and
 * is hidden from assistive technology, the hint stands at the row's end before
 * the shortcut, and both follow the reading direction, in a submenu's rows too.
 */
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Menu, MenuSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))

const Model = Schema.Struct({ menu: Menu.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: Menu.Message }
const got = (message: Menu.Message): Message => ({ _tag: 'Got', message })

const rowsOf = (h: HtmlBuilder<Message>): ReadonlyArray<Menu.Row> => [
  { value: 'plain', label: 'Plain' },
  {
    value: 'export',
    label: 'Export',
    icon: h.span([h.Id('export-icon')], ['E']),
    hint: 'Pro',
    shortcut: ['⌘', 'E'],
  },
  {
    value: 'share',
    label: 'Share',
    icon: h.span([], ['S']),
    hint: 'New',
    items: [
      { value: 'email', label: 'Email', icon: h.span([], ['@']), hint: '3' },
      { value: 'link', label: 'Link' },
    ],
  },
]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (direction: 'ltr' | 'rtl') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'parts'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { menu: Menu.init('parts', rowsOf(SlotView.inertBuilder<Message>())) },
      }),
      update: (model: Model, message: Message) => {
        const next = Menu.update(model.menu, message.message)
        return { model: { menu: next.model }, commands: mapMessages(next.commands, got) }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [
            h.Style({
              padding: '40px',
              ...(direction === 'rtl' ? { paddingInlineStart: '600px' } : {}),
            }),
          ],
          [
            Menu.view(
              {
                model: model.menu,
                rows: rowsOf(h),
                buttonContent: h.span([], ['Parts']),
                onMessage: got,
                direction,
                mixins: [style.mixin],
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const byId = (id: string) => document.getElementById(id)
const row = (index: number) => byId(`parts-item-${index}`)!
/** The row's content, a box whose children are its parts in drawing order. */
const partsOf = (element: Element) => Array.from(element.firstElementChild?.children ?? [])
const words = (element: Element | undefined) => element?.textContent
const open = async () => {
  const trigger = await vi.waitFor(() => {
    const found = byId('parts-button')
    expect(found).not.toBeNull()
    return found!
  })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('parts-items'))
}

test.each(['ltr', 'rtl'] as const)(
  '%s: the icon leads the words, hidden from assistive technology, and the hint ends the row before the shortcut',
  async direction => {
    const handle = mount(direction)
    try {
      await open()
      expect(partsOf(row(0)).map(words)).toEqual(['Plain'])
      const [icon, label, hint, shortcut] = partsOf(row(1))
      expect([icon, label, hint].map(words)).toEqual(['E', 'Export', 'Pro'])
      expect(icon?.getAttribute('aria-hidden')).toBe('true')
      expect(hint?.getAttribute('aria-hidden')).toBeNull()
      expect(shortcut?.getAttribute('aria-hidden')).toBe('true')
      const box = (element: Element | undefined) => element!.getBoundingClientRect()
      // Start to end: logical, so the order holds either way round.
      const flow = direction === 'ltr' ? 1 : -1
      const before = (a: Element | undefined, b: Element | undefined) =>
        flow * (box(b).left - box(a).left) > 0
      expect(before(icon, label)).toBe(true)
      expect(before(label, hint)).toBe(true)
      expect(before(hint, shortcut)).toBe(true)
      // The row's gap spaces the icon from the words; the hint keeps more, as the shortcut does.
      const gap = (from: Element | undefined, to: Element | undefined) =>
        direction === 'ltr' ? box(to).left - box(from).right : box(from).left - box(to).right
      expect(gap(icon, label)).toBeGreaterThan(2)
      expect(gap(label, hint)).toBeGreaterThan(gap(icon, label) + 4)
    } finally {
      handle.dispose()
    }
  },
)

test("a submenu's row and its items carry the same parts", async () => {
  const handle = mount('ltr')
  try {
    await open()
    expect(partsOf(row(2)).slice(0, 3).map(words)).toEqual(['S', 'Share', 'New'])
    // One key at a time: upstream's Menu reads the next row from the last drawn frame.
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(row(1).hasAttribute('data-active')).toBe(true))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(row(2).hasAttribute('data-active')).toBe(true))
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(byId('parts-sub-2-items')).not.toBeNull())
    const item = (index: number) => byId(`parts-sub-2-item-${index}`)!
    expect(partsOf(item(0)).map(words)).toEqual(['@', 'Email', '3'])
    expect(partsOf(item(1)).map(words)).toEqual(['Link'])
  } finally {
    handle.dispose()
  }
})

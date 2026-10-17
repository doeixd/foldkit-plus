/**
 * A menubar in a real browser: right to left, its menus run from the right,
 * ArrowLeft moves the tab stop toward the inline end and ArrowRight moves it
 * back. Animated, a menu's panel stays drawn while it leaves, marked for the
 * recipe's fade.
 */
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Menubar, MenubarSlots, MenuSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const barStyle = Style.forSlots(MenubarSlots)(Recipes.Menubar({}))
const menuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const Model = Schema.Struct({ bar: Menubar.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: Menubar.Message }
const got = (message: Menubar.Message): Message => ({ _tag: 'Got', message })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (isAnimated = false) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    barStyle.css +
    menuStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'menubar-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    // No `dir` of the page's: the bar draws its own from `direction`.
    h.div(
      [],
      [
        Menubar.view(
          {
            label: 'Editor',
            model: model.bar,
            menus: [
              { label: 'File', rows: [{ label: 'New' }] },
              { label: 'Edit', rows: [{ label: 'Copy' }] },
              { label: 'View', rows: [{ label: 'Zoom' }] },
            ],
            onMessage: got,
            direction: 'rtl',
            style: barStyle,
            menuMixins: [menuStyle.mixin],
          },
          h,
        ),
        // Where the pointer is put, well below the bar and its menus: every test
        // file shares the pointer, and one resting on a trigger switches an
        // open menu to its own.
        h.div([h.Id('away'), h.Style({ height: '40px', marginBlockStart: '300px' })], []),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { bar: Menubar.init(['file', 'edit', 'view'], { isAnimated }) } }),
      update: (model: Model, message: Message) => {
        const next = Menubar.update(model.bar, message.message)
        return {
          model: { bar: next.model },
          commands: mapMessages(next.commands, got),
        }
      },
      view,
    }),
  )
}

test('right to left, ArrowLeft moves toward the end and ArrowRight moves back', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('file-button')).not.toBeNull())
    // The menus run right to left, so ArrowLeft moves the way the bar reads.
    const file = document.getElementById('file-button')!.getBoundingClientRect()
    const edit = document.getElementById('edit-button')!.getBoundingClientRect()
    expect(edit.right).toBeLessThanOrEqual(file.left + 1)
    document.getElementById('file-button')!.focus()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('edit-button'))
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('file-button'))
  } finally {
    handle.dispose()
  }
})

test("an animated bar's menu stays drawn while it leaves, marked for its fade", async () => {
  const handle = mount(true)
  try {
    const trigger = await vi.waitFor(() => {
      const found = document.getElementById('file-button')
      expect(found).not.toBeNull()
      return found!
    })
    await userEvent.hover(document.getElementById('away')!)
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const panel = await vi.waitFor(() => {
      const found = document.getElementById('file-items')
      expect(document.activeElement).toBe(found)
      return found!
    })
    const states: Array<string> = []
    const observer = new MutationObserver(() =>
      states.push(['closed', 'leave'].filter(mark => panel.hasAttribute(`data-${mark}`)).join(' ')),
    )
    observer.observe(panel, { attributes: true })
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.getElementById('file-items')).toBeNull())
    observer.disconnect()
    expect(states).toContain('closed leave')
  } finally {
    handle.dispose()
  }
})

/**
 * An alert at a phone's width, on a real page: a title, a description, an
 * action and a dismiss button stay inside the alert, which does not run the
 * page sideways, and the dismiss button sits at the inline end.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { Alert, AlertSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(AlertSlots)(Recipes.Alert({}))
const Model = Schema.Struct({})
const Message = defineMessageUnion({ Dismissed: {} })
type Message = typeof Message.Type

afterEach(async () => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.body.removeAttribute('dir')
  await page.viewport(1440, 900)
})

const mount = (layout: 'inline' | 'banner') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'alert-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _message: Message) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<Message>) => {
        const content = {
          title: 'Your trial ends in three days',
          description:
            'Add a payment method before Friday to keep every project, member and saved view you have set up.',
          actions: [{ label: 'Add payment method', href: '#billing' }],
          onDismiss: Message.Dismissed(),
          style,
        }
        return layout === 'inline'
          ? Alert.view({ layout, ...content }, h)
          : Alert.view({ layout, label: 'Announcement', ...content }, h)
      },
    }),
  )
}

const rectOf = (element: Element) => element.getBoundingClientRect()

test.each([
  ['inline', 'ltr'],
  ['inline', 'rtl'],
  ['banner', 'ltr'],
  ['banner', 'rtl'],
] as const)(
  'at 390px a %s alert holds its words, action and dismiss button, %s',
  async (layout, direction) => {
    await page.viewport(390, 800)
    document.body.dir = direction
    const handle = mount(layout)
    try {
      await vi.waitFor(() => expect(document.querySelector('[data-layout]')).not.toBeNull())
      const root = document.querySelector<HTMLElement>('[data-layout]')!
      const dismiss = root.querySelector<HTMLElement>('button[aria-label^="Dismiss"]')!
      const action = root.querySelector<HTMLElement>('a')!
      expect(dismiss).not.toBeNull()
      expect(action).not.toBeNull()
      // Neither the alert nor the page runs sideways.
      expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      )
      const box = rectOf(root)
      expect(box.width).toBeLessThanOrEqual(390)
      for (const child of root.querySelectorAll('*')) {
        const each = rectOf(child)
        if (each.width === 0) continue
        expect(each.right, `${child.tagName} right`).toBeLessThanOrEqual(box.right + 0.5)
        expect(each.left, `${child.tagName} left`).toBeGreaterThanOrEqual(box.left - 0.5)
      }
      // The dismiss button is at the inline end: past the middle, toward that edge,
      // and beyond the action's far edge in the reading direction.
      const mark = rectOf(dismiss)
      const middle = (box.left + box.right) / 2
      if (direction === 'ltr') {
        expect(mark.left).toBeGreaterThan(middle)
        expect(box.right - mark.right).toBeLessThan(box.width / 4)
      } else {
        expect(mark.right).toBeLessThan(middle)
        expect(mark.left - box.left).toBeLessThan(box.width / 4)
      }
    } finally {
      handle.dispose()
    }
  },
)

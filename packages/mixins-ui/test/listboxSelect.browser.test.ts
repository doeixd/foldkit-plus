/// <reference types="@vitest/browser-playwright" />
/**
 * The custom select over Listbox, in a real browser: the trigger reads the
 * placeholder muted and its chevron turns while open; an option's check
 * shows on the chosen row alone, at the row's end, or its start with
 * `check: 'start'`, the reading direction deciding which side that is; the
 * panel opens in the top layer, at least as wide as its trigger.
 */
import { Option } from 'effect'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const Fruits = ListboxView.create<string>()
type Model = typeof UpstreamListbox.Model.Type
type Message = UpstreamListbox.Message
const fruits = ['Apple', 'Banana', 'Cherry']
let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (options: {
  readonly check: 'start' | 'end'
  readonly direction: 'ltr' | 'rtl'
  readonly chosen: Option.Option<string>
  readonly trigger?: 'outline' | 'filled' | 'ghost'
}) => {
  const style = Style.forSlots(ListboxSlots)(
    Recipes.Listbox({
      check: options.check,
      width: 'trigger',
      trigger: options.trigger ?? 'outline',
    }),
  )
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
  container.id = 'listbox-select-browser'
  // A clipping box the panel must paint past: it is in the top layer.
  const box = document.createElement('div')
  box.style.overflow = 'hidden'
  box.style.blockSize = '4rem'
  box.style.inlineSize = '18rem'
  box.append(container)
  document.body.append(box)
  const view = (model: Model, h: HtmlBuilder<Message>) => {
    const part = Listbox.parts([style.mixin], { h })
    return Fruits.view(
      model,
      {
        anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
        direction: options.direction,
        items: fruits,
        maybeSelectedValue: options.chosen,
        itemToConfig: (fruit: string) => ({
          content: part.option({ label: fruit, description: `${fruit} from the orchard` }),
        }),
        buttonContent: part.trigger(
          Option.map(options.chosen, label => ({ label })),
          'Pick a fruit',
        ),
        toView: Listbox.toView([style.mixin], { h }),
      },
      h,
    )
  }
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: UpstreamListbox.Model,
      container,
      init: () => ({ model: UpstreamListbox.init({ id: 'fruit' }) }),
      update: (model: Model, message: Message) => {
        const next = Fruits.update(model, message)
        return { model: next.model, commands: next.commands ?? [] }
      },
      view,
    }),
  )
}

const button = () => document.getElementById('fruit-button')!
const open = async () => {
  await vi.waitFor(() => expect(document.getElementById('fruit-button')).not.toBeNull())
  button().focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(3))
}
const parts = (row: Element) => ({
  check: row.querySelector('[aria-hidden="true"]:last-child')!,
  label: row.querySelector('span > span > span')!,
})

test('the trigger reads the placeholder muted, and its chevron turns while open', async () => {
  mount({ check: 'end', direction: 'ltr', chosen: Option.none() })
  await vi.waitFor(() => expect(document.getElementById('fruit-button')).not.toBeNull())
  const text = button().querySelector('[data-placeholder]')!
  expect(text.textContent).toBe('Pick a fruit')
  expect(getComputedStyle(text).color).not.toBe(getComputedStyle(button()).color)
  const chevron = button().querySelector('span > [aria-hidden="true"]')!
  expect(getComputedStyle(chevron).rotate).toBe('45deg')
  await open()
  await vi.waitFor(() => expect(getComputedStyle(chevron).rotate).toBe('225deg'))
})

test.each([
  ['end', 'ltr', 'after'],
  ['start', 'ltr', 'before'],
  ['end', 'rtl', 'before'],
] as const)(
  'with check %s, %s, the chosen row alone shows its check, %s its label on screen',
  async (check, direction, side) => {
    mount({ check, direction, chosen: Option.some('Banana') })
    await open()
    const rows = [...document.querySelectorAll('[role="option"]')]
    expect(rows.map(row => getComputedStyle(parts(row).check).visibility)).toEqual([
      'hidden',
      'visible',
      'hidden',
    ])
    const chosen = parts(rows[1]!)
    const mark = chosen.check.getBoundingClientRect()
    const label = chosen.label.getBoundingClientRect()
    // "after" is to the right of the label on the screen, "before" to its left.
    if (side === 'after') expect(mark.left).toBeGreaterThan(label.right)
    else expect(mark.right).toBeLessThan(label.left)
  },
)

test('the panel paints past a clipping box, at least as wide as its trigger', async () => {
  mount({ check: 'end', direction: 'ltr', chosen: Option.none() })
  await open()
  const panel = document.getElementById('fruit-items')!
  expect(panel.matches(':popover-open')).toBe(true)
  const trigger = button().getBoundingClientRect()
  const rect = panel.getBoundingClientRect()
  expect(rect.width).toBeGreaterThanOrEqual(trigger.width - 0.5)
  const last = document.querySelectorAll('[role="option"]')[2]!.getBoundingClientRect()
  const hit = document.elementFromPoint(last.left + 4, last.top + last.height / 2)
  expect(hit?.closest('[role="option"]')?.textContent).toContain('Cherry')
})

test.each(['outline', 'filled', 'ghost'] as const)('a %s trigger draws its box', async trigger => {
  mount({ check: 'end', direction: 'ltr', chosen: Option.none(), trigger })
  await vi.waitFor(() => expect(document.getElementById('fruit-button')).not.toBeNull())
  const style = getComputedStyle(button())
  const probe = document.createElement('span')
  const root = getComputedStyle(document.documentElement)
  probe.style.color = root.getPropertyValue(
    trigger === 'filled' ? '--fk-surface-field' : '--fk-surface-base',
  )
  document.body.append(probe)
  const fills = {
    outline: getComputedStyle(probe).color,
    filled: getComputedStyle(probe).color,
    ghost: 'rgba(0, 0, 0, 0)',
  }
  expect(style.backgroundColor).toBe(fills[trigger])
  expect(style.borderTopColor === 'rgba(0, 0, 0, 0)').toBe(trigger !== 'outline')
})

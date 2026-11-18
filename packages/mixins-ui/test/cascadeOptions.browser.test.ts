/// <reference types="@vitest/browser-playwright" />
/**
 * What `CascadeSelect` gained, on a real page: a row's description stands
 * under its label and its trailing part at its end, the clear button stands
 * clear of the trigger's text, and an inline panel takes focus by Tab, is
 * walked and chosen from by the keys and stays open.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as CascadeSelect from '../src/cascadeSelect.js'
import { CascadeSelectSlots, type Config } from '../src/cascadeSelect.js'
import * as Recipes from '../src/recipes/cascadeSelect.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(CascadeSelectSlots)(Recipes.CascadeSelect({}))

const nodes = [
  {
    id: 'ca',
    label: 'Canada',
    children: [{ id: 'on', label: 'Ontario' }],
  },
  { id: 'mx', label: 'Mexico' },
]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (config: Config, value?: ReadonlyArray<string>) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'cascade-options'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: CascadeSelect.Model,
      container,
      init: () => ({
        model: CascadeSelect.init({
          id: 'place',
          inline: config.inline === true,
          ...(value === undefined ? {} : { value }),
        }),
      }),
      update: CascadeSelect.update(config),
      view: (model: CascadeSelect.Model, h: HtmlBuilder<CascadeSelect.Message>) =>
        h.div(
          [h.Style({ padding: '40px' })],
          [
            h.button([h.Id('before')], ['Before']),
            CascadeSelect.view(
              {
                model,
                config,
                onMessage: message => message,
                label: 'Place',
                clear: true,
                option: node =>
                  node.id === 'ca'
                    ? {
                        label: node.label,
                        description: 'North',
                        trailing: h.span([h.Id('after-mark')], ['CA']),
                      }
                    : { label: node.label },
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const tree = () => document.querySelector<HTMLElement>('[role="tree"]')

test('a row’s description stands under its label and its trailing part at its end', async () => {
  const mounted = mount({ nodes, inline: true })
  try {
    await vi.waitFor(() => expect(tree()).not.toBeNull())
    const row = document.getElementById('place-item-0')!
    const spans = [...row.querySelectorAll('span')]
    const label = spans.find(span => span.textContent === 'Canada')!
    const description = spans.find(span => span.textContent === 'North')!
    expect(description.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      label.getBoundingClientRect().bottom - 1,
    )
    const mark = document.getElementById('after-mark')!.getBoundingClientRect()
    const box = row.getBoundingClientRect()
    expect(mark.right).toBeLessThanOrEqual(box.right)
    expect(mark.left).toBeGreaterThan(box.left + box.width / 3)
  } finally {
    mounted.dispose()
  }
})

test('the clear button stands clear of the trigger, and empties the value', async () => {
  const mounted = mount({ nodes }, ['mx'])
  try {
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Clear"]')).not.toBeNull())
    const clear = document.querySelector<HTMLElement>('[aria-label="Clear"]')!
    const trigger = document.querySelector<HTMLElement>('[role="combobox"]')!
    expect(clear.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().right - 1,
    )
    for (const stroke of ['::before', '::after']) {
      expect(parseFloat(getComputedStyle(clear, stroke).width)).toBeGreaterThan(4)
    }
    await userEvent.click(clear)
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Clear"]')).toBeNull())
    expect(trigger.textContent).toContain('Select…')
  } finally {
    mounted.dispose()
  }
})

test('an inline panel takes focus by Tab, is walked and chosen from by the keys, and stays open', async () => {
  const mounted = mount({ nodes, inline: true })
  try {
    await vi.waitFor(() => expect(tree()).not.toBeNull())
    expect(document.querySelector('[role="combobox"]')).toBeNull()
    document.getElementById('before')!.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(tree())
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await vi.waitFor(() => expect(document.getElementById('place-item-1')).not.toBeNull())
    expect(document.getElementById('place-item-1')!.getAttribute('aria-selected')).toBe('true')
    expect(tree()).not.toBeNull()
  } finally {
    mounted.dispose()
  }
})

/**
 * A tree view on a real runtime: Tab reaches its one stop, the arrows move
 * focus over the rows showing and into an opened row, keys sent faster than
 * a frame all land, a click focuses and chooses a row, a row sits a step
 * further in per level, and a shut group takes no height.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, TreeView, TreeViewSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(TreeViewSlots)(Recipes.TreeView({}))

const FILES: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'components', label: 'components', children: [{ id: 'button', label: 'button.ts' }] },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    // Still, so a size is read where it ends rather than mid-flight.
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const before = document.createElement('button')
  before.textContent = 'Before'
  document.body.appendChild(before)
  const container = document.createElement('div')
  container.id = 'tree-view-browser'
  document.body.appendChild(container)
  const view = (model: TreeView.Model, h: HtmlBuilder<TreeView.Message>) =>
    h.div(
      [h.Style({ inlineSize: '20rem' })],
      [TreeView.view({ label: 'Files', model, nodes: FILES, onMessage: m => m, style }, h)],
    )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: TreeView.Model,
      container,
      init: () => ({ model: TreeView.init({ id: 'files' }) }),
      update: TreeView.update(FILES),
      view,
    }),
  )
  return { handle, before }
}

const item = (id: string) => document.getElementById(`files-item-${id}`)!
const row = (id: string) => item(id).firstElementChild!
const focusedId = () => document.activeElement?.id

test('Tab reaches the first row, and the arrows move focus and step into an opened row', async () => {
  const { handle, before } = mount()
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    before.focus()
    await userEvent.tab()
    expect(focusedId()).toBe('files-item-src')
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(focusedId()).toBe('files-item-readme'))
    await userEvent.keyboard('{ArrowUp}{ArrowRight}')
    await vi.waitFor(() => expect(item('src').getAttribute('aria-expanded')).toBe('true'))
    expect(focusedId()).toBe('files-item-src')
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('files-item-components'))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(before)
    await userEvent.tab()
    expect(focusedId()).toBe('files-item-components')
  } finally {
    handle.dispose()
  }
})

test('keys sent faster than a frame all land', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    item('src').focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}')
    await vi.waitFor(() => expect(focusedId()).toBe('files-item-button'))
  } finally {
    handle.dispose()
  }
})

test('a click focuses and chooses a row', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(item('readme')).not.toBeNull())
    await userEvent.click(row('readme'))
    await vi.waitFor(() => expect(item('readme').getAttribute('aria-selected')).toBe('true'))
    expect(focusedId()).toBe('files-item-readme')
    expect(item('readme').tabIndex).toBe(0)
    expect(item('src').tabIndex).toBe(-1)
  } finally {
    handle.dispose()
  }
})

test('a row sits further in per level, and a shut group takes no height', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    const group = item('src').querySelector('[role="group"]')!
    expect(group.getBoundingClientRect().height).toBe(0)
    await userEvent.click(row('src'))
    await vi.waitFor(() => expect(group.getBoundingClientRect().height).toBeGreaterThan(10))
    const start = (id: string) => row(id).querySelector('[aria-hidden="true"]')!.getBoundingClientRect().left
    expect(start('components')).toBeGreaterThan(start('src'))
    expect(start('components') - start('src')).toBeCloseTo(start('button') - start('components'), 1)
  } finally {
    handle.dispose()
  }
})

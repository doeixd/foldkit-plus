/**
 * A tree view on a real runtime: Tab reaches its one stop, the arrows move
 * focus over the rows showing and into an opened row, keys sent faster than
 * a frame all land, a click focuses and chooses a row, a row sits a step
 * further in per level, and a shut group takes no height; a press on a
 * row's box checks it and chooses nothing; and a guide line runs down an
 * open group under its row's chevron; and under `TreeView.fluid` one
 * highlight sits on the row the pointer or the keys reach, never on a row
 * in a shut group.
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

// Still by default, so a size is read where it ends rather than mid-flight.
const mount = (
  motion = '0',
  direction: 'ltr' | 'rtl' = 'ltr',
  more: {
    readonly checkable?: boolean
    readonly guides?: 'none' | 'lines'
    readonly fluid?: boolean
  } = {},
) => {
  const style = Style.forSlots(TreeViewSlots)(Recipes.TreeView({ guides: more.guides ?? 'none' }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    `:root{--fk-knob-motion:${motion}}`
  document.head.append(sheet)
  const before = document.createElement('button')
  before.textContent = 'Before'
  document.body.appendChild(before)
  const container = document.createElement('div')
  container.id = 'tree-view-browser'
  document.body.appendChild(container)
  const view = (model: TreeView.Model, h: HtmlBuilder<TreeView.Message>) =>
    h.div(
      // No `dir` here: the view draws its own `direction`.
      [h.Style({ inlineSize: '20rem' })],
      [
        TreeView.view(
          {
            label: 'Files',
            model,
            nodes: FILES,
            onMessage: m => m,
            direction,
            checkable: more.checkable,
            style,
            mixins: more.fluid === true ? TreeView.fluid : [],
          },
          h,
        ),
      ],
    )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: TreeView.Model,
      container,
      init: () => ({ model: TreeView.init({ id: 'files' }) }),
      update: TreeView.update(FILES, { checkable: more.checkable }),
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

test('right to left, ArrowLeft opens and ArrowRight shuts', async () => {
  const { handle } = mount('0', 'rtl')
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    // The row is drawn the way its keys read: its chevron at the right, pointing left.
    const [chevron, label] = Array.from(row('src').children)
    expect(chevron!.getBoundingClientRect().left).toBeGreaterThan(
      label!.getBoundingClientRect().left,
    )
    expect(getComputedStyle(chevron!).rotate).toBe('135deg')
    item('src').focus()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(item('src').getAttribute('aria-expanded')).toBe('true'))
    expect(focusedId()).toBe('files-item-src')
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(item('src').getAttribute('aria-expanded')).toBe('false'))
    expect(focusedId()).toBe('files-item-src')
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
    const start = (id: string) =>
      row(id).querySelector('[aria-hidden="true"]')!.getBoundingClientRect().left
    expect(start('components')).toBeGreaterThan(start('src'))
    expect(start('components') - start('src')).toBeCloseTo(start('button') - start('components'), 1)
  } finally {
    handle.dispose()
  }
})

test('while a group opens, its first row stays put under its parent row', async () => {
  const { handle } = mount('8')
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    const group = item('src').querySelector('[role="group"]')!
    const offsets: Array<number> = []
    const heights: Array<number> = []
    await userEvent.click(row('src'))
    const settled = await vi.waitFor(
      async () => {
        await new Promise(resolve => requestAnimationFrame(resolve))
        // From the parent row's top: a stretched parent row moves its own bottom with the child.
        offsets.push(
          row('components').getBoundingClientRect().top - row('src').getBoundingClientRect().top,
        )
        heights.push(group.getBoundingClientRect().height)
        expect(item('src').getAnimations({ subtree: false })).toHaveLength(0)
        expect(heights.length).toBeGreaterThan(3)
        return heights.at(-1)!
      },
      { timeout: 5000, interval: 0 },
    )
    // Mid-flight, so the samples cover the opening and not only its end.
    expect(heights.some(height => height > 0 && height < settled)).toBe(true)
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(0.5)
  } finally {
    handle.dispose()
  }
})

test('a press on the box of a row checks it and the rows beneath it, and chooses nothing', async () => {
  const { handle } = mount('0', 'ltr', { checkable: true })
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    const box = (id: string) => row(id).querySelector('[data-state]')!
    await userEvent.click(box('src'))
    await vi.waitFor(() => expect(item('src').getAttribute('aria-checked')).toBe('true'))
    expect(item('src').getAttribute('aria-selected')).toBe('false')
    expect(item('src').getAttribute('aria-expanded')).toBe('false')
    expect(item('button').getAttribute('aria-checked')).toBe('true')
    expect(getComputedStyle(box('src')).backgroundColor).toBe(
      getComputedStyle(box('src')).borderTopColor,
    )
    expect(getComputedStyle(box('readme')).backgroundColor).not.toBe(
      getComputedStyle(box('src')).backgroundColor,
    )
    // Space on the current row unchecks it, as the box did.
    item('src').focus()
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(item('src').getAttribute('aria-checked')).toBe('false'))
  } finally {
    handle.dispose()
  }
})

test('a guide line runs down an open group, under the chevron of its row', async () => {
  const { handle } = mount('0', 'ltr', { guides: 'lines' })
  try {
    await vi.waitFor(() => expect(item('src')).not.toBeNull())
    await userEvent.click(row('src'))
    const group = item('src').querySelector('[role="group"]')!
    await vi.waitFor(() => expect(group.getBoundingClientRect().height).toBeGreaterThan(10))
    const line = getComputedStyle(group, '::before')
    expect(line.content).toBe('""')
    const chevron = row('src').firstElementChild!.getBoundingClientRect()
    const left = group.getBoundingClientRect().left + parseFloat(line.left)
    expect(left).toBeCloseTo(chevron.left + chevron.width / 2, 0)
    expect(parseFloat(line.height)).toBeCloseTo(group.getBoundingClientRect().height, 0)
  } finally {
    handle.dispose()
  }
})

test('under TreeView.fluid the highlight sits on the row the pointer or the keys reach', async () => {
  const { handle, before } = mount('0', 'ltr', { fluid: true })
  try {
    const tree = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[role="tree"][data-fluid-hover]')
      expect(found).not.toBeNull()
      return found!
    })
    const highlight = tree.firstElementChild as HTMLElement
    const on = (id: string) => {
      const over = highlight.getBoundingClientRect()
      const under = row(id).getBoundingClientRect()
      return (
        getComputedStyle(highlight).opacity === '1' &&
        Math.abs(over.left - under.left) < 0.5 &&
        Math.abs(over.top - under.top) < 0.5 &&
        Math.abs(over.width - under.width) < 0.5 &&
        Math.abs(over.height - under.height) < 0.5
      )
    }
    // Just inside its top edge, where the rows of the shut group above it are drawn, clipped.
    const top = row('readme').getBoundingClientRect()
    await userEvent.hover(row('readme'), { position: { x: top.width / 2, y: 2 } })
    await vi.waitFor(() => expect(on('readme')).toBe(true))
    // The highlight is the hover: the row draws none of its own.
    expect(getComputedStyle(row('readme')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    await userEvent.hover(before)
    await vi.waitFor(() => expect(getComputedStyle(highlight).opacity).toBe('0'))
    before.focus()
    await userEvent.tab()
    await vi.waitFor(() => expect(on('src')).toBe(true))
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('files-item-components'))
    await vi.waitFor(() => expect(on('components')).toBe(true))
  } finally {
    handle.dispose()
  }
})

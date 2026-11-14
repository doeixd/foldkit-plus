/**
 * `Conformance.tree` against the shipped TreeView and against a tree assembled
 * from `TreeNavigation`, left to right and right to left.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Conformance } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, TreeView, TreeViewSlots } from '../../src/index.js'
import { harness } from './harness.js'
import * as HandBuilt from './tree.handBuilt.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

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

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mountShipped = (direction: 'ltr' | 'rtl') => {
  const style = Style.forSlots(TreeViewSlots)(Recipes.TreeView({}))
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
  container.id = 'conformance-tree'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: TreeView.Model,
      container,
      init: () => ({ model: TreeView.init({ id: 'files' }) }),
      update: TreeView.update(FILES, {}),
      view: (model: TreeView.Model, h: HtmlBuilder<TreeView.Message>) =>
        TreeView.view(
          {
            label: 'Files',
            model,
            nodes: FILES,
            onMessage: message => message,
            direction,
            style,
          },
          h,
        ),
    }),
  )
}

const enter = async () => {
  const first = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
    expect(found).not.toBeNull()
    return found!
  })
  first.focus()
}

const spec = (direction: 'ltr' | 'rtl') => ({
  name: 'Files',
  parent: 'src',
  child: 'components',
  next: 'README.md',
  direction,
  enter,
})

test.each(['ltr', 'rtl'] as const)('the shipped TreeView conforms (%s)', async direction => {
  const handle = mountShipped(direction)
  try {
    const result = await Conformance.tree(harness, spec(direction))
    expect(Conformance.failures(result)).toEqual([])
    expect(result.length).toBeGreaterThan(12)
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  'a tree assembled from TreeNavigation conforms (%s)',
  async direction => {
    const handle = HandBuilt.mount(FILES, direction)
    try {
      const result = await Conformance.tree(harness, spec(direction))
      expect(Conformance.failures(result)).toEqual([])
      expect(result.length).toBeGreaterThan(12)
    } finally {
      handle.dispose()
    }
  },
)

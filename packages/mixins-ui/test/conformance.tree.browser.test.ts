/**
 * The APG tree view, run over `TreeView` in a real browser: its keys in both
 * reading directions, a checkable tree's Space, and the roles, names and
 * states Chrome reads from it.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Recipes, TreeView, TreeViewSlots } from '../src/index.js'
import {
  checkNames,
  defineScenarios,
  defineTabStop,
  treeScenarios,
  type Adapter,
  type Mounted,
  type TreeNodeSpec,
  type TreeSetup,
} from './conformance.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

const SPEC: ReadonlyArray<TreeNodeSpec> = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [{ id: 'button', label: 'button.ts' }],
      },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'docs', label: 'docs', children: [{ id: 'guide', label: 'guide.md' }] },
  { id: 'legal', label: 'legal', disabled: true },
  { id: 'readme', label: 'readme.md' },
  { id: 'rollup', label: 'rollup.config.ts' },
]

const toNode = (node: TreeNodeSpec): TreeView.TreeNode => ({
  id: node.id,
  label: node.label,
  disabled: node.disabled,
  children: node.children?.map(toNode),
})
const NODES: ReadonlyArray<TreeView.TreeNode> = SPEC.map(toNode)
const idOf = (label: string): string => {
  const find = (level: ReadonlyArray<TreeNodeSpec>): string | undefined => {
    for (const node of level) {
      if (node.label === label) return node.id
      const inner = find(node.children ?? [])
      if (inner !== undefined) return inner
    }
    return undefined
  }
  const found = find(SPEC)
  if (found === undefined) throw new Error(`no row is labelled ${label}`)
  return found
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const adapter: Adapter<TreeSetup> = {
  name: 'TreeView',
  mount: async setup => {
    const style = Style.forSlots(TreeViewSlots)(Recipes.TreeView({}))
    const sheet = document.createElement('style')
    sheet.dataset['test'] = ''
    sheet.textContent =
      Style.stylesheet(
        Layers.standard.declare,
        Layers.standard.in('reset', Defaults.reset),
        Layers.standard.in('theme', Theme.root(theme)),
      ) +
      style.css +
      ':root{--fk-knob-motion:0}'
    document.head.append(sheet)
    const before = document.createElement('button')
    before.textContent = 'Before'
    document.body.appendChild(before)
    const container = document.createElement('div')
    container.id = 'tree-conformance'
    document.body.appendChild(container)
    const view = (model: TreeView.Model, h: HtmlBuilder<TreeView.Message>) =>
      h.div(
        [h.Style({ inlineSize: '20rem' })],
        [
          TreeView.view(
            {
              label: 'Files',
              model,
              nodes: NODES,
              onMessage: message => message,
              direction: setup.direction,
              checkable: setup.checkable,
              style,
            },
            h,
          ),
        ],
      )
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model: TreeView.Model,
        container,
        slow: false,
        init: () => ({
          model: TreeView.init({ id: 'files', open: setup.open.map(idOf) }),
        }),
        update: TreeView.update(NODES, { checkable: setup.checkable }),
        view,
      }),
    )
    const root = () => document.querySelector<HTMLElement>('[role="tree"]')!
    const all = () => Array.from(root().querySelectorAll<HTMLElement>('[role="treeitem"]'))
    const labelOf = (item: HTMLElement) => item.firstElementChild!.textContent!.trim()
    await vi.waitFor(() => expect(all().length).toBeGreaterThan(0))
    await vi.waitFor(() =>
      expect(document.querySelector('[role="treeitem"]')?.getAttribute('tabindex')).not.toBeNull(),
    )
    document.getElementById(`files-item-${idOf(setup.start)}`)!.focus()
    const mounted: Mounted = {
      dispose: () => handle.dispose(),
      items: () => all().filter(item => item.closest('[inert]') === null),
      current: () => {
        const active = document.activeElement
        return active instanceof HTMLElement && active.getAttribute('role') === 'treeitem'
          ? active
          : undefined
      },
      labelOf,
      state: () => {
        const labels = (select: (item: HTMLElement) => boolean) =>
          all().filter(select).map(labelOf).sort().join(',')
        return {
          selected: labels(item => item.getAttribute('aria-selected') === 'true'),
          open: labels(item => item.getAttribute('aria-expanded') === 'true'),
          // A row holding rows reads its check from the rows beneath it.
          checked: labels(
            item =>
              item.getAttribute('aria-checked') === 'true' &&
              item.querySelector('[role="treeitem"]') === null,
          ),
        }
      },
      root,
      entry: () => before,
    }
    return mounted
  },
}

const sources = (direction: 'ltr' | 'rtl', checkable: boolean) =>
  treeScenarios(
    {
      nodes: SPEC,
      enterToggles: true,
      setup: setup => setup,
    },
    direction,
    checkable,
  )

describe('keys', () => {
  defineScenarios(adapter, sources('ltr', false))
  defineScenarios(adapter, sources('rtl', false))
  defineScenarios(adapter, sources('ltr', true))
})

defineTabStop(adapter, {
  name: 'Tab enters on the current row, leaves past the tree, and Shift+Tab comes back',
  setup: { direction: 'ltr', open: [], start: 'src', checkable: false },
  start: 'src',
  move: 'ArrowDown',
  moved: 'docs',
})

const hasRows = (mounted: Mounted) =>
  Array.from(mounted.root().querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
    item => item.querySelector('[role="group"]') !== null,
  )

test('the tree and its rows are named, stated and related as the APG asks, in Chrome', async () => {
  const mounted = await adapter.mount({
    direction: 'ltr',
    open: ['src'],
    start: 'src',
    checkable: true,
  })
  try {
    await checkNames(mounted, {
      root: { role: 'tree', name: 'Files' },
      item: { role: 'treeitem' },
      states: [
        {
          attribute: 'aria-selected',
          property: 'selected',
          on: m => m.items(),
          values: ['true', 'false'],
        },
        {
          attribute: 'aria-expanded',
          property: 'expanded',
          on: hasRows,
          values: ['true', 'false'],
        },
        {
          attribute: 'aria-checked',
          property: 'checked',
          on: m => m.items(),
          values: ['true', 'false', 'mixed'],
        },
      ],
      relationships: [],
    })
  } finally {
    mounted.dispose()
  }
})

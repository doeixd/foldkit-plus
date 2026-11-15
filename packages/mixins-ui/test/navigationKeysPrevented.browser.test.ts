/// <reference types="@vitest/browser-playwright" />
/**
 * The catalog's navigation widgets handle their keys without leaving them to
 * the page: an arrow, Home or End the widget acts on is `defaultPrevented`, so
 * the page does not scroll as well, and Tab is never prevented, so focus can
 * leave. `Conformance` reads where focus and state go; this reads what the
 * browser is told, which only a real key shows.
 */
import { Option, Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Listbox, ListboxView, Tabs, TreeView } from '../src/index.js'

let handle: { readonly dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const container = (id: string) => {
  const element = document.createElement('div')
  element.id = id
  document.body.append(element)
  return element
}

/** Whether anything had prevented the keydown's default by the time it reached the window. */
const typed = async (keys: string): Promise<ReadonlyArray<boolean>> => {
  const seen: Array<boolean> = []
  const listen = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
  window.addEventListener('keydown', listen)
  try {
    await userEvent.keyboard(keys)
  } finally {
    window.removeEventListener('keydown', listen)
  }
  return seen
}

// Tabs -------------------------------------------------------------------------------

const TabsModel = Schema.Struct({ tabs: UiTabs.Model, value: Schema.String })
type TabsModel = typeof TabsModel.Type
const Project = UiTabs.create()
const LABELS = ['Overview', 'Activity', 'Settings']

const mountTabs = () =>
  Runtime.embed(
    Runtime.makeElement({
      Model: TabsModel,
      container: container('tabs-host'),
      init: () => ({ model: { tabs: UiTabs.init({ id: 'project' }), value: 'Overview' } }),
      update: (model: TabsModel, message: UiTabs.Message) => {
        const next = Project.update(model.tabs, message)
        return {
          model: { tabs: next.model, value: next.outMessage?.value ?? model.value },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view: (model: TabsModel, h: HtmlBuilder<UiTabs.Message>) =>
        Project.view(
          model.tabs,
          {
            tabs: LABELS,
            selectedValue: model.value,
            ariaLabel: 'Project',
            toView: Tabs.toView([], { h }, ({ tablist, tabs }) =>
              h.div(
                [],
                [
                  h.div(
                    tablist,
                    tabs.map(tab => h.button(tab.tab, [tab.value])),
                  ),
                  ...tabs.filter(tab => tab.isActive).map(tab => h.div(tab.panel, [tab.value])),
                ],
              ),
            ),
          },
          h,
        ),
    }),
  )

const selectedTab = () =>
  document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.textContent

test.each([
  ['{ArrowRight}', 'Activity'],
  ['{End}', 'Settings'],
  ['{ArrowLeft}', 'Settings'],
  ['{Home}', 'Overview'],
] as const)('a tab list prevents %s, which moves to %s', async (key, lands) => {
  handle = mountTabs()
  const first = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    expect(found).not.toBeNull()
    return found!
  })
  first.focus()
  expect(await typed(key)).toEqual([true])
  await vi.waitFor(() => expect(selectedTab()).toBe(lands))
})

test('a tab list leaves Tab to the browser', async () => {
  handle = mountTabs()
  await vi.waitFor(() => expect(selectedTab()).toBe('Overview'))
  document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!.focus()
  expect(await typed('{Tab}')).toEqual([false])
})

// Listbox ----------------------------------------------------------------------------

const Frequencies = ListboxView.create<string>()
const ListModel = Schema.Struct({
  listbox: UpstreamListbox.Model,
  chosen: Schema.Option(Schema.String),
})
type ListModel = typeof ListModel.Type
const OPTIONS = ['Hourly', 'Daily', 'Overnight', 'Weekly']

const mountListbox = () =>
  Runtime.embed(
    Runtime.makeElement({
      Model: ListModel,
      container: container('listbox-host'),
      init: () => ({
        model: {
          listbox: UpstreamListbox.init({ id: 'frequency', isAnimated: false }),
          chosen: Option.none(),
        },
      }),
      update: (model: ListModel, message: UpstreamListbox.Message) => {
        const next = Frequencies.update(model.listbox, message)
        return {
          model: {
            listbox: next.model,
            chosen:
              next.outMessage === undefined ? model.chosen : Option.some(next.outMessage.value),
          },
          commands: next.commands === undefined ? [] : next.commands,
        }
      },
      view: (model: ListModel, h: HtmlBuilder<UpstreamListbox.Message>) =>
        Frequencies.view(
          model.listbox,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: OPTIONS,
            maybeSelectedValue: model.chosen,
            itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
            buttonContent: h.span([], ['Frequency']),
            toView: Listbox.toView([], { h }),
          },
          h,
        ),
    }),
  )

const activeItem = () => {
  const id = document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant')
  return id === null || id === undefined ? '' : (document.getElementById(id)?.textContent ?? '')
}

test.each([
  ['{ArrowDown}', 'Daily'],
  ['{End}', 'Weekly'],
  ['{ArrowUp}', 'Overnight'],
  ['{Home}', 'Hourly'],
] as const)('an open listbox prevents %s, which moves to %s', async (key, lands) => {
  handle = mountListbox()
  const button = await vi.waitFor(() => {
    const found = document.getElementById('frequency-button')
    expect(found).not.toBeNull()
    return found!
  })
  button.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
  await vi.waitFor(() => expect(activeItem()).toBe('Hourly'))
  // Each case starts from the first option, so ArrowUp wraps to the one before the last.
  if (key === '{ArrowUp}') await userEvent.keyboard('{End}')
  if (key === '{ArrowUp}') await vi.waitFor(() => expect(activeItem()).toBe('Weekly'))
  expect(await typed(key)).toEqual([true])
  await vi.waitFor(() => expect(activeItem()).toBe(lands))
})

// Tree -------------------------------------------------------------------------------

const FILES: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'components', label: 'components' },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

const mountTree = () =>
  Runtime.embed(
    Runtime.makeElement({
      Model: TreeView.Model,
      container: container('tree-host'),
      init: () => ({ model: TreeView.init({ id: 'files' }) }),
      update: TreeView.update(FILES, {}),
      view: (model: TreeView.Model, h: HtmlBuilder<TreeView.Message>) =>
        TreeView.view({ label: 'Files', model, nodes: FILES, onMessage: message => message }, h),
    }),
  )

const focusedRow = () => document.activeElement?.id.replace('files-item-', '') ?? ''

test.each([
  ['{ArrowDown}', 'readme'],
  ['{End}', 'readme'],
  ['{ArrowRight}', 'src'],
] as const)('a tree prevents %s from the first row', async (key, lands) => {
  handle = mountTree()
  const first = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
    expect(found).not.toBeNull()
    return found!
  })
  first.focus()
  expect(await typed(key)).toEqual([true])
  await vi.waitFor(() =>
    key === '{ArrowRight}'
      ? expect(document.getElementById('files-item-src')?.getAttribute('aria-expanded')).toBe(
          'true',
        )
      : expect(focusedRow()).toBe(lands),
  )
})

test('a tree prevents Home and ArrowUp, which move to the first row, and leaves Tab to the browser', async () => {
  handle = mountTree()
  const first = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
    expect(found).not.toBeNull()
    return found!
  })
  first.focus()
  await userEvent.keyboard('{End}')
  await vi.waitFor(() => expect(focusedRow()).toBe('readme'))
  expect(await typed('{ArrowUp}')).toEqual([true])
  await vi.waitFor(() => expect(focusedRow()).toBe('src'))
  await userEvent.keyboard('{End}')
  await vi.waitFor(() => expect(focusedRow()).toBe('readme'))
  expect(await typed('{Home}')).toEqual([true])
  await vi.waitFor(() => expect(focusedRow()).toBe('src'))
  expect(await typed('{Tab}')).toEqual([false])
})

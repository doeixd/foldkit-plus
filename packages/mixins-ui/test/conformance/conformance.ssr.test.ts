// @vitest-environment jsdom
/**
 * `Conformance.server`: each widget rendered to a string and parsed back as a
 * browser would, so a page served before it hydrates already has the roles,
 * names and state attributes the rendered scenarios hold the live page to.
 */
import { Effect, Option } from 'effect'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import { view as checkboxView } from '@foldkit/ui/checkbox'
import { Dialog as UiDialog, Tabs as UiTabs } from '@foldkit/ui'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Conformance } from 'foldkit-mixins/testing'
import { expect, test } from 'vitest'
import * as HandCheckbox from './checkbox.handBuilt.js'
import * as HandListbox from './listbox.handBuilt.js'
import * as HandTabs from './tabs.handBuilt.js'
import * as HandTree from './tree.handBuilt.js'
import { Checkbox, Dialog, Listbox, ListboxView, Tabs, TreeView } from '../../src/index.js'

const parsed = async <Model, Message>(
  model: Model,
  view: (model: Model, h: HtmlBuilder<Message>) => Html,
) => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model }),
        view: (m: Model, h: HtmlBuilder<Message>) => ({ title: 't', body: view(m, h) }),
      },
      { buildId: 'b' },
    ),
  )
  return new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      served,
    ),
    'text/html',
  )
}

const holds = (result: Conformance.Result, checks: number) => {
  expect(Conformance.failures(result)).toEqual([])
  expect(result).toHaveLength(checks)
}

const FRUITS = ['Apple', 'Banana', 'Cherry']

test('a served listbox has its roles, names and a value for aria-selected on every option', async () => {
  const Fruits = ListboxView.create<string>()
  const open = Fruits.open(UpstreamListbox.init({ id: 'fruit' })).model
  const page = await parsed(open, (model, h: HtmlBuilder<UpstreamListbox.Message>) =>
    Fruits.view(
      model,
      {
        anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
        items: FRUITS,
        maybeSelectedValue: Option.some('Banana'),
        itemToConfig: (fruit: string) => ({ content: h.span([], [fruit]) }),
        buttonContent: h.span([], ['Fruit']),
        toView: Listbox.toView([], { h }),
      },
      h,
    ),
  )
  holds(
    Conformance.server('listbox', page, [
      { role: 'listbox', name: 'Fruit' },
      { role: 'option', name: 'Apple', attributes: { 'aria-selected': 'false' } },
      { role: 'option', name: 'Banana', attributes: { 'aria-selected': 'true' } },
      { role: 'option', name: 'Cherry', attributes: { 'aria-selected': 'false' } },
    ]),
    7,
  )
})

test('a served checkbox is a checkbox with its name and its state', async () => {
  const page = await parsed({}, (_, h: HtmlBuilder<never>) =>
    checkboxView<never>(
      {
        id: 'subscribe',
        isChecked: true,
        onToggle: () => undefined as never,
        toView: Checkbox.toView([], { h }, resolved =>
          h.div([], [h.button(resolved.checkbox, []), h.label(resolved.label, ['Subscribe'])]),
        ),
      },
      h,
    ),
  )
  holds(
    Conformance.server('checkbox', page, [
      { role: 'checkbox', name: 'Subscribe', attributes: { 'aria-checked': 'true' } },
    ]),
    2,
  )
})

test('served tabs have a tab list, their tabs with a state, and the one panel named by its tab', async () => {
  const Project = UiTabs.create()
  const page = await parsed(
    UiTabs.init({ id: 'project' }),
    (model, h: HtmlBuilder<UiTabs.Message>) =>
      Project.view(
        model,
        {
          tabs: ['Overview', 'Settings'],
          selectedValue: 'Settings',
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
  )
  holds(
    Conformance.server('tabs', page, [
      { role: 'tablist', name: 'Project' },
      { role: 'tab', name: 'Overview', attributes: { 'aria-selected': 'false' } },
      {
        role: 'tab',
        name: 'Settings',
        attributes: { 'aria-selected': 'true', 'aria-controls': true },
      },
      { role: 'tabpanel', name: 'Settings' },
    ]),
    7,
  )
})

test('a served tree has its tree, its rows with their levels and an expanded state on a parent', async () => {
  const nodes: ReadonlyArray<TreeView.TreeNode> = [
    { id: 'src', label: 'src', children: [{ id: 'index', label: 'index.ts' }] },
    { id: 'readme', label: 'README.md' },
  ]
  const page = await parsed(
    TreeView.init({ id: 'files' }),
    (model, h: HtmlBuilder<TreeView.Message>) =>
      TreeView.view({ label: 'Files', model, nodes, onMessage: message => message }, h),
  )
  holds(
    Conformance.server('tree', page, [
      { role: 'tree', name: 'Files' },
      {
        role: 'treeitem',
        name: 'src',
        attributes: { 'aria-expanded': 'false', 'aria-level': '1' },
      },
      { role: 'treeitem', name: 'README.md', attributes: { 'aria-level': '1' } },
    ]),
    6,
  )
})

test('a served open dialog has its role, its name and its content', async () => {
  const open = UiDialog.open(UiDialog.init({ id: 'confirm' })).model
  const page = await parsed(open, (model, h: HtmlBuilder<UiDialog.Message>) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiDialog.view,
      viewInputs: {
        toView: Dialog.toView([], { h }, dialog =>
          h.dialog(dialog.dialog, [h.div(dialog.panel, [h.h2(dialog.title, ['Confirm'])])]),
        ),
      },
      toParentMessage: message => message,
    }),
  )
  holds(Conformance.server('dialog', page, [{ role: 'dialog', name: 'Confirm' }]), 1)
})

test('a listbox assembled from primitives is served with its roles, names and state', async () => {
  const options = [
    { id: 'hourly', label: 'Hourly' },
    { id: 'daily', label: 'Daily', disabled: true },
    { id: 'weekly', label: 'Weekly' },
  ]
  const page = await parsed({}, (_, h: HtmlBuilder<HandListbox.Message>) =>
    HandListbox.served(options, h),
  )
  holds(
    Conformance.server('listbox', page, [
      { role: 'listbox', name: 'Frequency' },
      { role: 'option', name: 'Hourly', attributes: { 'aria-selected': 'false' } },
      {
        role: 'option',
        name: 'Daily',
        attributes: { 'aria-selected': 'false', 'aria-disabled': 'true' },
      },
      { role: 'option', name: 'Weekly', attributes: { 'aria-selected': 'true' } },
    ]),
    8,
  )
})

test('a checkbox assembled from primitives is served as a checkbox with its name and state', async () => {
  const page = await parsed({}, (_, h: HtmlBuilder<HandCheckbox.Message>) => HandCheckbox.served(h))
  holds(
    Conformance.server('checkbox', page, [
      { role: 'checkbox', name: 'Subscribe', attributes: { 'aria-checked': 'true' } },
      {
        role: 'checkbox',
        name: 'Locked',
        attributes: { 'aria-checked': 'false', 'aria-disabled': 'true' },
      },
    ]),
    5,
  )
})

test('tabs assembled from primitives are served with a state on every tab and one panel', async () => {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'settings', label: 'Settings' },
  ]
  const page = await parsed({}, (_, h: HtmlBuilder<HandTabs.Message>) => HandTabs.served(tabs, h))
  holds(
    Conformance.server('tabs', page, [
      { role: 'tablist', name: 'Project' },
      { role: 'tab', name: 'Overview', attributes: { 'aria-selected': 'false' } },
      { role: 'tab', name: 'Activity', attributes: { 'aria-selected': 'false' } },
      {
        role: 'tab',
        name: 'Settings',
        attributes: { 'aria-selected': 'true', 'aria-controls': true },
      },
      { role: 'tabpanel', name: 'Settings' },
    ]),
    9,
  )
})

test('a tree assembled from TreeNavigation is served with levels and an expanded state', async () => {
  const nodes = [
    { id: 'src', label: 'src', children: [{ id: 'index', label: 'index.ts' }] },
    { id: 'readme', label: 'README.md' },
  ]
  const page = await parsed({}, (_, h: HtmlBuilder<HandTree.Message>) => HandTree.served(nodes, h))
  holds(
    Conformance.server('tree', page, [
      { role: 'tree', name: 'Files' },
      {
        role: 'treeitem',
        name: 'src',
        attributes: { 'aria-expanded': 'false', 'aria-level': '1' },
      },
      { role: 'treeitem', name: 'README.md', attributes: { 'aria-level': '1' } },
    ]),
    6,
  )
})

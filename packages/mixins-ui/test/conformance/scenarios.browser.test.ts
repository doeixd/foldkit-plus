/**
 * The scenarios themselves, each shown to fail on a page that breaks what it
 * checks: a scenario that only ever passes says nothing of a widget that
 * conforms.
 */
import { Conformance } from 'foldkit-mixins/testing'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import * as HandTabs from './tabs.handBuilt.js'

const harness = Conformance.harness({ cdp, userEvent })

afterEach(() => {
  document.body.replaceChildren()
})

const outcome = (result: Conformance.Result, check: string) =>
  result.find(each => each.check === check)?.passed

test('a row whose group an ancestor hides is not showing', async () => {
  // Static markup: the keys move nothing, so the scenario reads the page as drawn.
  document.body.innerHTML = `
    <ul role="tree" aria-label="Files">
      <li role="treeitem" id="src" tabindex="0" aria-expanded="false">src
        <ul role="group" style="display: none">
          <li role="treeitem" id="components" tabindex="-1">components</li>
        </ul>
      </li>
      <li role="treeitem" id="readme" tabindex="-1">README.md</li>
    </ul>`
  const result = await Conformance.tree(harness, {
    name: 'Files',
    parent: 'src',
    child: 'components',
    next: 'README.md',
    enter: async () => document.getElementById('src')!.focus(),
  })
  expect(outcome(result, 'a shut parent shows no child')).toBe(true)
})

test('tabs whose arrows choose fail the manual check, which only manual tabs pass', async () => {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'Settings' },
    { id: 'billing', label: 'Billing' },
  ]
  const handle = HandTabs.mount(tabs, 'ltr')
  try {
    const result = await Conformance.tabs(harness, {
      name: 'Project',
      tabs: tabs.map(tab => tab.label),
      activation: 'manual',
      enter: async () => {
        const selected = await vi.waitFor(() => {
          const found = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          expect(found).not.toBeNull()
          return found!
        })
        selected.focus()
      },
    })
    expect(outcome(result, 'the arrows move the keyboard without choosing a tab')).toBe(false)
  } finally {
    handle.dispose()
  }
})

test('tabs with one enabled tab are not asked to go back one', async () => {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'Settings', disabled: true },
  ]
  const handle = HandTabs.mount(tabs, 'ltr')
  try {
    const result = await Conformance.tabs(harness, {
      name: 'Project',
      tabs: tabs.map(tab => tab.label),
      disabled: 'Settings',
      enter: async () => {
        const selected = await vi.waitFor(() => {
          const found = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          expect(found).not.toBeNull()
          return found!
        })
        selected.focus()
      },
    })
    expect(Conformance.failures(result)).toEqual([])
  } finally {
    handle.dispose()
  }
})

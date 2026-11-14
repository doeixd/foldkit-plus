/**
 * `Conformance.tabs` against the shipped Tabs and against tabs assembled from
 * primitives, left to right and right to left.
 */
import { Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Conformance } from 'foldkit-mixins/testing'
import { afterEach, expect, test, vi } from 'vitest'
import { Tabs } from '../../src/index.js'
import { harness } from './harness.js'
import * as HandBuilt from './tabs.handBuilt.js'

const Model = Schema.Struct({ tabs: UiTabs.Model, value: Schema.String })
type Model = typeof Model.Type
const Project = UiTabs.create()

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity', disabled: true },
  { id: 'settings', label: 'Settings' },
  { id: 'billing', label: 'Billing' },
]
const labels = TABS.map(tab => tab.label)

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mountShipped = (direction: 'ltr' | 'rtl', activationMode: 'Automatic' | 'Manual') => {
  const container = document.createElement('div')
  container.id = 'conformance-tabs'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { tabs: UiTabs.init({ id: 'project', activationMode }), value: 'Overview' },
      }),
      update: (model: Model, message: UiTabs.Message) => {
        const next = Project.update(model.tabs, message)
        return {
          model: { tabs: next.model, value: next.outMessage?.value ?? model.value },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view: (model: Model, h: HtmlBuilder<UiTabs.Message>) =>
        h.div(
          [h.Dir(direction)],
          [
            Project.view(
              model.tabs,
              {
                tabs: labels,
                selectedValue: model.value,
                ariaLabel: 'Project',
                isTabDisabled: value => value === 'Activity',
                toView: Tabs.toView(
                  direction === 'rtl' ? [Tabs.readingKeys] : [],
                  { h },
                  ({ tablist, tabs }) =>
                    h.div(
                      [],
                      [
                        h.div(
                          tablist,
                          tabs.map(tab => h.button(tab.tab, [tab.value])),
                        ),
                        ...tabs
                          .filter(tab => tab.isActive)
                          .map(tab => h.div(tab.panel, [`${tab.value} content`])),
                      ],
                    ),
                ),
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const enterShipped = async () => {
  const selected = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    expect(found).not.toBeNull()
    return found!
  })
  selected.focus()
}

test.each([
  ['ltr', 'Automatic'],
  ['rtl', 'Automatic'],
  ['ltr', 'Manual'],
] as const)('the shipped Tabs conform (%s, %s)', async (direction, activationMode) => {
  const handle = mountShipped(direction, activationMode)
  try {
    const result = await Conformance.tabs(harness, {
      name: 'Project',
      tabs: labels,
      disabled: 'Activity',
      direction,
      activation: activationMode === 'Manual' ? 'manual' : 'automatic',
      enter: enterShipped,
    })
    expect(Conformance.failures(result)).toEqual([])
    expect(result.length).toBeGreaterThan(10)
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  'tabs assembled from primitives conform (%s)',
  async direction => {
    const handle = HandBuilt.mount(TABS, direction)
    try {
      const result = await Conformance.tabs(harness, {
        name: 'Project',
        tabs: labels,
        disabled: 'Activity',
        direction,
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
      expect(result.length).toBeGreaterThan(10)
    } finally {
      handle.dispose()
    }
  },
)

/**
 * Closable, vertical and scrolling tabs on a real runtime: Delete on a tab
 * and a press on its close button close it, focus going to the tab after
 * it; an upright tablist's underline stands at the chosen tab's inline end,
 * either direction; and a long scrolling row stays one line.
 */
import { Option, Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import type { Return } from 'foldkit/update'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Tabs, TabsSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const Model = Schema.Struct({
  tabs: UiTabs.Model,
  values: Schema.Array(Schema.String),
  value: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotTabs: { message: UiTabs.Message },
  Closed: { value: Schema.String },
})
type Message = typeof Message.Type
const Bundle = UiTabs.create()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

interface Fixture {
  readonly values: ReadonlyArray<string>
  readonly recipe?: Parameters<typeof Recipes.Tabs>[0]
  readonly closable?: boolean
  readonly orientation?: UiTabs.Orientation
  /** The tablist's width, to make a row overflow. */
  readonly width?: string
}

const sheetOf = (css: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = css
  document.head.append(sheet)
}

const mount = (fixture: Fixture) => {
  const style = Style.forSlots(TabsSlots)(Recipes.Tabs(fixture.recipe ?? {}))
  sheetOf(
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
      style.css +
      // Nothing else that would measure again, so only the change under test moves anything.
      '* { transition: none !important; }',
  )
  // The runtime draws in place of its container, so the width goes on a box around it.
  const box = document.createElement('div')
  if (fixture.width !== undefined) box.style.width = fixture.width
  const container = document.createElement('div')
  container.id = 'tabs-kinds'
  box.appendChild(container)
  document.body.appendChild(box)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.submodel({
      slotId: model.tabs.id,
      model: model.tabs,
      view: Bundle.view,
      viewInputs: {
        tabs: model.values,
        selectedValue: model.value,
        ariaLabel: 'Files',
        ...(fixture.orientation === undefined ? {} : { orientation: fixture.orientation }),
        toView: Tabs.toView<string, Message>(
          [style.mixin, ...Tabs.fluid],
          {
            h,
            ...(fixture.closable === true
              ? { close: { onClose: value => Message.Closed({ value }) } }
              : {}),
          },
          ({ tablist, indicator, highlight, label, tabs }) =>
            h.div(tablist, [
              h.div(indicator),
              h.div(highlight),
              ...tabs.map(tab =>
                h.div(tab.item, [
                  h.button(tab.tab, [h.span(label, [tab.value])]),
                  ...Option.match(tab.close, {
                    onNone: () => [],
                    onSome: close => [h.button(close, [])],
                  }),
                ]),
              ),
            ]),
        ),
      },
      toParentMessage: message => Message.GotTabs({ message }),
    })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          tabs: UiTabs.init({ id: 'files' }),
          values: fixture.values,
          value: fixture.values[0]!,
        },
      }),
      update: (model: Model, message: Message): Return<Model, Message> =>
        Message.match(message, {
          GotTabs: ({ message }) => {
            const next = Bundle.update(model.tabs, message)
            return {
              model: modifyFields(model, {
                tabs: () => next.model,
                value: value => next.outMessage?.value ?? value,
              }),
              commands: Command.mapMessages(next.commands, message => Message.GotTabs({ message })),
            }
          },
          Closed: ({ value }) => {
            const after = Tabs.closing(model.values, model.value, value)
            return {
              model: modifyFields(model, {
                values: () => after.tabs,
                value: current => Option.getOrElse(after.selected, () => current),
              }),
              // The focused tab left the page: the one after it takes focus.
              commands: Command.mapMessages(
                Option.toArray(
                  Option.map(after.focus, index => UiTabs.FocusTab({ id: model.tabs.id, index })),
                ),
                message => Message.GotTabs({ message }),
              ),
            }
          },
        }),
      view,
    }),
  )
}

const tab = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find(
    each => each.textContent === name,
  )
const names = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).map(each => each.textContent)
const indicator = () => document.querySelector('[role="tablist"]')!.children[0] as HTMLElement

test('Delete on a tab closes it, and focus goes to the tab after it', async () => {
  const handle = mount({ values: ['one', 'two', 'three'], closable: true })
  try {
    await vi.waitFor(() => expect(tab('one')).toBeTruthy())
    // On its words, clear of the close button over its end.
    await userEvent.click(tab('two')!, { position: { x: 12, y: 12 } })
    await vi.waitFor(() => expect(document.activeElement).toBe(tab('two')))
    await userEvent.keyboard('{Delete}')
    await vi.waitFor(() => {
      expect(names()).toEqual(['one', 'three'])
      expect(document.activeElement).toBe(tab('three'))
      expect(tab('three')!.getAttribute('aria-selected')).toBe('true')
    })
  } finally {
    handle.dispose()
  }
})

test('a press on a close button closes its tab and leaves the chosen one chosen', async () => {
  const handle = mount({ values: ['one', 'two', 'three'], closable: true })
  try {
    await vi.waitFor(() => expect(tab('one')).toBeTruthy())
    // Under Tabs.fluid the indicator marks the chosen tab; it does not mark itself too.
    await vi.waitFor(() => expect(edges(tab('one')!).width).toBeGreaterThan(10))
    expect(getComputedStyle(tab('one')!).boxShadow).toBe('none')
    const close = tab('three')!.parentElement!.querySelector<HTMLElement>('[title="Close three"]')!
    // The cross lies inside the tab it closes, so the tab's marker covers it, past its words.
    const over = close.getBoundingClientRect()
    const under = tab('three')!.getBoundingClientRect()
    expect(over.left).toBeGreaterThanOrEqual(
      tab('three')!.firstElementChild!.getBoundingClientRect().right,
    )
    expect(over.right).toBeLessThanOrEqual(under.right + 0.5)
    close.click()
    await vi.waitFor(() => {
      expect(names()).toEqual(['one', 'two'])
      expect(tab('one')!.getAttribute('aria-selected')).toBe('true')
    })
  } finally {
    handle.dispose()
  }
})

/** Where the indicator stands against `target`: its left and right edges, in pixels. */
const edges = (target: HTMLElement) => {
  const over = indicator().getBoundingClientRect()
  const under = target.getBoundingClientRect()
  return { left: over.left - under.left, right: under.right - over.right, width: over.width }
}

test.each(['ltr', 'rtl'] as const)(
  'upright, the underline stands at the chosen tab’s inline end (%s)',
  async direction => {
    document.documentElement.dir = direction
    const handle = mount({ values: ['Profile', 'Billing'], orientation: 'Vertical' })
    try {
      await vi.waitFor(() => {
        const at = edges(tab('Profile')!)
        expect(at.width).toBeLessThan(4)
        // Flush with the end the reading runs to, not the start.
        expect(Math.abs(direction === 'ltr' ? at.right : at.left)).toBeLessThan(1)
      })
      expect(tab('Billing')!.getBoundingClientRect().top).toBeGreaterThan(
        tab('Profile')!.getBoundingClientRect().bottom - 1,
      )
    } finally {
      handle.dispose()
    }
  },
)

test('a scrolling row stays one line and the indicator follows a tab scrolled to', async () => {
  const values = Array.from({ length: 12 }, (_, index) => `Document ${index + 1}`)
  const handle = mount({ values, recipe: { overflow: 'scroll' }, width: '20rem' })
  try {
    await vi.waitFor(() => expect(tab('Document 12')).toBeTruthy())
    const list = document.querySelector<HTMLElement>('[role="tablist"]')!
    expect(list.scrollWidth).toBeGreaterThan(list.clientWidth)
    expect(tab('Document 12')!.getBoundingClientRect().top).toBe(
      tab('Document 1')!.getBoundingClientRect().top,
    )
    tab('Document 1')!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => {
      expect(tab('Document 12')!.getAttribute('aria-selected')).toBe('true')
      // Scrolled to, inside the row's own width.
      expect(tab('Document 12')!.getBoundingClientRect().right).toBeLessThanOrEqual(
        list.getBoundingClientRect().right + 0.5,
      )
      const at = edges(tab('Document 12')!)
      expect(Math.abs(at.left)).toBeLessThan(1)
      expect(Math.abs(at.right)).toBeLessThan(1)
    })
  } finally {
    handle.dispose()
  }
})

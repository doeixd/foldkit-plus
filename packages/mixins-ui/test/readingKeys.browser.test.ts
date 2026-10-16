/**
 * Arrow keys in the reading direction, on a real runtime and a real keyboard:
 * with `readingKeys`, a right-to-left page's ArrowLeft goes to the next tab,
 * radio or day, drawn to the left; a left-to-right page keeps ArrowRight.
 */
import { Option, Schema } from 'effect'
import * as CalendarUi from '@foldkit/ui/calendar'
import * as RadioGroupUi from '@foldkit/ui/radioGroup'
import * as TabsUi from '@foldkit/ui/tabs'
import * as Dates from 'foldkit/calendar'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Calendar, RadioGroup, Tabs } from '../src/index.js'

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

/** A container on a page of direction `direction`. */
const stage = (direction: 'ltr' | 'rtl') => {
  document.documentElement.dir = direction
  const container = document.createElement('div')
  container.id = 'reading-keys'
  document.body.append(container)
  return container
}

const Projects = TabsUi.create()
const TabsModel = Schema.Struct({ tabs: TabsUi.Model, value: Schema.String })

const tabs = (direction: 'ltr' | 'rtl') =>
  Runtime.embed(
    Runtime.makeElement({
      Model: TabsModel,
      container: stage(direction),
      init: () => ({ model: { tabs: TabsUi.init({ id: 'projects' }), value: 'one' } }),
      update: (model: typeof TabsModel.Type, message: TabsUi.Message) => {
        const next = Projects.update(model.tabs, message)
        return {
          model: { tabs: next.model, value: next.outMessage?.value ?? model.value },
          commands: next.commands ?? [],
        }
      },
      view: (model, h) =>
        Projects.view(
          model.tabs,
          {
            tabs: ['one', 'two', 'three'],
            selectedValue: model.value,
            ariaLabel: 'Projects',
            toView: Tabs.toView([Tabs.readingKeys], { h }, ({ tablist, tabs: each }) =>
              h.div(
                tablist,
                each.map(tab => h.button(tab.tab, [tab.value])),
              ),
            ),
          },
          h,
        ),
    }),
  )

const Plans = RadioGroupUi.create<'one' | 'two' | 'three'>()
const RadioModel = Schema.Struct({
  radio: RadioGroupUi.Model,
  value: Schema.Literals(['one', 'two', 'three']),
})

const radios = (direction: 'ltr' | 'rtl') =>
  Runtime.embed(
    Runtime.makeElement({
      Model: RadioModel,
      container: stage(direction),
      init: () => ({ model: { radio: RadioGroupUi.init({ id: 'plans' }), value: 'one' as const } }),
      update: (model: typeof RadioModel.Type, message: RadioGroupUi.Message) => {
        const next = Plans.update(model.radio, message)
        return {
          model: { radio: next.model, value: next.outMessage?.value ?? model.value },
          commands: next.commands ?? [],
        }
      },
      view: (model, h) =>
        Plans.view(
          model.radio,
          {
            options: ['one', 'two', 'three'],
            selectedValue: Option.some(model.value),
            ariaLabel: 'Plan',
            orientation: 'Horizontal',
            toView: RadioGroup.toView([RadioGroup.readingKeys], { h }, ({ group, options }) =>
              h.div(
                [...group, h.Style({ display: 'flex' })],
                options.map(option => h.button(option.option, [option.value])),
              ),
            ),
          },
          h,
        ),
    }),
  )

const CalendarModel = Schema.Struct({ calendar: CalendarUi.Model })

const calendar = (direction: 'ltr' | 'rtl') =>
  Runtime.embed(
    Runtime.makeElement({
      Model: CalendarModel,
      container: stage(direction),
      init: () => ({
        model: { calendar: CalendarUi.init({ id: 'trip', today: Dates.make(2026, 3, 11) }) },
      }),
      update: (model: typeof CalendarModel.Type, message: CalendarUi.Message) => {
        const next = CalendarUi.update(model.calendar, message)
        return { model: { calendar: next.model }, commands: next.commands ?? [] }
      },
      view: (model, h) =>
        CalendarUi.view(
          model.calendar,
          {
            maybeSelectedDate: Option.none(),
            toView: Calendar.toView(
              Calendar.Selection.Single({ date: Option.none() }),
              [Calendar.readingKeys],
              {
                h,
              },
            ),
          },
          h,
        ),
    }),
  )

const named = (role: string, name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[role="${role}"]`)).find(
    each => each.textContent === name,
  )!

test.each([
  ['ltr', 'ArrowRight'],
  ['rtl', 'ArrowLeft'],
] as const)('%s: %s goes to the next tab, drawn on that side', async (direction, key) => {
  const handle = tabs(direction)
  try {
    await vi.waitFor(() => expect(named('tab', 'one')).toBeTruthy())
    await userEvent.click(named('tab', 'one'))
    await userEvent.keyboard(`{${key}}`)
    await vi.waitFor(() => expect(document.activeElement).toBe(named('tab', 'two')))
    const one = named('tab', 'one').getBoundingClientRect().left
    const two = named('tab', 'two').getBoundingClientRect().left
    expect(direction === 'rtl' ? two < one : two > one).toBe(true)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['ltr', 'ArrowRight'],
  ['rtl', 'ArrowLeft'],
] as const)('%s: %s goes to the next radio of a row', async (direction, key) => {
  const handle = radios(direction)
  try {
    await vi.waitFor(() => expect(named('radio', 'one')).toBeTruthy())
    await userEvent.click(named('radio', 'one'))
    await userEvent.keyboard(`{${key}}`)
    await vi.waitFor(() => expect(named('radio', 'two').getAttribute('aria-checked')).toBe('true'))
  } finally {
    handle.dispose()
  }
})

const focusedDay = () => document.querySelector('[data-focused]')?.id

test.each([
  ['ltr', 'ArrowRight'],
  ['rtl', 'ArrowLeft'],
] as const)('%s: %s goes to the next day', async (direction, key) => {
  const handle = calendar(direction)
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="grid"]')).toBeTruthy())
    document.querySelector<HTMLElement>('[role="grid"]')!.focus()
    await vi.waitFor(() => expect(focusedDay()).toBe('trip-cell-2026-3-11'))
    await userEvent.keyboard(`{${key}}`)
    await vi.waitFor(() => expect(focusedDay()).toBe('trip-cell-2026-3-12'))
  } finally {
    handle.dispose()
  }
})

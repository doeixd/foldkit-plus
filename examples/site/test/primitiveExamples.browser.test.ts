/// <reference types="@vitest/browser-playwright" />
/**
 * Five of the Primitives gallery's live examples in a real browser, each run
 * on its own state as the gallery runs it: a press, a key, a typed value and
 * a drag change what is drawn.
 */
import { Option } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { SlotView, Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, page, userEvent } from 'vitest/browser'

import { listed } from '../src/gallery/primitiveExamples.js'
import { SiteStyle, stylesheet } from '../src/style.js'

/** The page's Message for an example: the example's own, under one tag, as `GotExample` wraps it. */
interface Got {
  readonly _tag: 'Got'
  readonly message: unknown
}
const got = (message: unknown): Got => ({ _tag: 'Got', message })

type Handle = ReturnType<typeof Runtime.embed>
let running: Handle | undefined

afterEach(() => {
  running?.dispose()
  running = undefined
  document.body.replaceChildren()
})

const mount = async (id: string) => {
  const { example } = Option.getOrThrow(Option.fromNullishOr(listed.find(entry => entry.id === id)))
  const { Model, initial, update, subscriptions } = example.state
  const Example = SlotView.forMessages<Got>()
    .define(SiteStyle.slots, (model: unknown, slots, h: HtmlBuilder<Got>): Html =>
      example.render(slots, model, got, h),
    )
    .pipe(Style.attach(SiteStyle.style))
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = `example-${id}`
  document.body.appendChild(container)
  running = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update: (model: unknown, { message }: Got) => {
        const step = update(model, message)
        return step.commands === undefined
          ? { model: step.model }
          : { model: step.model, commands: Command.mapMessages(step.commands, got) }
      },
      view: (model: unknown, h: HtmlBuilder<Got>) => Example(model, h),
      subscriptions: Subscription.lift(subscriptions)<unknown, Got>({
        read: model => Option.some(model),
        toParentMessage: got,
      }),
    }),
  )
  await vi.waitFor(() => expect(text().length).toBeGreaterThan(0))
}

const text = () => document.body.textContent ?? ''

test('Debounce reports a typed value once, after the typing stops', async () => {
  await mount('time-debounce')
  const field = page.getByRole('textbox', { name: 'Search' })
  await userEvent.type(field, 'abc')
  expect(text()).toContain('Settled on “”')
  await vi.waitFor(() => expect(text()).toContain('Settled on “abc”'), { timeout: 3000 })
})

test('Press counts a mouse press and an Enter press once each', async () => {
  await mount('interaction-press')
  const button = page.getByRole('button', { name: 'Press me' })
  await button.click()
  await vi.waitFor(() => expect(text()).toContain('Pressed 1 times'))
  await button.element().focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(text()).toContain('Pressed 2 times'))
})

test('the keyboard example hears Control S only while it listens', async () => {
  await mount('events-keyboard')
  await userEvent.keyboard('{Control>}s{/Control}')
  expect(text()).toContain('Saved 0 times')
  await page.getByRole('button', { name: 'Listen to keys' }).click()
  await vi.waitFor(() => expect(text()).toContain('Stop listening'))
  await userEvent.keyboard('{Control>}s{/Control}')
  await vi.waitFor(() => expect(text()).toContain('Saved 1 times'))
})

test('InputMask writes the separators into the field as digits are typed', async () => {
  await mount('dom-input-mask')
  const field = page.getByRole('textbox', { name: 'Phone' })
  await userEvent.type(field, '5551234567')
  await vi.waitFor(() => expect((field.element() as HTMLInputElement).value).toBe('(555) 123-4567'))
  expect(text()).toContain('typed 10 digits')
})

test('Move follows a drag and puts the box back when Escape ends it', async () => {
  await page.viewport(800, 600)
  await mount('interaction-move')
  const box = page.getByText('Drag me sideways').element()
  const at = box.getBoundingClientRect()
  const x = at.left + at.width / 2
  const y = at.top + at.height / 2
  const mouse = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', to: number) =>
    cdp().send('Input.dispatchMouseEvent', { type, x: to, y, button: 'left', clickCount: 1 })
  await mouse('mousePressed', x)
  await mouse('mouseMoved', x + 40)
  await vi.waitFor(() => expect(getComputedStyle(box).transform).toContain('40'))
  await userEvent.keyboard('{Escape}')
  await mouse('mouseReleased', x + 40)
  await vi.waitFor(() => expect(getComputedStyle(box).transform).not.toContain('40'))
})

// @vitest-environment jsdom
/**
 * A Foldkit program inside React: props reach it through inbound Ports,
 * outbound Ports reach the latest callback prop, and React's lifecycle
 * (including Strict Mode's double effects) starts and disposes the runtime.
 */
import { Effect, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Port from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { StrictMode, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { FoldkitComponent } from '../src/index.js'
import { click, settle, text } from './foldkit.js'

const ports = {
  inbound: { stepChanged: Port.inbound(Schema.Number) },
  outbound: { countChanged: Port.outbound(Schema.Number) },
}

const Model = Schema.Struct({ count: Schema.Number, step: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ChangedStep: { step: Schema.Number },
  Incremented: {},
  Reported: {},
})
type Message = typeof Message.Type

const report = (
  count: number,
): { readonly name: string; readonly effect: Effect.Effect<Message> } => ({
  name: 'Report',
  effect: Port.emit(ports.outbound.countChanged, count).pipe(Effect.as(Message.Reported())),
})

let started = 0
// Counts runtimes whose Subscriptions were interrupted, i.e. really disposed.
let stopped = 0

const makeCounter = (container: HTMLElement, props: { readonly initialCount: number }) => {
  started++
  return Runtime.makeElement({
    Model,
    container,
    ports,
    init: () => ({
      model: { count: props.initialCount, step: 1 },
      commands: [report(props.initialCount)],
    }),
    update: (model: Model, message: Message) => {
      switch (message._tag) {
        case 'ChangedStep':
          return { model: { ...model, step: message.step } }
        case 'Incremented': {
          const count = model.count + model.step
          return { model: { ...model, count }, commands: [report(count)] }
        }
        case 'Reported':
          return { model }
      }
    },
    subscriptions: Subscription.make<Model, Message>()(entry => ({
      step: Port.subscription(ports.inbound.stepChanged, step => Message.ChangedStep({ step })),
      alive: entry(
        { on: Schema.Boolean },
        {
          modelToDependencies: () => ({ on: true }),
          dependenciesToStream: () =>
            Stream.never.pipe(Stream.ensuring(Effect.sync(() => void stopped++))),
        },
      ),
    })),
    view: (model: Model, h: HtmlBuilder<Message>) =>
      h.button([h.Class('increment'), h.OnClick(Message.Incremented())], [String(model.count)]),
  })
}

interface CounterProps {
  readonly initialCount: number
  readonly step: number
  readonly user?: string
  readonly onCountChange?: (count: number) => void
}

const Counter = FoldkitComponent.define({
  make: (container, props: CounterProps) => makeCounter(container, props),
  inbound: { stepChanged: props => props.step },
  outbound: { countChanged: (count, props) => props.onCountChange?.(count) },
  restartKey: props => props.user,
})

const roots: Array<() => void> = []
afterEach(() => {
  roots.splice(0).forEach(unmount => unmount())
  started = 0
  stopped = 0
})

const render = () => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  roots.push(() => root.unmount())
  return { root, render: (node: ReactNode) => root.render(node) }
}

it('feeds props through Ports, reports to the latest callback, and disposes on unmount', async () => {
  const first: Array<number> = []
  const second: Array<number> = []
  const { root, render: show } = render()

  show(createElement(Counter, { initialCount: 5, step: 1, onCountChange: c => first.push(c) }))
  await vi.waitFor(() => expect(text('.increment')).toBe('5'))
  await vi.waitFor(() => expect(first).toEqual([5]))

  show(createElement(Counter, { initialCount: 99, step: 10, onCountChange: c => second.push(c) }))
  await settle()
  click('.increment')
  await vi.waitFor(() => expect(text('.increment')).toBe('15'))
  await vi.waitFor(() => expect(second).toEqual([15]))
  expect(first).toEqual([5])
  // `initialCount` is initial configuration: the rerender neither restarted nor re-inited the program.
  expect(started).toBe(1)

  root.unmount()
  roots.length = 0
  await vi.waitFor(() => expect(stopped).toBe(1))
  expect(document.querySelector('.increment')).toBeNull()
})

it('runs one live program under Strict Mode', async () => {
  const counts: Array<number> = []
  const { render: show } = render()
  show(
    createElement(
      StrictMode,
      null,
      createElement(Counter, { initialCount: 0, step: 2, onCountChange: c => counts.push(c) }),
    ),
  )
  await vi.waitFor(() => expect(text('.increment')).toBe('0'))
  expect(document.querySelectorAll('.increment')).toHaveLength(1)

  click('.increment')
  await vi.waitFor(() => expect(text('.increment')).toBe('2'))
  await settle()
  expect(document.querySelectorAll('.increment')).toHaveLength(1)
  expect(counts.at(-1)).toBe(2)
  expect(counts.filter(count => count === 2)).toHaveLength(1)
})

it('replaces the runtime once when the restart key changes', async () => {
  const { render: show } = render()
  show(createElement(Counter, { initialCount: 1, step: 1, user: 'ada' }))
  await vi.waitFor(() => expect(text('.increment')).toBe('1'))
  click('.increment')
  await vi.waitFor(() => expect(text('.increment')).toBe('2'))

  show(createElement(Counter, { initialCount: 1, step: 3, user: 'ada' }))
  await settle()
  expect(started).toBe(1)

  show(createElement(Counter, { initialCount: 1, step: 3, user: 'grace' }))
  await vi.waitFor(() => expect(text('.increment')).toBe('1'))
  expect(started).toBe(2)
  await vi.waitFor(() => expect(stopped).toBe(1))
  // The fresh runtime received the current step, not the Port's default.
  click('.increment')
  await vi.waitFor(() => expect(text('.increment')).toBe('4'))
  expect(document.querySelectorAll('.increment')).toHaveLength(1)
})

// @vitest-environment jsdom
/**
 * Island boundaries: each host is its own React root with its own Suspense and
 * error boundary, and a keyed move keeps the root alive.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { createElement, lazy, useState, type ComponentType } from 'react'
import { expect, it, vi } from 'vitest'
import { ReactComponent } from '../src/index.js'
import { click, mount, settle, text } from './foldkit.js'

const Message = defineMessageUnion({
  Toggled: {},
  Crashed: { reason: Schema.String },
})
type Message = typeof Message.Type

const Counter = ({ id }: { readonly id: string }) => {
  const [count, setCount] = useState(0)
  return createElement(
    'button',
    { className: `counter-${id}`, onClick: () => setCount(c => c + 1) },
    `${id}:${count}`,
  )
}
const ReactCounter = ReactComponent.define(Counter)

it('keeps React state through a keyed reorder and isolates sibling islands', async () => {
  const Model = Schema.Struct({ reversed: Schema.Boolean })
  const handle = mount<typeof Model.Type, Message>({
    Model,
    init: { reversed: false },
    update: model => ({ reversed: !model.reversed }),
    view: (model, h) =>
      h.div(
        [],
        [
          h.button([h.Class('toggle'), h.OnClick(Message.Toggled())], []),
          h.div(
            [],
            (model.reversed ? ['b', 'a'] : ['a', 'b']).map(id =>
              ReactCounter.view({ props: { id }, hostAttributes: [h.Key(id)] }, h),
            ),
          ),
        ],
      ),
  })
  try {
    await vi.waitFor(() => expect(text('.counter-a')).toBe('a:0'))
    click('.counter-a')
    click('.counter-a')
    click('.counter-b')
    await vi.waitFor(() => expect(text('.counter-a')).toBe('a:2'))
    expect(text('.counter-b')).toBe('b:1')

    click('.toggle')
    await vi.waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('button[class^=counter]')).map(b => b.textContent),
      ).toEqual(['b:1', 'a:2']),
    )
    await settle()
    expect(text('.counter-a')).toBe('a:2')
    expect(text('.counter-b')).toBe('b:1')
  } finally {
    handle.dispose()
  }
})

it('shows the Suspense fallback until a lazy component resolves', async () => {
  let resolve!: (module: { default: ComponentType<{ readonly name: string }> }) => void
  const Lazy = lazy(
    () =>
      new Promise<{ default: ComponentType<{ readonly name: string }> }>(r => {
        resolve = r
      }),
  )
  const ReactLazy = ReactComponent.define(Lazy)
  const Model = Schema.Struct({})
  const handle = mount<typeof Model.Type, Message>({
    Model,
    init: {},
    update: model => model,
    view: (_, h) =>
      ReactLazy.view(
        {
          props: { name: 'ready' },
          suspenseFallback: createElement('i', { className: 'fallback' }, 'loading'),
        },
        h,
      ),
  })
  try {
    await vi.waitFor(() => expect(text('.fallback')).toBe('loading'))
    resolve({ default: ({ name }) => createElement('b', { className: 'loaded' }, name) })
    await vi.waitFor(() => expect(text('.loaded')).toBe('ready'))
    expect(document.querySelector('.fallback')).toBeNull()
  } finally {
    handle.dispose()
  }
})

it('renders the error fallback and reports the crash as a Message', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Bomb = ({ armed }: { readonly armed: boolean }) => {
    if (armed) throw new Error('boom')
    return createElement('span', { className: 'calm' }, 'calm')
  }
  const ReactBomb = ReactComponent.define(Bomb)
  const Model = Schema.Struct({ armed: Schema.Boolean, crashes: Schema.Array(Schema.String) })
  const handle = mount<typeof Model.Type, Message>({
    Model,
    init: { armed: false, crashes: [] },
    update: (model, message) =>
      message._tag === 'Toggled'
        ? { ...model, armed: !model.armed }
        : { ...model, crashes: [...model.crashes, message.reason] },
    view: (model, h) =>
      h.div(
        [],
        [
          h.button([h.Class('arm'), h.OnClick(Message.Toggled())], []),
          h.p([h.Class('crashes')], [model.crashes.join(',')]),
          ReactBomb.view(
            {
              props: { armed: model.armed },
              errorBoundary: {
                fallback: error =>
                  createElement('em', { className: 'crashed' }, (error as Error).message),
                toMessage: error => Message.Crashed({ reason: (error as Error).message }),
              },
            },
            h,
          ),
        ],
      ),
  })
  try {
    await vi.waitFor(() => expect(text('.calm')).toBe('calm'))
    click('.arm')
    await vi.waitFor(() => expect(text('.crashed')).toBe('boom'))
    await vi.waitFor(() => expect(text('.crashes')).toBe('boom'))
    await settle()
    expect(text('.crashes')).toBe('boom')
  } finally {
    handle.dispose()
    vi.restoreAllMocks()
  }
})

it('routes an island event through the Submodel boundary it renders in', async () => {
  const ChildMessage = defineMessageUnion({ Picked: { value: Schema.String } })
  type ChildMessage = typeof ChildMessage.Type
  const ParentMessage = defineMessageUnion({ GotChild: { value: Schema.String } })
  type ParentMessage = typeof ParentMessage.Type

  const Button = ({ onPick }: { readonly onPick?: (value: string) => void }) =>
    createElement('button', { className: 'child-pick', onClick: () => onPick?.('x') }, 'pick')
  const ReactButton = ReactComponent.define(Button, { events: ['onPick'] })
  const childView = Submodel.defineView<null, ChildMessage>((_, h) =>
    ReactButton.view({ messages: { onPick: value => ChildMessage.Picked({ value }) } }, h),
  )

  const Model = Schema.Struct({ log: Schema.Array(Schema.String) })
  const handle = mount<typeof Model.Type, ParentMessage>({
    Model,
    init: { log: [] },
    update: (model, message) => ({ log: [...model.log, `${message._tag}:${message.value}`] }),
    view: (model, h) =>
      h.div(
        [],
        [
          h.p([h.Class('parent-log')], [model.log.join(',')]),
          h.submodel({
            slotId: 'picker',
            model: null,
            view: childView,
            toParentMessage: message =>
              ParentMessage.GotChild({ value: `lifted-${message.value}` }),
          }),
        ],
      ),
  })
  try {
    await vi.waitFor(() => expect(text('.child-pick')).toBe('pick'))
    click('.child-pick')
    await vi.waitFor(() => expect(text('.parent-log')).toBe('GotChild:lifted-x'))
  } finally {
    handle.dispose()
  }
})

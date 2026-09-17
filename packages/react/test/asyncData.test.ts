// @vitest-environment jsdom
/**
 * `readAsyncData` lets an island suspend on the Model's AsyncData: the Foldkit
 * update owns every transition, and React only interprets the current value.
 */
import { Option, Schema } from 'effect'
import * as AsyncData from 'foldkit/asyncData'
import { defineMessageUnion } from 'foldkit/message'
import { Suspense, createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AsyncDataFailure, ReactComponent, readAsyncData } from '../src/index.js'
import { click, mount, settle, text } from './foldkit.js'

const User = AsyncData.Schema(Schema.String, Schema.String)
const Model = Schema.Struct({ user: User.schema, crashes: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Loaded: {},
  Refreshed: {},
  RefreshFailed: {},
  Failed: {},
  Crashed: { reason: Schema.String },
})
type Message = typeof Message.Type

let profileRenders = 0

const Profile = ({ user }: { readonly user: AsyncData.AsyncData<string, string> }) => {
  const { data, isRefreshing, maybeStaleError } = readAsyncData(user)
  profileRenders++
  return createElement(
    'p',
    { className: 'profile' },
    [data, isRefreshing ? 'refreshing' : undefined, Option.getOrUndefined(maybeStaleError)]
      .filter(Boolean)
      .join(' / '),
  )
}
const ReactProfile = ReactComponent.define(Profile)

const update = (model: Model, message: Message): Model => {
  switch (message._tag) {
    case 'Loaded':
      return { ...model, user: AsyncData.succeed('Ada') }
    case 'Refreshed':
      return { ...model, user: AsyncData.Refreshing({ data: 'Ada' }) }
    case 'RefreshFailed':
      return { ...model, user: AsyncData.Stale({ data: 'Ada', error: 'timeout' }) }
    case 'Failed':
      return { ...model, user: AsyncData.fail('not found') }
    case 'Crashed':
      return { ...model, crashes: [...model.crashes, message.reason] }
  }
}

it('suspends while loading, keeps data through refresh and stale, and reports failure', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const handle = mount<Model, Message>({
    Model,
    init: { user: AsyncData.Loading(), crashes: [] },
    update,
    view: (model, h) =>
      h.div(
        [],
        [
          ...(['Loaded', 'Refreshed', 'RefreshFailed', 'Failed'] as const).map(tag =>
            h.button([h.Class(tag), h.OnClick(Message[tag]())], []),
          ),
          h.p([h.Class('crashes')], [model.crashes.join(',')]),
          ReactProfile.view(
            {
              props: { user: model.user },
              suspenseFallback: createElement('i', { className: 'profile' }, 'loading'),
              errorBoundary: {
                fallback: error =>
                  createElement(
                    'em',
                    { className: 'profile' },
                    error instanceof AsyncDataFailure ? `failed: ${error.error}` : 'crashed',
                  ),
                toMessage: error =>
                  Message.Crashed({
                    reason: error instanceof AsyncDataFailure ? String(error.error) : 'other',
                  }),
              },
            },
            h,
          ),
        ],
      ),
  })
  try {
    await vi.waitFor(() => expect(text('.profile')).toBe('loading'))
    expect(profileRenders).toBe(0)

    click('.Loaded')
    await vi.waitFor(() => expect(text('.profile')).toBe('Ada'))

    click('.Refreshed')
    await vi.waitFor(() => expect(text('.profile')).toBe('Ada / refreshing'))

    click('.RefreshFailed')
    await vi.waitFor(() => expect(text('.profile')).toBe('Ada / timeout'))

    click('.Failed')
    await vi.waitFor(() => expect(text('.profile')).toBe('failed: not found'))
    await vi.waitFor(() => expect(text('.crashes')).toBe('not found'))
    await settle()
    expect(text('.crashes')).toBe('not found')
  } finally {
    handle.dispose()
    vi.restoreAllMocks()
  }
})

it('returns data without suspending for every state that has data', () => {
  expect(readAsyncData(AsyncData.succeed(1))).toEqual({
    data: 1,
    isRefreshing: false,
    maybeStaleError: Option.none(),
  })
  expect(readAsyncData(AsyncData.Stale({ data: 1, error: 'e' })).maybeStaleError).toEqual(
    Option.some('e'),
  )
  expect(() => readAsyncData(AsyncData.Idle())).toThrow(expect.any(Promise))
})

it('retries when the next value arrives as React state, as an outbound Port value does', async () => {
  let publish!: (user: AsyncData.AsyncData<string, string>) => void
  const Reader = ({ user }: { readonly user: AsyncData.AsyncData<string, string> }) =>
    createElement('b', { className: 'reader' }, readAsyncData(user).data)
  const App = () => {
    const [user, setUser] = useState<AsyncData.AsyncData<string, string>>(AsyncData.Loading())
    useEffect(() => {
      publish = setUser
    }, [])
    return createElement(
      Suspense,
      { fallback: createElement('i', { className: 'reader' }, 'waiting') },
      createElement(Reader, { user }),
    )
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(createElement(App))
  try {
    await vi.waitFor(() => expect(text('.reader')).toBe('waiting'))
    publish(AsyncData.succeed('Grace'))
    await vi.waitFor(() => expect(text('.reader')).toBe('Grace'))
  } finally {
    root.unmount()
  }
})

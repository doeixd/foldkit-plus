import { Option } from 'effect'
import type { Url } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { AppRoute, Message, type Model, init, update } from '../src/main.js'
import { aboutRouter, homeRouter } from '../src/route.js'

const urlAt = (pathname: string): Url => ({
  protocol: 'https:',
  host: 'example.com',
  port: Option.none(),
  pathname,
  search: Option.none(),
  hash: Option.none(),
})

const on = (route: AppRoute): Model => ({ route, count: 0, posts: [] })

describe('routes', () => {
  test.each([
    ['/', AppRoute.Home()],
    ['/about', AppRoute.About()],
    ['/missing', AppRoute.NotFound({ path: '/missing' })],
  ])('%s starts on %o with no count', (pathname, route) => {
    expect(init(urlAt(pathname)).model).toEqual({ route, count: 0, posts: [] })
  })

  test('each router prints the address it parses', () => {
    expect([homeRouter(), aboutRouter()]).toEqual(['/', '/about'])
  })
})

describe('update', () => {
  test('ClickedIncrement counts', () => {
    expect(update(on(AppRoute.Home()), Message.ClickedIncrement()).model.count).toBe(1)
  })

  test('ChangedUrl for the route the Model shows returns the same Model', () => {
    const model = { route: AppRoute.About(), count: 2, posts: [] }
    const next = update(model, Message.ChangedUrl({ url: urlAt('/about') }))
    expect(next.model).toBe(model)
    expect(next.commands ?? []).toEqual([])
  })

  test('ChangedUrl for another route moves there and keeps the count', () => {
    const model = { route: AppRoute.About(), count: 2, posts: [] }
    expect(update(model, Message.ChangedUrl({ url: urlAt('/') })).model).toEqual({
      route: AppRoute.Home(),
      count: 2,
      posts: [],
    })
  })

  test.each([
    [
      Message.ClickedLink({ request: { _tag: 'Internal', url: urlAt('/about') } }),
      'NavigateInternal',
    ],
    [
      Message.ClickedLink({ request: { _tag: 'External', href: 'https://foldkit.dev' } }),
      'LoadExternal',
    ],
  ])('%o leaves the Model and runs %s', (message, command) => {
    const model = on(AppRoute.Home())
    const next = update(model, message)
    expect(next.model).toBe(model)
    expect((next.commands ?? []).map(each => each.name)).toEqual([command])
  })
})

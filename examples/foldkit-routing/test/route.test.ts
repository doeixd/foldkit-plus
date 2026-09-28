import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { AppRoute, Message, routeTitle, update } from '../src/main.js'
import {
  filesIndexRouter,
  filesRouter,
  homeRouter,
  nestedRouter,
  peopleRouter,
  personRouter,
  urlToAppRoute,
} from '../src/route.js'
import { on, urlOrThrow } from './helpers.js'

const routes: ReadonlyArray<readonly [path: string, route: AppRoute, title: string]> = [
  ['/', AppRoute.Home(), 'Routing'],
  ['/people', AppRoute.People({ searchText: Option.none() }), 'People | Routing'],
  [
    '/people?searchText=ali',
    AppRoute.People({ searchText: Option.some('ali') }),
    'People | Routing',
  ],
  ['/people/2', AppRoute.Person({ personId: 2 }), 'Person 2 | Routing'],
  ['/people/two', AppRoute.NotFound({ path: '/people/two' }), 'NotFound | Routing'],
  ['/files', AppRoute.FilesIndex(), 'Files | Routing'],
  [
    '/files/photos/vacation/beach.jpg',
    AppRoute.Files({ path: ['photos', 'vacation', 'beach.jpg'] }),
    'beach.jpg | Files | Routing',
  ],
  ['/nested/route/is/very/nested', AppRoute.Nested(), 'Nested | Routing'],
  ['/nested/route', AppRoute.NotFound({ path: '/nested/route' }), 'NotFound | Routing'],
  ['/missing', AppRoute.NotFound({ path: '/missing' }), 'NotFound | Routing'],
]

describe('routes', () => {
  test.each(routes)('%s parses to its route', (path, route) => {
    expect(urlToAppRoute(urlOrThrow(`http://localhost${path}`))).toStrictEqual(route)
  })

  test.each(routes)('%s titles the page', (_path, route, title) => {
    expect(routeTitle(route)).toBe(title)
  })

  test.each([
    ['home', homeRouter(), '/'],
    ['people', peopleRouter({ searchText: Option.some('ali') }), '/people?searchText=ali'],
    ['person', personRouter({ personId: 2 }), '/people/2'],
    ['files index', filesIndexRouter(), '/files'],
    ['files', filesRouter({ path: ['documents', 'taxes'] }), '/files/documents/taxes'],
    ['nested', nestedRouter(), '/nested/route/is/very/nested'],
  ])('the %s router prints %s', (_name, printed, expected) => {
    expect(printed).toBe(expected)
  })
})

describe('ChangedUrl for the route the Model already shows', () => {
  test.each(routes)('%s leaves the Model as it is and fetches nothing', (path, route) => {
    const model = on(route)
    const result = update(model, Message.ChangedUrl({ url: urlOrThrow(`http://localhost${path}`) }))
    expect(result.model).toBe(model)
    expect(result.commands ?? []).toEqual([])
  })
})

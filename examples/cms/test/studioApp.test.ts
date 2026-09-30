// @vitest-environment jsdom
/**
 * The studio as one application: the pathname picks the section, a switch
 * drops the `new` the other section named, and a link the chair cannot follow
 * is a full load. Each section keeps its own Model, update and subscriptions.
 */
import { Effect, Option } from 'effect'
import type { Url } from 'foldkit/url'
import { describe, expect, it } from 'vitest'
import * as Posts from '../src/apps/app.js'
import { PageEditor } from '../src/apps/pageApp.js'
import {
  Message,
  init,
  navigateSearch,
  sectionOf,
  update,
  withoutNew,
  type Model,
} from '../src/apps/studioApp.js'

const urlOf = (pathname: string, search = ''): Url => ({
  protocol: 'http:',
  host: 'studio',
  port: Option.none(),
  pathname,
  search: search === '' ? Option.none() : Option.some(search),
  hash: Option.none(),
})

const boot = (pathname: string, search = ''): Model => init(urlOf(pathname, search)).model

const changed = (model: Model, pathname: string, search = ''): Model =>
  update(model, Message.UrlChanged({ url: urlOf(pathname, search) })).model

const commanded = (model: Model, message: Message): ReadonlyArray<string> =>
  (
    update(model, message) as {
      readonly commands?: ReadonlyArray<{ readonly name: string }> | undefined
    }
  ).commands?.map(command => command.name) ?? []

describe('navigateSearch', () => {
  it('carries the current query into the target, which wins ties', () => {
    const merged = navigateSearch('as=edda&q=milk', urlOf('/pages', 'as=wren'), true)
    expect(merged.pathname).toBe('/pages')
    expect(merged.search).toEqual(Option.some('as=wren&q=milk'))
  })

  it('drops a `new` that names the section left behind', () => {
    const merged = navigateSearch('as=wren&new=e1', urlOf('/pages', 'as=wren'), true)
    expect(merged.search).toEqual(Option.some('as=wren'))
  })

  it('drops a carried `new` from the navigated address on a cross-section link', async () => {
    const here = window.location.host
    const target: Url = {
      protocol: 'http:',
      host: here,
      port: Option.none(),
      pathname: '/pages',
      search: Option.some('as=wren'),
      hash: Option.none(),
    }
    const model = changed(boot('/'), '/', 'as=wren&q=milk&new=e1')
    expect(model.query).toContain('new=e1')
    const result = update(
      model,
      Message.UrlRequested({ request: { _tag: 'Internal', url: target } }),
    ) as {
      readonly commands?: ReadonlyArray<{
        readonly name: string
        readonly effect: Effect.Effect<void>
      }>
    }
    const [navigate] = result.commands ?? []
    expect(navigate?.name).toBe('Navigate')
    await Effect.runPromise(navigate!.effect)
    expect(window.location.pathname).toBe('/pages')
    expect(window.location.search).toContain('q=milk')
    expect(window.location.search).not.toContain('new=')
    window.history.replaceState(null, '', '/')
  })

  it('pushes the merged address on a same-document navigation', async () => {
    const here = window.location.host
    const target: Url = {
      protocol: 'http:',
      host: here,
      port: Option.none(),
      pathname: '/pages',
      search: Option.some('as=wren'),
      hash: Option.none(),
    }
    const model = changed(boot('/'), '/', 'as=wren&q=milk')
    const result = update(
      model,
      Message.UrlRequested({ request: { _tag: 'Internal', url: target } }),
    ) as {
      readonly commands?: ReadonlyArray<{
        readonly name: string
        readonly effect: Effect.Effect<void>
      }>
    }
    const [navigate] = result.commands ?? []
    expect(navigate?.name).toBe('Navigate')
    await Effect.runPromise(navigate!.effect)
    expect(window.location.pathname).toBe('/pages')
    expect(window.location.search).toContain('q=milk')
    window.history.replaceState(null, '', '/')
  })
})

describe('sectionOf', () => {
  it('names the posts, the pages, and nothing else', () => {
    expect(sectionOf('/')).toEqual(Option.some('posts'))
    expect(sectionOf('/pages')).toEqual(Option.some('pages'))
    expect(sectionOf('/pages/e1')).toEqual(Option.some('pages'))
    expect(sectionOf('/site')).toEqual(Option.none())
    expect(sectionOf('/pagesfoo')).toEqual(Option.none())
  })
})

describe('the studio application', () => {
  it('boots each section from its address, with its chair', () => {
    expect(boot('/').section).toBe('posts')
    expect(boot('/pages').section).toBe('pages')
    expect(boot('/pages', 'as=edda').chair).toBe('edda')
    expect(boot('/unknown')).toMatchObject({ section: 'posts' })
  })

  it('boots a cross-section `new` address without opening it in the hidden section', () => {
    const pages = boot('/pages', 'new=e9')
    expect(pages.section).toBe('pages')
    expect(Posts.PostEditor.entry(pages.posts)).toEqual(Option.none())
    const posts = boot('/', 'new=e1')
    expect(posts.section).toBe('posts')
    expect(PageEditor.entry(posts.pages)).toEqual(Option.none())
  })

  it('keeps the Model identical on an address echo', () => {
    const model = boot('/')
    expect(update(model, Message.UrlChanged({ url: urlOf('/', '') })).model).toBe(model)
  })

  it('folds a hidden section’s message into that section only', () => {
    const model = changed(boot('/'), '/pages')
    expect(model.section).toBe('pages')
    const next = update(
      model,
      Message.GotPostsMessage({
        message: Posts.Message.TypedSchedule({ text: '2026-10-01T09:00' }),
      }),
    ).model
    expect(next.posts.scheduleAt).toBe('2026-10-01T09:00')
    expect(next.posts).not.toBe(model.posts)
    expect(next.pages).toBe(model.pages)
  })

  it('moves between sections without losing either section’s Model', () => {
    const posts = changed(boot('/'), '/', 'q=milk')
    expect(posts.posts.search).toBe('milk')
    const pages = changed(posts, '/pages')
    expect(pages.section).toBe('pages')
    // Still there while away: a remount would have lost it with the Model.
    expect(pages.posts.search).toBe('milk')
    // Back without the query, the narrowing follows the address again.
    expect(changed(pages, '/').posts.search).toBe('')
  })

  it('keeps what only the Model holds across a switch', () => {
    const typed = update(
      boot('/'),
      Message.GotPostsMessage({
        message: Posts.Message.TypedSchedule({ text: '2026-10-01T09:00' }),
      }),
    ).model
    expect(typed.posts.scheduleAt).toBe('2026-10-01T09:00')
    const back = changed(changed(typed, '/pages'), '/')
    expect(back.posts.scheduleAt).toBe('2026-10-01T09:00')
  })

  it('drops the `new` another section named on a switch', () => {
    const posts = changed(boot('/'), '/', 'new=e1')
    const pages = changed(posts, '/pages')
    expect(pages.section).toBe('pages')
    // The pages editor did not open the posts' new entry as a page.
    expect(PageEditor.entry(pages.pages)).toEqual(Option.none())
    const cleaned = withoutNew(urlOf('/pages', 'as=edda&new=e1'))
    expect(cleaned.search).toEqual(Option.some('as=edda'))
    expect(withoutNew(urlOf('/pages', 'as=edda'))).toEqual(urlOf('/pages', 'as=edda'))
  })

  it('loads another chair and another application instead of navigating', () => {
    const model = boot('/', 'as=wren')
    expect(
      commanded(
        model,
        Message.UrlRequested({
          request: { _tag: 'Internal', url: urlOf('/pages', 'as=wren') },
        }),
      ),
    ).toEqual(['Navigate'])
    expect(
      commanded(
        model,
        Message.UrlRequested({
          request: { _tag: 'Internal', url: urlOf('/pages', 'as=edda') },
        }),
      ),
    ).toEqual(['FollowLink'])
    expect(
      commanded(
        model,
        Message.UrlRequested({ request: { _tag: 'External', href: 'https://example.test' } }),
      ),
    ).toEqual(['FollowLink'])
  })
})

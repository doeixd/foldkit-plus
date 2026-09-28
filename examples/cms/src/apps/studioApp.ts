/**
 * The studio as one application: the posts and the pages sections share a
 * document, a runtime and an address, and moving between them swaps no
 * application. Each section stays exactly as it was — its own Model, update,
 * view and subscriptions — and this module only routes: the pathname picks
 * the section, a same-document navigation carries the address's query into
 * its target (dropping the `new` the other section named on a switch), and
 * a link the chair cannot follow is a full load.
 *
 * Two Remote domains share no tags to tell their Messages apart, so each
 * section folds its own (its placements route them inside its update, as
 * before); the subscriptions are lifted here with a section gate, so only
 * the shown section fetches. A closed gate tears its entries down, as a
 * remount did. An in-flight Command that lands after a switch still folds
 * into the section that started it: request ids carry their domain's name.
 */
import { Effect, Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import { Update } from 'foldkit'
import * as Submodel from 'foldkit/submodel'
import { Url, toString as urlToString } from 'foldkit/url'
import * as Posts from './app.js'
import * as Pages from './pageApp.js'
import { chairOf } from '../server/transport.js'
import { Page as PagesShell, titleOf as pagesTitle } from '../views/pagesView.js'
import { Studio as PostsShell, titleOf as postsTitle } from '../views/view.js'

export type Section = 'posts' | 'pages'

export const Model = Schema.Struct({
  section: Schema.Literals(['posts', 'pages']),
  chair: Schema.Literals(['wren', 'edda', 'visitor']),
  /** The address's raw query, so same-document navigation can carry context across. */
  query: Schema.String,
  posts: Posts.Model,
  pages: Pages.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotPostsMessage: { message: Posts.Message },
  GotPagesMessage: { message: Pages.Message },
  /** The address changed: a link, back or forward, or the studio's own write. */
  UrlChanged: { url: Url },
  /** A link was followed. */
  UrlRequested: { request: Navigation.UrlRequest },
  /** Nothing happened; something may have arrived. */
  Ticked: {},
})
export type Message = typeof Message.Type

/** The section a pathname names, if it names one. */
export const sectionOf = (pathname: string): Option.Option<Section> =>
  pathname === '/'
    ? Option.some('posts')
    : pathname.startsWith('/pages')
      ? Option.some('pages')
      : Option.none()

const foldPosts = Update.foldChild({
  update: Posts.update,
  read: (model: Model) => Option.some(model.posts),
  write: (model, posts) =>
    posts === model.posts ? model : modifyFields(model, { posts: () => posts }),
  toParentMessage: message => Message.GotPostsMessage({ message }),
})

const foldPages = Update.foldChild({
  update: Pages.update,
  read: (model: Model) => Option.some(model.pages),
  write: (model, pages) =>
    pages === model.pages ? model : modifyFields(model, { pages: () => pages }),
  toParentMessage: message => Message.GotPagesMessage({ message }),
})

/**
 * The target of a same-document navigation with the current address's query
 * carried over, the target winning where both name a key. Section links name
 * only their section, so without this a switch would drop what the address
 * remembers (the worklist's narrowing, an open entry). `new` is the one key
 * that must not cross: it names an unsaved entry of the section left behind.
 */
export const navigateSearch = (query: string, target: Url, dropNew: boolean): Url => {
  const params = new URLSearchParams(query)
  for (const [key, value] of new URLSearchParams(Option.getOrElse(target.search, () => '')))
    params.set(key, value)
  if (dropNew) params.delete('new')
  const text = params.toString()
  return { ...target, search: text === '' ? Option.none() : Option.some(text) }
}

/**
 * The address without the `new` another section named: `new` is the one key
 * both sections write, so a switch drops it (the section it named keeps its
 * pending `fresh` in its Model, and writes it back if it is still waiting).
 * Navigation already drops it; this covers Back, reloads and hand-typed
 * addresses, which arrive without going through a link.
 */
export const withoutNew = (url: Url): Url => navigateSearch('', url, true)

const followLoad = (href: string) => ({
  commands: [
    {
      name: 'FollowLink',
      effect: Navigation.load(href).pipe(Effect.as(Message.Ticked())),
    },
  ],
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    GotPostsMessage: ({ message }) => foldPosts(model, message),
    GotPagesMessage: ({ message }) => foldPages(model, message),
    Ticked: () => ({ model }),
    UrlChanged: ({ url }) => {
      const section = Option.getOrElse(sectionOf(url.pathname), () => model.section)
      const chair = chairOf(
        Option.getOrElse(url.search, () => ''),
        'wren',
      )
      const query = Option.getOrElse(url.search, () => '')
      const at = { ...model, section, chair, query }
      // A section only ever sees its own address: what it has open stays open.
      const clean = section === model.section ? url : withoutNew(url)
      return section === 'pages'
        ? foldPages(at, Pages.Message.UrlChanged({ url: clean }))
        : foldPosts(at, Posts.Message.UrlChanged({ url: clean }))
    },
    UrlRequested: ({ request }) => {
      if (request._tag === 'External') return { ...followLoad(request.href), model }
      const target = request.url
      // Another chair is another transport, and another application another
      // document: both are still a full load.
      const sameReader =
        Option.isSome(sectionOf(target.pathname)) &&
        chairOf(
          Option.getOrElse(target.search, () => ''),
          model.chair,
        ) === model.chair
      if (!sameReader) return { ...followLoad(urlToString(target)), model }
      const section = Option.getOrElse(sectionOf(target.pathname), () => model.section)
      const merged = navigateSearch(model.query, target, section !== model.section)
      return {
        model,
        commands: [
          {
            name: 'Navigate',
            effect: Navigation.pushUrl(urlToString(merged)).pipe(Effect.as(Message.Ticked())),
          },
        ],
      }
    },
  })

/** A Remote wiring's subscriptions, which a wiring may leave out. */
const remoteSubscriptions = <
  S extends Record<string, Subscription.Subscription<any, any, any, any>>,
>(wiring: {
  readonly subscriptions?: S | undefined
}): S => {
  if (wiring.subscriptions === undefined) throw new Error('a Remote wiring without subscriptions')
  return wiring.subscriptions
}

/** What the studio writes into the address: each section's own writers, behind its section. */
const gate =
  (section: Section) =>
  (model: Model): boolean =>
    model.section === section

const prefixed = <
  Entries extends Record<string, Subscription.Subscription<Model, Message, any, any>>,
>(
  entries: Entries,
  prefix: string,
) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [`${prefix}.${key}`, entry]),
  ) as {
    [K in keyof Entries as `${string}.${K & string}`]: Entries[K]
  }

const postsAddress = Subscription.lift(Posts.address)({
  toChildModel: (model: Model) => model.posts,
  toParentMessage: (message: Posts.Message) => Message.GotPostsMessage({ message }),
  when: gate('posts'),
})

const postsRemote = Subscription.lift(remoteSubscriptions(Posts.Data.wiring(Posts.actives)))({
  toChildModel: (model: Model) => model.posts,
  toParentMessage: (message: Posts.Message) => Message.GotPostsMessage({ message }),
  when: gate('posts'),
})

const postsEditor = Subscription.lift(Posts.EditorSlot.subscriptions)({
  toChildModel: (model: Model) => model.posts,
  toParentMessage: (message: Posts.Message) => Message.GotPostsMessage({ message }),
  when: gate('posts'),
})

const pagesAddress = Subscription.lift(Pages.address)({
  toChildModel: (model: Model) => model.pages,
  toParentMessage: (message: Pages.Message) => Message.GotPagesMessage({ message }),
  when: gate('pages'),
})

const pagesRemote = Subscription.lift(remoteSubscriptions(Pages.Data.wiring(Pages.actives)))({
  toChildModel: (model: Model) => model.pages,
  toParentMessage: (message: Pages.Message) => Message.GotPagesMessage({ message }),
  when: gate('pages'),
})

const pagesEditor = Subscription.lift(Pages.EditorSlot.subscriptions)({
  toChildModel: (model: Model) => model.pages,
  toParentMessage: (message: Pages.Message) => Message.GotPagesMessage({ message }),
  when: gate('pages'),
})

export const subscriptions = {
  ...prefixed(postsAddress, 'posts'),
  ...prefixed(postsRemote, 'posts.remote'),
  ...prefixed(postsEditor, 'posts.editor'),
  ...prefixed(pagesAddress, 'pages'),
  ...prefixed(pagesRemote, 'pages.remote'),
  ...prefixed(pagesEditor, 'pages.editor'),
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: model.section === 'pages' ? pagesTitle(model.pages) : postsTitle(model.posts),
  body:
    model.section === 'pages'
      ? h.submodel({
          slotId: 'pages',
          model: model.pages,
          view: Submodel.defineView<Pages.Model, Pages.Message>((page, draw) =>
            PagesShell(page, draw),
          ),
          toParentMessage: message => Message.GotPagesMessage({ message }),
        })
      : h.submodel({
          slotId: 'posts',
          model: model.posts,
          view: Submodel.defineView<Posts.Model, Posts.Message>((post, draw) =>
            PostsShell(post, draw),
          ),
          toParentMessage: message => Message.GotPostsMessage({ message }),
        }),
})

export const init = (url: Url) => {
  const section = Option.getOrElse(sectionOf(url.pathname), (): Section => 'posts')
  const chair = chairOf(
    Option.getOrElse(url.search, () => ''),
    'wren',
  )
  const query = Option.getOrElse(url.search, () => '')
  const posts = Posts.init(url)
  const pages = Pages.update(Pages.initial, Pages.Message.UrlChanged({ url }))
  return {
    model: { section, chair, query, posts: posts.model, pages: pages.model },
    commands: [
      ...mapMessages(posts.commands, message => Message.GotPostsMessage({ message })),
      ...mapMessages(pages.commands, message => Message.GotPagesMessage({ message })),
    ],
  }
}

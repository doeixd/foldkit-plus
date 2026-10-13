/**
 * The studio as one application: the posts and the pages sections share a
 * document, a runtime and an address, and moving between them swaps no
 * application. Each section stays exactly as it was — its own Model, update,
 * view and subscriptions — and this module only routes: the pathname picks
 * the section, a same-document navigation carries the address's query into
 * its target (dropping the `new` the other section named on a switch), and
 * a link the chair cannot follow is a full load.
 *
 * The two sections' Messages stay apart because each arrives wrapped:
 * GotPostsMessage folds only into the posts Model through the posts update,
 * and GotPagesMessage only into the pages Model through the pages update.
 * The subscriptions are lifted here with a section gate, so only
 * the shown section fetches. A closed gate tears its entries down, as a
 * remount did. An in-flight Command that lands after a switch still folds
 * into the section that started it: its wrapper names that section.
 */
import { Effect, Equal, Option, Schema, Stream } from 'effect'
import { Link } from 'foldkit-bundle'
import { mapMessage, mapMessages } from 'foldkit/command'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import * as Subscription from 'foldkit/subscription'
import { Url, toString as urlToString } from 'foldkit/url'
import { keepScroll, pointedLinks } from 'foldkit-primitives/dom'
import * as Posts from './app.js'
import * as Pages from './pageApp.js'
import { type Section, sectionOf } from '../routing/studioRoutes.js'
import { chairOf } from '../server/transport.js'
import { Page as PagesShell, titleOf as pagesTitle } from '../views/pagesView.js'
import { Studio as PostsShell, titleOf as postsTitle } from '../views/view.js'

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
  /** The reader is over, or on, a link: where they may go next. */
  PointedAtLink: { url: Url },
  /** Nothing happened; something may have arrived. */
  Ticked: {},
})
export type Message = typeof Message.Type

/**
 * Each section stated once: the Link names its field and wrapper, the
 * section's update folds through it, and its shell draws through the same
 * slot. The fold and the drawing cannot disagree on either.
 */
const postsLink = Link.field<Model>()('posts', Link.wrapper(Message.GotPostsMessage))
const pagesLink = Link.field<Model>()('pages', Link.wrapper(Message.GotPagesMessage))

const posts = Link.child(postsLink, Posts.update, (page, draw) => PostsShell(page, draw), 'posts')
const pages = Link.child(pagesLink, Pages.update, (page, draw) => PagesShell(page, draw), 'pages')

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

/**
 * The section a link opens in this document, or none when following it is a
 * full load: another application, or another chair, which is another
 * transport.
 */
const sectionFor = (model: Model, target: Url): Option.Option<Section> =>
  Option.filter(
    sectionOf(target),
    () =>
      chairOf(
        Option.getOrElse(target.search, () => ''),
        model.chair,
      ) === model.chair,
  )

/**
 * Reads what a section will read at an address, into that section's Model as
 * it is when the reads land, so following the link draws at once. The
 * section's own `UrlChanged` says where it would be there; only its reads
 * are kept, not the move.
 */
const preloadAt = (model: Model, section: Section, url: Url) =>
  section === 'pages'
    ? mapMessage(
        Pages.Data.preload(
          Pages.update(model.pages, Pages.Message.UrlChanged({ url })).model,
          Pages.actives,
        ),
        message => Message.GotPagesMessage({ message }),
      )
    : mapMessage(
        Posts.Data.preload(
          Posts.update(model.posts, Posts.Message.UrlChanged({ url })).model,
          Posts.actives,
        ),
        message => Message.GotPostsMessage({ message }),
      )

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
    GotPostsMessage: ({ message }) => posts.update(model, message),
    GotPagesMessage: ({ message }) => pages.update(model, message),
    Ticked: () => ({ model }),
    UrlChanged: ({ url }) => {
      const section = Option.getOrElse(sectionOf(url), () => model.section)
      const chair = chairOf(
        Option.getOrElse(url.search, () => ''),
        'wren',
      )
      const query = Option.getOrElse(url.search, () => '')
      // The address is rewritten on every keystroke and echoed back: keep the
      // fields (and the object) when the echo says nothing new, so the runtime
      // can skip the render.
      const at =
        section === model.section && chair === model.chair && query === model.query
          ? model
          : { ...model, section, chair, query }
      // A section only ever sees its own address, so a switch never closes
      // what the hidden section has open: its entry and its draft stay intact.
      const clean = section === model.section ? url : withoutNew(url)
      const folded =
        section === 'pages'
          ? pages.update(at, Pages.Message.UrlChanged({ url: clean }))
          : posts.update(at, Posts.Message.UrlChanged({ url: clean }))
      // The sections always rebuild on UrlChanged, so reference equality never
      // reports an echo: compare by value, and hand back the Model itself when
      // the echo changed nothing (commands would carry the change, so require
      // none).
      if (at === model && (folded.commands ?? []).length === 0) {
        const child = section === 'pages' ? folded.model.pages : folded.model.posts
        const prior = section === 'pages' ? model.pages : model.posts
        if (Equal.equals(child, prior)) return { ...folded, model }
      }
      return folded
    },
    UrlRequested: ({ request }) => {
      if (request._tag === 'External') return { ...followLoad(request.href), model }
      const target = request.url
      return Option.match(sectionFor(model, target), {
        onNone: () => ({ ...followLoad(urlToString(target)), model }),
        onSome: section => {
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
    },
    // Reads what the section there will read, so it draws at once if the reader goes.
    PointedAtLink: ({ url }) =>
      Option.match(sectionFor(model, url), {
        onNone: () => ({ model }),
        onSome: section => ({
          model,
          commands: [
            preloadAt(model, section, navigateSearch(model.query, url, section !== model.section)),
          ],
        }),
      }),
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

/**
 * What the studio writes into the address: each section's own writers, behind
 * its section. Without the gate a hidden section would keep writing the keys
 * it shows (`new` among them) and fight the shown section over the address.
 */
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
  read: (model: Model) => Option.some(model.posts),
  toParentMessage: (message: Posts.Message) => Message.GotPostsMessage({ message }),
  when: gate('posts'),
})

const postsRemote = Subscription.lift(remoteSubscriptions(Posts.Data.wiring(Posts.actives)))({
  read: (model: Model) => Option.some(model.posts),
  toParentMessage: (message: Posts.Message) => Message.GotPostsMessage({ message }),
  when: gate('posts'),
})

const postsEditor = Subscription.lift(Posts.EditorSlot.subscriptions)({
  read: (model: Model) => Option.some(model.posts),
  toParentMessage: (message: Posts.Message) => Message.GotPostsMessage({ message }),
  when: gate('posts'),
})

const pagesAddress = Subscription.lift(Pages.address)({
  read: (model: Model) => Option.some(model.pages),
  toParentMessage: (message: Pages.Message) => Message.GotPagesMessage({ message }),
  when: gate('pages'),
})

const pagesRemote = Subscription.lift(remoteSubscriptions(Pages.Data.wiring(Pages.actives)))({
  read: (model: Model) => Option.some(model.pages),
  toParentMessage: (message: Pages.Message) => Message.GotPagesMessage({ message }),
  when: gate('pages'),
})

const pagesEditor = Subscription.lift(Pages.EditorSlot.subscriptions)({
  read: (model: Model) => Option.some(model.pages),
  toParentMessage: (message: Pages.Message) => Message.GotPagesMessage({ message }),
  when: gate('pages'),
})

export const subscriptions = {
  // The window's scroll across the studio's navigations, kept while it runs.
  ...Subscription.make<Model, Message>()(() => ({
    scroll: Subscription.persistentEntry(keepScroll()),
    // Where the reader may go next, read ahead (`PointedAtLink`).
    pointing: Subscription.persistentEntry(
      Stream.map(pointedLinks(), url => Message.PointedAtLink({ url })),
    ),
  })),
  ...prefixed(postsAddress, 'posts'),
  ...prefixed(postsRemote, 'posts.remote'),
  ...prefixed(postsEditor, 'posts.editor'),
  ...prefixed(pagesAddress, 'pages'),
  ...prefixed(pagesRemote, 'pages.remote'),
  ...prefixed(pagesEditor, 'pages.editor'),
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: model.section === 'pages' ? pagesTitle(model.pages) : postsTitle(model.posts),
  body: model.section === 'pages' ? pages.view(model, h) : posts.view(model, h),
})

export const init = (url: Url) => {
  const section = Option.getOrElse(sectionOf(url), (): Section => 'posts')
  const chair = chairOf(
    Option.getOrElse(url.search, () => ''),
    'wren',
  )
  const query = Option.getOrElse(url.search, () => '')
  // Like update above: the shown section boots from the address, the hidden
  // one from the address without `new`, so a reload never opens the other
  // section's unsaved entry in the section nobody sees.
  const bootedPosts = Posts.init(section === 'posts' ? url : withoutNew(url))
  const bootedPages = Pages.update(
    Pages.initial,
    Pages.Message.UrlChanged({ url: section === 'pages' ? url : withoutNew(url) }),
  )
  return {
    model: { section, chair, query, posts: bootedPosts.model, pages: bootedPages.model },
    commands: [
      ...mapMessages(bootedPosts.commands, message => Message.GotPostsMessage({ message })),
      ...mapMessages(bootedPages.commands, message => Message.GotPagesMessage({ message })),
    ],
  }
}

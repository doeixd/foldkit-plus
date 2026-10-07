import { Array, Effect, Match, Option, Schema } from 'effect'
import { Command, type Runtime, Subscription, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { Url } from 'foldkit/url'
import { Bundle, Link } from 'foldkit-bundle'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Site } from 'foldkit-site'

import { type File, type FileTreeEntry, fileTree, findEntry, formatFileSize } from './fileTree.js'
import { People } from './page/index.js'
import {
  AppRoute,
  filesIndexRouter,
  filesRouter,
  homeRouter,
  nestedRouter,
  peopleRouter,
  personRouter,
  urlToAppRoute,
} from './route.js'
import { RoutingPage } from './style.js'

export { AppRoute } from './route.js'

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  peoplePage: People.Model,
})

export type Model = typeof Model.Type

// MESSAGE

const NavigationShortcut = Schema.Literals(['GH', 'GP', 'GF', 'GN'])
type NavigationShortcut = typeof NavigationShortcut.Type

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedNavigation: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  EnteredNavigationShortcut: { shortcut: NavigationShortcut },
  GotPeopleMessage: { message: People.Message },
})

export type Message = typeof Message.Type

// SITE

const HomeNode = Site.route(homeRouter, AppRoute.Home, {
  title: () => 'Routing',
  section: 'Home',
})
const PeopleNode = Site.route(peopleRouter, AppRoute.People, {
  title: () => 'People | Routing',
  section: 'People',
})
const PersonNode = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
  history: (prev, next) => (prev.personId === next.personId ? 'replace' : 'push'),
})
const FilesIndexNode = Site.route(filesIndexRouter, AppRoute.FilesIndex, {
  title: () => 'Files | Routing',
  section: 'Files',
})
const FilesNode = Site.route(filesRouter, AppRoute.Files, {
  title: ({ path }) => `${Array.lastNonEmpty(path)} | Files | Routing`,
  section: 'Files',
  // Each path is an entry of its own: browsing deeper stays a history of steps.
  history: (prev, next) => (prev.path.join('/') === next.path.join('/') ? 'replace' : 'push'),
})
const NestedNode = Site.route(nestedRouter, AppRoute.Nested, {
  title: () => 'Nested | Routing',
  section: 'Nested',
})

export const AppSite = Site.make(
  HomeNode,
  Site.mount(PeopleNode, [PersonNode]),
  FilesIndexNode,
  FilesNode,
  NestedNode,
)

// PLACEMENT

/**
 * The People page, placed once. Its search text is derived from the starting
 * route: every factory sees the seed `initial` was given, so `/people?searchText=ali`
 * starts with `ali` searched, with no second fetch and no post-init Message.
 * The same declaration folds the child's Messages, draws it, and tells it
 * when its route arrives.
 */
const PeoplePage = Site.placement(PeopleNode, People.PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => People.Message.ChangedRoute({ route }),
})

const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  route: {
    dependency: ['route'],
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  pages: [PeoplePage],
})

const assembly = Bundle.assemble<Model, Message>()([PeoplePage.placed, Routing])

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) =>
  assembly.initial({ route: urlToAppRoute(url) })

// COMMAND

export const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const navigationUrlByShortcut: Readonly<Record<NavigationShortcut, () => string>> = {
  GH: () => Site.href(HomeNode, {}),
  GP: () => Site.href(PeopleNode, { searchText: Option.none() }),
  GF: () => Site.href(FilesIndexNode, {}),
  GN: () => Site.href(NestedNode, {}),
}

type OwnMessage = Bundle.OwnMessage<Message, typeof assembly.placements>

const updateOwn = (model: Model, message: OwnMessage): UpdateReturn =>
  Match.valueTags(message, {
    // Claimed by Site.routing: never reaches `own`.
    CompletedNavigation: () => ({ model }),
    CompletedNavigateInternal: () => ({ model }),
    ClickedLink: () => ({ model }),
    // Shared with Site.routing, which already routed it.
    ChangedUrl: () => ({ model }),

    EnteredNavigationShortcut: ({ shortcut }) => {
      const url = navigationUrlByShortcut[shortcut]()

      return { model, commands: [NavigateInternal({ url })] }
    },
  })

export const update = assembly.update(updateOwn)

// SUBSCRIPTION

const ownSubscriptions = Subscription.make<Model, Message>()(() => ({
  keyBindings: Subscription.persistent(
    Subscription.keyBindings<Message>({
      bindings: [
        {
          keys: ['G', 'H'],
          mapEvent: () => Message.EnteredNavigationShortcut({ shortcut: 'GH' }),
        },
        {
          keys: ['G', 'P'],
          mapEvent: () => Message.EnteredNavigationShortcut({ shortcut: 'GP' }),
        },
        {
          keys: ['G', 'F'],
          mapEvent: () => Message.EnteredNavigationShortcut({ shortcut: 'GF' }),
        },
        {
          keys: ['G', 'N'],
          mapEvent: () => Message.EnteredNavigationShortcut({ shortcut: 'GN' }),
        },
      ],
    }),
  ),
}))

export const subscriptions = assembly.subscriptions(ownSubscriptions)

// VIEW

type Slots = SlotBuilders<typeof RoutingPage.slots, Message>

const navSections = ['Home', 'People', 'Files', 'Nested'] as const
type NavSection = (typeof navSections)[number]

const sectionTarget: Readonly<Record<NavSection, () => string>> = {
  Home: () => Site.href(HomeNode, {}),
  People: () => Site.href(PeopleNode, { searchText: Option.none() }),
  Files: () => Site.href(FilesIndexNode, {}),
  Nested: () => Site.href(NestedNode, {}),
}

const navigationView = (currentRoute: AppRoute, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const currentSection = Site.sectionOf(AppSite, currentRoute)

  return h.nav(slots.nav.attrs(), [
    h.ul(
      slots.navList.attrs(),
      Array.map(navSections, section =>
        h.li(slots.navItem.attrs(), [
          h.a(
            slots.navLink.attrs([
              h.Href(sectionTarget[section]()),
              ...(currentSection === section ? [h.AriaCurrent('page')] : []),
            ]),
            [section],
          ),
        ]),
      ),
    ),
  ])
}

const homeView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Welcome Home']),
    h.p(slots.lead.attrs(), [
      'This is a routing example built with foldkit. Navigate using the links above to see different routes in action.',
    ]),
  ])

const nestedView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Very Nested Route!']),
    h.p(slots.lead.attrs(), ['You found the deeply nested route at /nested/route/is/very/nested']),
  ])

const peopleHref = Site.href(PeopleNode, { searchText: Option.none() })

const detailView = (label: string, value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.detail.attrs(), [
    h.h2(slots.detailLabel.attrs(), [label]),
    h.p(slots.detailValue.attrs(), [value]),
  ])

const personView = (personId: number, slots: Slots, h: HtmlBuilder<Message>): Html =>
  Option.match(People.findPerson(personId), {
    onNone: () =>
      h.div(slots.content.attrs(), [
        h.h2(slots.errorHeading.attrs(), ['Person Not Found']),
        h.p(slots.lead.attrs(), [`No person found with ID: ${personId}`]),
        h.a(slots.link.attrs([h.Href(peopleHref)]), ['← Back to People']),
      ]),

    onSome: person =>
      h.div(slots.content.attrs(), [
        h.a(slots.backLink.attrs([h.Href(peopleHref)]), ['← Back to People']),

        h.article(slots.article.attrs(), [
          h.h2(slots.heading.attrs(), [person.name]),

          h.div(slots.card.attrs(), [
            h.div(slots.details.attrs(), [
              detailView('ID', String(person.id), slots, h),
              detailView('Role', person.role, slots, h),
            ]),
          ]),
        ]),
      ]),
  })

const entryCountLabel = (count: number): string => (count === 1 ? '1 item' : `${count} items`)

const entryMetaText = (entry: FileTreeEntry): string =>
  Match.value(entry).pipe(
    Match.tagsExhaustive({
      File: file => formatFileSize(file.sizeInBytes),
      Directory: directory => entryCountLabel(directory.entries.length),
    }),
  )

const entryListView = (
  parentPath: ReadonlyArray<string>,
  entries: ReadonlyArray<FileTreeEntry>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul(
    slots.entries.attrs(),
    Array.map(entries, entry =>
      h.keyed('li')(entry.name, slots.entry.attrs(), [
        h.a(
          slots.link.attrs([h.Href(filesRouter({ path: Array.append(parentPath, entry.name) }))]),
          [entry.name],
        ),
        h.span(slots.entryMeta.attrs(), [entryMetaText(entry)]),
      ]),
    ),
  )

const breadcrumbView = (
  path: Array.NonEmptyReadonlyArray<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const lastSegmentIndex = path.length - 1

  return h.nav(slots.breadcrumb.attrs([h.AriaLabel('Breadcrumb')]), [
    h.a(slots.link.attrs([h.Href(filesIndexRouter())]), ['Files']),
    ...Array.map(path, (segment, index) => {
      const crumbPath = Array.append(Array.take(path, index), segment)
      const isCurrentSegment = index === lastSegmentIndex

      return h.keyed('span')(Array.join(crumbPath, '/'), slots.crumb.attrs(), [
        h.span(slots.crumbSeparator.attrs(), ['/']),
        isCurrentSegment
          ? h.span(slots.crumbCurrent.attrs(), [segment])
          : h.a(slots.link.attrs([h.Href(filesRouter({ path: crumbPath }))]), [segment]),
      ])
    }),
  ])
}

const fileDetailView = (file: File, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.card.attrs(), [
    h.h2(slots.fileName.attrs(), [file.name]),
    h.p(slots.fileSize.attrs(), [formatFileSize(file.sizeInBytes)]),
  ])

const missingEntryView = (
  path: Array.NonEmptyReadonlyArray<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.missing.attrs(), [
    h.h2(slots.errorHeading.attrs(), ['Nothing Here']),
    h.p(slots.lead.attrs(), [`No file or directory at "${Array.join(path, '/')}".`]),
    h.a(slots.link.attrs([h.Href(filesIndexRouter())]), ['← Back to Files']),
  ])

const filesIndexView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Files']),
    h.p(slots.lead.attrs(), [
      'Every path under /files parses into a single route that captures the remaining segments with rest.',
    ]),
    entryListView([], fileTree, slots, h),
  ])

const filesView = (
  path: Array.NonEmptyReadonlyArray<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const content = Option.match(findEntry(path), {
    onNone: () => missingEntryView(path, slots, h),
    onSome: entry =>
      Match.value(entry).pipe(
        Match.tagsExhaustive({
          File: file => fileDetailView(file, slots, h),
          Directory: directory => entryListView(path, directory.entries, slots, h),
        }),
      ),
  })

  return h.div(slots.content.attrs(), [breadcrumbView(path, slots, h), content])
}

const notFoundView = (path: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.errorHeading.attrs(), ['404 - Page Not Found']),
    h.p(slots.lead.attrs(), [`The path "${path}" was not found.`]),
    h.a(slots.link.attrs([h.Href(homeRouter())]), ['← Go Home']),
  ])

export const Page = SlotView.forMessages<Message>()
  .define(RoutingPage.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.header(slots.header.attrs(), [navigationView(model.route, slots, h)]),
      h.main(slots.main.attrs(), [
        AppRoute.match(model.route, {
          Home: () => homeView(slots, h),
          Nested: () => nestedView(slots, h),
          People: () => PeoplePage.placed.view(model, h),
          Person: ({ personId }) => personView(personId, slots, h),
          FilesIndex: () => filesIndexView(slots, h),
          Files: ({ path }) => filesView(path, slots, h),
          NotFound: ({ path }) => notFoundView(path, slots, h),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(RoutingPage.style))

export const routeTitle = (route: AppRoute): string =>
  Site.titleOf(AppSite, route) ?? 'NotFound | Routing'

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Page(model, h),
})

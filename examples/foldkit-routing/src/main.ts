import { Array, Effect, Match, Option, Schema } from 'effect'
import { Command, type Runtime, Subscription, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'
import { Link } from 'foldkit-bundle'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { type File, type FileTreeEntry, fileTree, findEntry, formatFileSize } from './fileTree.js'
import { People } from './page/index.js'
import {
  AppRoute,
  filesIndexRouter,
  filesRouter,
  homeRouter,
  nestedRouter,
  peopleRouter,
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
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  EnteredNavigationShortcut: { shortcut: NavigationShortcut },
  GotPeopleMessage: { message: People.Message },
})

export type Message = typeof Message.Type

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => {
  const route = urlToAppRoute(url)

  const initialPeopleRoute = Match.value(route).pipe(
    Match.tag('People', peopleRoute => peopleRoute),
    Match.orElse(() => AppRoute.People({ searchText: Option.none() })),
  )

  return Update.foldChildInit(People.init(initialPeopleRoute), {
    toParentModel: peoplePage => ({ route, peoplePage }),
    toParentMessage: message => Message.GotPeopleMessage({ message }),
  })
}

// COMMAND

export const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const navigationUrlByShortcut: Readonly<Record<NavigationShortcut, () => string>> = {
  GH: homeRouter,
  GP: () => peopleRouter({ searchText: Option.none() }),
  GF: filesIndexRouter,
  GN: nestedRouter,
}

/** Keeps the Model when the People page is unchanged, so a no-op draws nothing. */
const peoplePage = Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage))

const foldPeopleEntry = <Input>(
  update: (peoplePage: People.Model, input: Input) => People.UpdateReturn,
): Update.Fold<Model, Message, Input> => Update.foldChild({ ...peoplePage, update })

const foldPeople = foldPeopleEntry(People.update)

const foldPeopleRouteChanged = foldPeopleEntry(People.informRouteChanged)

const setRoute =
  (nextRoute: AppRoute): Update.Step<Model, Message> =>
  model => ({ model: modifyFields(model, { route: () => nextRoute }) })

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),

    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)

      const routeSteps = Match.value(nextRoute).pipe(
        Match.withReturnType<ReadonlyArray<Update.Step<Model, Message>>>(),
        Match.tag('People', peopleRoute => [foldPeopleRouteChanged(peopleRoute)]),
        Match.orElse(() => []),
      )

      return Update.combine(model, [setRoute(nextRoute), ...routeSteps])
    },

    EnteredNavigationShortcut: ({ shortcut }) => {
      const url = navigationUrlByShortcut[shortcut]()

      return { model, commands: [NavigateInternal({ url })] }
    },

    GotPeopleMessage: ({ message }) => foldPeople(model, message),
  })

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()(() => ({
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

// VIEW

type Slots = SlotBuilders<typeof RoutingPage.slots, Message>

const NavSection = Schema.Literals(['Home', 'People', 'Files', 'Nested'])
type NavSection = typeof NavSection.Type

const navSectionOf = (route: AppRoute): Option.Option<NavSection> =>
  AppRoute.match(route, {
    Home: () => Option.some('Home' as const),
    Nested: () => Option.some('Nested' as const),
    People: () => Option.some('People' as const),
    Person: () => Option.some('People' as const),
    FilesIndex: () => Option.some('Files' as const),
    Files: () => Option.some('Files' as const),
    NotFound: () => Option.none(),
  })

const navigationHrefBySection: Readonly<Record<NavSection, () => string>> = {
  Home: homeRouter,
  People: () => peopleRouter({ searchText: Option.none() }),
  Files: filesIndexRouter,
  Nested: nestedRouter,
}

const navigationView = (currentRoute: AppRoute, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const currentSection = navSectionOf(currentRoute)

  return h.nav(slots.nav.attrs(), [
    h.ul(
      slots.navList.attrs(),
      Array.map(NavSection.literals, section =>
        h.li(slots.navItem.attrs(), [
          h.a(
            slots.navLink.attrs([
              h.Href(navigationHrefBySection[section]()),
              ...(Option.contains(currentSection, section) ? [h.AriaCurrent('page')] : []),
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

const peopleHref = peopleRouter({ searchText: Option.none() })

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
          People: () =>
            h.submodel({
              slotId: 'people',
              model: model.peoplePage,
              view: People.view,
              toParentMessage: message => Message.GotPeopleMessage({ message }),
            }),
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
  AppRoute.match(route, {
    Home: () => 'Routing',
    Nested: () => 'Nested | Routing',
    People: () => 'People | Routing',
    Person: ({ personId }) => `Person ${personId} | Routing`,
    FilesIndex: () => 'Files | Routing',
    Files: ({ path }) => `${Array.lastNonEmpty(path)} | Files | Routing`,
    NotFound: () => 'NotFound | Routing',
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Page(model, h),
})

/**
 * A tree whose pages carry code of their own (#438): Account and Settings,
 * nested under it, are `Bundle.lazy`; Notes is eager. A factory, because a
 * lazy bundle loads once and each test needs its own unloaded instance.
 */
import { Effect, Option, Schema, Stream, pipe } from 'effect'
import { Submodel } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { defineRouteUnion, literal, mapTo, root, slash } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url, fromString } from 'foldkit/url'
import { Bundle, Link } from 'foldkit-bundle'
import { Site } from '../src/index.js'

export const AppRoute = defineRouteUnion({
  Home: {},
  Account: {},
  Settings: {},
  Notes: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

const HomeNode = Site.route(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home)
const AccountNode = Site.route(pipe(literal('account'), mapTo(AppRoute.Account)), AppRoute.Account)
const SettingsNode = Site.route(
  pipe(literal('account'), slash(literal('settings')), mapTo(AppRoute.Settings)),
  AppRoute.Settings,
)
const NotesNode = Site.route(pipe(literal('notes'), mapTo(AppRoute.Notes)), AppRoute.Notes)
export const AppSite = Site.make(HomeNode, Site.mount(AccountNode, [SettingsNode]), NotesNode)
export const routeOf = Site.parse(AppSite, AppRoute.NotFound)

export const PageModel = Schema.Struct({ seen: Schema.Number })
export type PageModel = typeof PageModel.Type
export const PageMessage = defineMessageUnion({ Arrived: {} })
export type PageMessage = typeof PageMessage.Type

const GotAccount = Link.wrapper('GotAccount', PageMessage)
const GotSettings = Link.wrapper('GotSettings', PageMessage)
const GotNotes = Link.wrapper('GotNotes', PageMessage)

export const Model = Schema.Struct({
  route: AppRoute,
  account: PageModel,
  settings: PageModel,
  notes: PageModel,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  PointedAtLink: { url: Url },
  ...GotAccount.cases,
  ...GotSettings.cases,
  ...GotNotes.cases,
})
export type Message = typeof Message.Type

/**
 * A page's bodies: the arrival changes nothing, so its drawing after the
 * load is the only sign the bodies came.
 */
const bodyOf = (name: string): Bundle.Body<PageModel, PageMessage, void, never, never, void> => ({
  update: model => ({ model }),
  view: Submodel.defineView<PageModel, PageMessage>((_model, h) =>
    h.p([h.Id('page')], [`${name} body`]),
  ),
})

/** A load the test releases, counting each time the chunk is asked for. */
export const deferred = (name: string) => {
  let release: () => void = () => {}
  let fail: () => void = () => {}
  let calls = 0
  const load = () =>
    new Promise<ReturnType<typeof bodyOf>>((resolve, reject) => {
      calls++
      release = () => resolve(bodyOf(name))
      fail = () => reject(new Error(`${name}'s chunk did not load`))
    })
  return { load, release: () => release(), fail: () => fail(), calls: () => calls }
}

const lazyPage = (name: string, load: () => Promise<ReturnType<typeof bodyOf>>) =>
  Bundle.lazy(
    {
      name,
      Model: PageModel,
      Message: PageMessage,
      init: () => ({ model: { seen: 0 } }),
      while: Submodel.defineView<PageModel, PageMessage>((_model, h) =>
        h.p([h.Id('page')], [`${name} loading`]),
      ),
    },
    load,
  )

const arrived = () => PageMessage.Arrived()

export const make = () => {
  const accountLoad = deferred('Account')
  const settingsLoad = deferred('Settings')
  const Account = lazyPage('Account', accountLoad.load)
  const Settings = lazyPage('Settings', settingsLoad.load)
  const Notes = Bundle.make('Notes', {
    Model: PageModel,
    Message: PageMessage,
    init: () => ({ model: { seen: 0 } }),
    update: model => ({ model }),
  })
  const AccountPage = Site.placement(AccountNode, Account, {
    link: Link.field<Model>()('account', GotAccount),
    changed: arrived,
  })
  const SettingsPage = Site.placement(SettingsNode, Settings, {
    link: Link.field<Model>()('settings', GotSettings),
    changed: arrived,
  })
  const NotesPage = Site.placement(NotesNode, Notes, {
    link: Link.field<Model>()('notes', GotNotes),
  })
  const pages = [AccountPage, SettingsPage, NotesPage]
  const read: Array<AppRoute> = []
  const routing = (links: Stream.Stream<Url> = Stream.empty) =>
    Site.routing<Model, Message, AppRoute>({
      site: AppSite,
      route: {
        dependency: ['route'],
        get: model => model.route,
        set: (model, route) => modifyFields(model, { route: () => route }),
      },
      parse: routeOf,
      tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
      completed: Message.CompletedNavigation,
      pages,
      preload: {
        links,
        intended: Message.PointedAtLink,
        read: there => {
          read.push(there.route)
          return { name: 'Read', effect: Effect.succeed(Message.CompletedNavigation()) }
        },
      },
    })
  return {
    Account,
    Settings,
    Notes,
    AccountPage,
    SettingsPage,
    NotesPage,
    pages,
    accountLoad,
    settingsLoad,
    read,
    routing,
  }
}

export const home: Model = {
  route: AppRoute.Home(),
  account: { seen: 0 },
  settings: { seen: 0 },
  notes: { seen: 0 },
}

export const urlOf = (path: string): Url =>
  Option.getOrThrowWith(fromString(`https://example.test${path}`), () => new Error(path))

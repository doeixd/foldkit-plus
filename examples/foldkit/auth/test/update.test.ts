/**
 * The route guards, the session's two transitions, and the page title, which
 * upstream's tests do not reach: init and `ChangedUrl` for each side of the
 * Model, login and logout, and the no-op for the address the Model shows.
 */
import { Option } from 'effect'
import { type Url, fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { Session } from '../src/domain/session.js'
import { Message, init, update } from '../src/main.js'
import { LoggedIn, LoggedOut, type Model } from '../src/model.js'
import { Message as LoggedInMessage } from '../src/page/loggedIn/message.js'
import { Message as LoggedOutMessage } from '../src/page/loggedOut/message.js'
import { Message as LoginMessage } from '../src/page/loggedOut/page/login.js'
import { AppRoute } from '../src/route.js'
import { routeTitle } from '../src/view.js'

const urlOf = (path: string): Url =>
  Option.getOrThrowWith(fromString(`http://localhost${path}`), () => new Error(path))

const alice = Session.make({ userId: '1', email: 'alice@example.com', name: 'alice' })

const commandNames = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

const loggedOut = (route: LoggedOut.Model['route']): Model => LoggedOut.init(route)
const loggedIn = (route: LoggedIn.Model['route']): Model => LoggedIn.init(route, alice)

describe('init', () => {
  test.each([
    ['/', Option.none(), loggedOut(AppRoute.Home()), []],
    ['/login', Option.none(), loggedOut(AppRoute.Login()), []],
    ['/nowhere', Option.none(), loggedOut(AppRoute.NotFound({ path: '/nowhere' })), []],
    ['/dashboard', Option.none(), loggedOut(AppRoute.Login()), ['RedirectToLogin']],
    ['/settings', Option.none(), loggedOut(AppRoute.Login()), ['RedirectToLogin']],
    ['/dashboard', Option.some(alice), loggedIn(AppRoute.Dashboard()), []],
    ['/settings', Option.some(alice), loggedIn(AppRoute.Settings()), []],
    ['/nowhere', Option.some(alice), loggedIn(AppRoute.NotFound({ path: '/nowhere' })), []],
    ['/', Option.some(alice), loggedIn(AppRoute.Dashboard()), ['RedirectToDashboard']],
    ['/login', Option.some(alice), loggedIn(AppRoute.Dashboard()), ['RedirectToDashboard']],
  ])('%s with session %o starts as expected', (path, maybeSession, model, commands) => {
    const result = init({ maybeSession }, urlOf(path))
    expect(result.model).toEqual(model)
    expect(commandNames(result)).toEqual(commands)
  })
})

describe('ChangedUrl', () => {
  test.each([
    [loggedOut(AppRoute.Home()), '/login', loggedOut(AppRoute.Login()), []],
    [loggedOut(AppRoute.Login()), '/dashboard', loggedOut(AppRoute.Login()), ['RedirectToLogin']],
    [loggedOut(AppRoute.Home()), '/settings', loggedOut(AppRoute.Home()), ['RedirectToLogin']],
    [loggedIn(AppRoute.Dashboard()), '/settings', loggedIn(AppRoute.Settings()), []],
    [loggedIn(AppRoute.Settings()), '/', loggedIn(AppRoute.Settings()), ['RedirectToDashboard']],
    [
      loggedIn(AppRoute.Dashboard()),
      '/login',
      loggedIn(AppRoute.Dashboard()),
      ['RedirectToDashboard'],
    ],
  ])('from %o, %s gives the expected Model and Commands', (model, path, next, commands) => {
    const result = update(model, Message.ChangedUrl({ url: urlOf(path) }))
    expect(result.model).toEqual(next)
    expect(commandNames(result)).toEqual(commands)
  })

  test.each([
    [loggedOut(AppRoute.Home()), '/'],
    [loggedOut(AppRoute.Login()), '/login'],
    [loggedIn(AppRoute.Settings()), '/settings'],
    [loggedIn(AppRoute.NotFound({ path: '/nowhere' })), '/nowhere'],
  ])('for the address %o already shows (%s), returns the same Model', (model, path) => {
    const result = update(model, Message.ChangedUrl({ url: urlOf(path) }))
    expect(result.model).toBe(model)
    expect(commandNames(result)).toEqual([])
  })
})

describe('the session', () => {
  test('a login becomes the dashboard, saved', () => {
    const result = update(
      loggedOut(AppRoute.Login()),
      Message.GotLoggedOutMessage({
        message: LoggedOutMessage.GotLoginMessage({
          message: LoginMessage.SucceededSimulateAuthRequest({ session: alice }),
        }),
      }),
    )
    expect(result.model).toEqual(loggedIn(AppRoute.Dashboard()))
    expect(commandNames(result)).toEqual(['SaveSession', 'RedirectToDashboard'])
  })

  test('a logout becomes the home page, cleared', () => {
    const result = update(
      loggedIn(AppRoute.Settings()),
      Message.GotLoggedInMessage({ message: LoggedInMessage.ClickedLogout() }),
    )
    expect(result.model).toEqual(loggedOut(AppRoute.Home()))
    expect(commandNames(result)).toEqual(['ClearSession', 'RedirectToHome'])
  })

  test.each([
    [Message.FailedSaveSession({ error: 'full' }), 'Failed to save session:'],
    [Message.FailedClearSession({ error: 'denied' }), 'Failed to clear session:'],
  ])('a storage failure is logged', (message, entry) => {
    const model = loggedIn(AppRoute.Dashboard())
    const result = update(model, message)
    expect(result.model).toBe(model)
    expect(commandNames(result)).toEqual(['LogError'])
    expect(result.commands?.[0]?.args).toEqual({ entries: [entry, message.error] })
  })
})

test.each([
  [AppRoute.Home(), 'Auth'],
  [AppRoute.Login(), 'Login | Auth'],
  [AppRoute.Dashboard(), 'Dashboard | Auth'],
  [AppRoute.Settings(), 'Settings | Auth'],
  [AppRoute.NotFound({ path: '/x' }), 'NotFound | Auth'],
])('the title of %o is %s', (route, title) => {
  expect(routeTitle(route)).toBe(title)
})

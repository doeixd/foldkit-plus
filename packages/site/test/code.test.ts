/**
 * Route code from the Site tree (#438): a page placed from a `Bundle.lazy` is
 * its node's code, the routing's `codeFor` names what a route draws from the
 * pages it holds, `boot` tells a page its route at start, and `preload`
 * fetches a pointed-at route's chunk once, beside its reads (`fetchCode`).
 */
import { Effect, Option, Schema } from 'effect'
import { Bundle, Link } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'
import {
  AppRoute,
  AppSite,
  Message,
  type Model,
  PageMessage,
  PageModel,
  home,
  make,
  urlOf,
} from './codeFixture.js'

const pointed = (path: string) => Message.PointedAtLink({ url: urlOf(path) })

describe("the routing's codeFor", () => {
  it("names each lazy page on the route's chain, root first, and none for eager pages", () => {
    const { Account, Settings, routing } = make()
    const { codeFor } = routing()
    expect(codeFor(AppRoute.Account())).toEqual([Account])
    const nested = codeFor(AppRoute.Settings())
    expect(nested).toHaveLength(2)
    expect(nested[0]).toBe(Account)
    expect(nested[1]).toBe(Settings)
    expect(codeFor(AppRoute.Notes())).toEqual([])
    expect(codeFor(AppRoute.Home())).toEqual([])
    expect(codeFor(AppRoute.NotFound({ path: '/x' }))).toEqual([])
  })

  it('is the placement: a lazy page carries its bundle, an eager one nothing', () => {
    const { Account, AccountPage, NotesPage } = make()
    expect(Option.getOrThrow(AccountPage.code)).toBe(Account)
    expect(Option.isNone(NotesPage.code)).toBe(true)
  })

  it('refuses a lazy page its arrival never tells, which would draw its placeholder for good', () => {
    const { Account } = make()
    const AccountNode = Site.nodeOf(AppSite, AppRoute.Account())!
    expect(() =>
      Site.placement(AccountNode, Account, {
        link: Link.field<Model>()('account', Link.wrapper('GotAccount', PageMessage)),
      }),
    ).toThrow(/"Account" is a Bundle.lazy, so its route's arrival must tell it \(changed\)/)
    // An eager page without `changed` is still allowed.
    const Eager = Bundle.make('Eager', {
      Model: PageModel,
      Message: PageMessage,
      args: Schema.Void,
      init: () => ({ model: { seen: 0 } }),
      update: model => ({ model }),
    })
    expect(() =>
      Site.placement(AccountNode, Eager, {
        link: Link.field<Model>()('account', Link.wrapper('GotAccount', PageMessage)),
      }),
    ).not.toThrow()
  })
})

describe("the routing's boot", () => {
  it("tells the Model's route to its page, whose Message loads a lazy page's bodies", () => {
    const { routing, accountLoad } = make()
    const { boot } = routing()
    const there: Model = { ...home, route: AppRoute.Account() }
    const started = boot(there)
    expect(started.model).toBe(there)
    // The page's own arrival, through Bundle.lazy, which answers it by loading.
    expect((started.commands ?? []).map(command => command.name)).toEqual(['LoadAccount'])
    expect(accountLoad.calls()).toBe(0)
  })

  it('tells nothing on a route with no page, and an eager page what it says', () => {
    const { routing } = make()
    const { boot } = routing()
    expect(boot(home)).toEqual({ model: home, commands: [] })
    const notes: Model = { ...home, route: AppRoute.Notes() }
    expect(boot(notes).commands ?? []).toEqual([])
  })
})

describe("preload fetches a pointed-at route's code", () => {
  it('is refused without fetchCode when a page is lazy, which would fetch nothing ahead', () => {
    const { routing } = make()
    expect(() => routing(undefined, false)).toThrow(
      /a Bundle.lazy page needs preload.code \(fetchCode\), or nothing fetches it ahead/,
    )
  })

  it('beside its reads, once: a loaded chunk is asked for nothing more', async () => {
    const { routing, read, accountLoad, Account } = make()
    const wiring = routing()
    const first = Option.getOrThrow(wiring.route!(home, pointed('/account')))
    expect(first.model).toBe(home)
    expect(read).toEqual([AppRoute.Account()])
    expect((first.commands ?? []).map(command => command.name)).toEqual(['Read', 'Site.LoadCode'])
    // Nothing loads until the Command runs.
    expect(accountLoad.calls()).toBe(0)

    const loading = Effect.runPromise(first.commands![1]!.effect)
    // Pointed at again while the chunk is on its way: the same load, not a second.
    const again = Option.getOrThrow(wiring.route!(home, pointed('/account')))
    const racing = Effect.runPromise(again.commands![1]!.effect)
    accountLoad.release()
    expect(await loading).toEqual(Message.CompletedNavigation())
    await racing
    expect(accountLoad.calls()).toBe(1)
    expect(Account.isLoaded()).toBe(true)

    const later = Option.getOrThrow(wiring.route!(home, pointed('/account')))
    expect((later.commands ?? []).map(command => command.name)).toEqual(['Read'])
  })

  it('fetches what a nested route draws above it too, and nothing for an eager page', async () => {
    const { routing, accountLoad, settingsLoad } = make()
    const wiring = routing()
    const nested = Option.getOrThrow(wiring.route!(home, pointed('/account/settings')))
    const loading = Effect.runPromise(nested.commands![1]!.effect)
    accountLoad.release()
    settingsLoad.release()
    await loading
    expect([accountLoad.calls(), settingsLoad.calls()]).toEqual([1, 1])

    const eager = Option.getOrThrow(wiring.route!(home, pointed('/notes')))
    expect((eager.commands ?? []).map(command => command.name)).toEqual(['Read'])
  })

  it('reads and fetches nothing for the route shown', () => {
    const { routing, read, accountLoad } = make()
    const there: Model = { ...home, route: AppRoute.Account() }
    const answer = Option.getOrThrow(routing().route!(there, pointed('/account')))
    expect(answer.commands ?? []).toEqual([])
    expect(read).toEqual([])
    expect(accountLoad.calls()).toBe(0)
  })

  it('a chunk that fails to load completes the Command, and is asked for again next time', async () => {
    const { routing, accountLoad, Account } = make()
    const wiring = routing()
    const first = Option.getOrThrow(wiring.route!(home, pointed('/account')))
    const loading = Effect.runPromise(first.commands![1]!.effect)
    accountLoad.fail()
    // No defect: Foldkit would crash on one.
    expect(await loading).toEqual(Message.CompletedNavigation())
    expect(Account.isLoaded()).toBe(false)
    const again = Option.getOrThrow(wiring.route!(home, pointed('/account')))
    const retried = Effect.runPromise(again.commands![1]!.effect)
    accountLoad.release()
    await retried
    expect(accountLoad.calls()).toBe(2)
    expect(Account.isLoaded()).toBe(true)
  })
})

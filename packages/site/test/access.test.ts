/**
 * `Site.access`: who may be shown a node and the nodes below it, decided
 * from what the application knows of the reader, and where anyone else goes.
 */
import { Option, Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, query, root, slash, string } from 'foldkit/route'
import { describe, expect, it } from 'vitest'
import { Access, Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  SignIn: { returnTo: Schema.Option(Schema.String) },
  Projects: {},
  Project: { projectId: Schema.String },
  Admin: {},
})
type AppRoute = typeof AppRoute.Type

/** What the application knows of the reader: its `Me` row. */
interface Me {
  readonly signedIn: boolean
  readonly admin: boolean
}

const SignIn = Site.route(
  pipe(
    literal('sign-in'),
    query(Schema.Struct({ returnTo: Schema.OptionFromOptional(Schema.String) })),
    mapTo(AppRoute.SignIn),
  ),
  AppRoute.SignIn,
)
const toSignIn = (requested: string) => Site.target(SignIn, { returnTo: Option.some(requested) })

const Home = Site.route(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home)
const Projects = Site.node(
  pipe(literal('projects'), mapTo(AppRoute.Projects)),
  AppRoute.Projects,
).access<Me>({ allow: me => me.signedIn, otherwise: toSignIn }).node
const Project = Site.route(
  pipe(literal('projects'), slash(string('projectId')), mapTo(AppRoute.Project)),
  AppRoute.Project,
)
const Admin = Site.route(pipe(literal('admin'), mapTo(AppRoute.Admin)), AppRoute.Admin, {
  access: {
    allow: (me: Me) => me.admin,
    otherwise: () => Site.target(Home, {}),
  },
})
const AppSite = Site.make(Home, SignIn, Site.mount(Projects, [Project]), Admin)

const visitor = Option.some<Me>({ signedIn: false, admin: false })
const member = Option.some<Me>({ signedIn: true, admin: false })
const admin = Option.some<Me>({ signedIn: true, admin: true })

describe('Site.accessOf', () => {
  it('allows a route no rule covers, whoever asks or before anyone is known', () => {
    expect(Site.accessOf(AppSite, AppRoute.Home(), Option.none())).toEqual(Access.Allowed())
    expect(Site.accessOf(AppSite, AppRoute.Home(), visitor)).toEqual(Access.Allowed())
  })

  it('waits for the reader before deciding a rule, rather than refusing', () => {
    expect(Site.accessOf(AppSite, AppRoute.Projects(), Option.none())).toEqual(Access.Pending())
  })

  it('sends a reader a rule refuses to its otherwise, returning to what they asked for', () => {
    expect(Site.accessOf(AppSite, AppRoute.Projects(), visitor)).toEqual(
      Access.Denied({ url: '/sign-in?returnTo=%2Fprojects' }),
    )
    expect(Site.accessOf(AppSite, AppRoute.Projects(), member)).toEqual(Access.Allowed())
  })

  it("holds a node's rule over the nodes below it", () => {
    const project = AppRoute.Project({ projectId: 'p1' })
    expect(Site.accessOf(AppSite, project, visitor)).toEqual(
      Access.Denied({ url: '/sign-in?returnTo=%2Fprojects%2Fp1' }),
    )
    expect(Site.accessOf(AppSite, project, member)).toEqual(Access.Allowed())
  })

  it('takes its rule from the options as from the builder', () => {
    expect(Site.accessOf(AppSite, AppRoute.Admin(), member)).toEqual(Access.Denied({ url: '/' }))
    expect(Site.accessOf(AppSite, AppRoute.Admin(), admin)).toEqual(Access.Allowed())
  })

  it('refuses a rule that would send a refused reader back where they were', () => {
    const loop = pipe(literal('loop'), mapTo(AppRoute.Admin))
    const Looping = Site.route(loop, AppRoute.Admin, {
      access: {
        allow: () => false,
        otherwise: () => Site.target(Site.route(loop, AppRoute.Admin), {}),
      },
    })
    expect(() => Site.accessOf(Site.make(Looping), AppRoute.Admin(), member)).toThrow(
      "Admin's access sends a refused reader to /loop, which it also covers",
    )
  })

  it('refuses a rule whose target it covers at another address, which would grow for ever', () => {
    // The sign-in page mounted under the rule it serves: each refusal returns
    // to the last, so no two addresses agree.
    const Guarded = Site.node(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home).access<Me>({
      allow: me => me.signedIn,
      otherwise: toSignIn,
    }).node
    const Under = Site.make(Site.mount(Guarded, [SignIn]))
    expect(() =>
      Site.accessOf(Under, AppRoute.SignIn({ returnTo: Option.none() }), visitor),
    ).toThrow("Home's access sends a refused reader to /sign-in?returnTo=%2Fsign-in")
  })

  it('decides root first: the outermost rule that refuses sends the reader', () => {
    const Inner = Site.route(
      pipe(literal('projects'), slash(string('projectId')), mapTo(AppRoute.Project)),
      AppRoute.Project,
      { access: { allow: (me: Me) => me.admin, otherwise: () => Site.target(Home, {}) } },
    )
    const Nested = Site.make(Home, SignIn, Site.mount(Projects, [Inner]))
    expect(Site.accessOf(Nested, AppRoute.Project({ projectId: 'p1' }), visitor)).toEqual(
      Access.Denied({ url: '/sign-in?returnTo=%2Fprojects%2Fp1' }),
    )
  })

  it("waits for the reader under an ancestor's rule too", () => {
    expect(Site.accessOf(AppSite, AppRoute.Project({ projectId: 'p1' }), Option.none())).toEqual(
      Access.Pending(),
    )
  })
})

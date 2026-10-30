/**
 * `foldkit-site` — the deployed route topology of a Foldkit application.
 *
 * A Site says where the application is: stable route nodes in a hierarchy,
 * each with its Foldkit Router, its metadata, and the Surfaces it activates.
 * Everything else — fetching, caching, rendering, navigation effects — stays
 * where it already is: the node compiles down to the primitives the runtime
 * already runs (`Route` biparsers, `Surface.when`, Bundle placements), so the
 * Site never becomes a second router, loader, or store.
 *
 * The rule, from the design:
 *
 * > Router says where the application is. Surface says what that state makes
 * > observable and capable. Remote says what server facts those observations
 * > require.
 *
 * Nothing here runs: nodes, mounts, trees, and targets are data. A `SiteTree`
 * is frozen at `Site.make`. `Site.routing` is the one runtime piece: the
 * link-click and URL-change lifecycle as a wiring, so applications stop
 * hand-writing those two update branches.
 */
import { Effect, Option, Predicate, Schema, Stream } from 'effect'
import {
  Bundle,
  Link,
  type AnyMessage,
  type Helper,
  type Placed,
  type PlacementConfig,
  type ResourceEntries,
  type SeedFor,
} from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { defineTaggedUnion } from 'foldkit/schema'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Navigation from 'foldkit/navigation'
import * as Subscription from 'foldkit/subscription'
import type { KeyBinding, KeySequence } from 'foldkit/dom'
import { UrlRequest } from 'foldkit/navigation'
import { oneOf, parseUrlWithFallback, type Router } from 'foldkit/route'
import type { Meta } from 'foldkit-ssr/client'
import * as Update from 'foldkit/update'
import * as Url from 'foldkit/url'
import type { Url as UrlValue } from 'foldkit/url'
import {
  ModelRef,
  Surface,
  type ActiveSurface,
  type Contract,
  type ModelPlace,
  type Surface as SurfaceType,
  type SurfaceSource,
  type Wiring,
} from 'foldkit-surface'

/** Whether moving to a target adds a history step (`push`) or replaces the current one. */
export type HistoryIntent = 'push' | 'replace'

/**
 * A route-case constructor: the Schema for `Surface.when`, called to build
 * route values for targets. The `any` is deliberate and quarantined here:
 * every constructor of a `defineRouteUnion` case is callable with its fields,
 * and `Site.target` types the params from the route value instead.
 */
export interface RouteCase<Route extends { readonly _tag: string }> extends Schema.Schema<Route> {
  (params: any): Route
}

/**
 * A Surface a node activates, with the route's params made into its own: the
 * `Surface.when` a node lowers to, once the application says where its route
 * lives. The surface's own types are checked where the node is declared
 * (`Site.route` infers them); by the time sources resolve, only the owner
 * check can still fail, and it does, loudly.
 */
export interface BoundSurface {
  readonly surface: SurfaceType<any, any, any, any>
  /** Who is signed in, read from the Model; the Surface waits for one when given. */
  readonly viewer?: ((model: any) => Option.Option<any>) | undefined
  readonly params: (route: any, viewer: any) => any
}

/**
 * The Surface a node activates, as `Site.route` and `.surface` take it.
 * `params` reads the node's route; with `viewer`, it reads the signed-in
 * viewer too, and the Surface is active only once `viewer` gives one.
 * Without `viewer`, `Viewer` is `void`, so a `params` reading a viewer it was
 * never given does not compile.
 */
export interface NodeSurface<Route, SRoot, SModel, SMessage, SParams, Viewer> {
  readonly surface: SurfaceType<SRoot, SModel, SMessage, SParams>
  readonly viewer?: ((model: SRoot) => Option.Option<Viewer>) | undefined
  readonly params: (route: Route, viewer: Viewer) => SParams
}

/**
 * A layout around everything under a node: it receives the composed child
 * explicitly — no Outlet, no context, no hidden route state. Ancestors with
 * layouts wrap the leaf's view root-first; ancestors without one pass
 * through. The `any` positions are deliberate and quarantined, as with
 * `BoundSurface`: annotate the function where it is declared and it checks
 * there.
 */
export interface NodeLayout {
  readonly render: (child: Html, model: any, h: any) => Html
}

/**
 * What a node draws for its own route: only the deepest node of the active
 * chain draws (its ancestors contribute layouts, never their views — a
 * person page shows no people list). Same `any` quarantine as `NodeLayout`.
 */
export interface NodeView {
  readonly render: (model: any, h: any) => Html
}

/**
 * What a node says of itself in the document's head, from its route value and
 * the Model (a post's excerpt is in the Model, not the route). The node keeps
 * it with the Model as `any`, quarantined as `NodeLayout`'s is: name the Model
 * where it is declared (`.meta<Model>(...)`) and it checks there.
 */
export type NodeMeta<Route, Model = any> = (page: {
  readonly route: Route
  readonly model: Model
}) => Meta

/**
 * The route's place in the Model, read and written. A field holding a tagged
 * union is a *union of* `FieldRef`s, one per case, which no single
 * `ModelRef<Root, Route>` accepts — so this is structural:
 *
 * ```ts
 * route: {
 *   dependency: ModelRef.focus(App.model.route).dependency,
 *   get: (model) => model.route,
 *   set: (model, route) => modifyFields(model, { route: () => route }),
 * },
 * ```
 */
export interface RouteField<Root, Route> {
  readonly dependency: readonly string[]
  readonly get: (root: Root) => Route
  readonly set: (root: Root, route: Route) => Root
}

/**
 * One routed page: its node, its Bundle placement, and how a route arrival
 * reaches the child. The placement drives both folds from one declaration —
 * `placed.update` for Messages, `placed.view` for drawing — and `inform`
 * tells the child when its route arrives, through its own Message. The
 * placement's full type rides along, so assemblies keep inferring services.
 */
export interface SitePage<Parent, ParentMessage, R, P> {
  readonly node: SiteNode<any>
  readonly placed: P
  /**
   * The child told of a route arrival: `None` for another node's route, for
   * a page with nothing to say, or when the child says nothing is needed.
   */
  readonly inform: (
    model: Parent,
    route: { readonly _tag: string },
  ) => Option.Option<Update.Return<Parent, ParentMessage, R>>
}

/**
 * One deployed location: its Router (which owns URL semantics), its route
 * case, and its metadata. A stable first-class value: mounting it in a tree
 * never mutates it, so the same node serves targets, hrefs, and inspection
 * wherever it is mounted.
 */
export interface SiteNode<Route extends { readonly _tag: string }> {
  readonly tag: string
  readonly router: Router<Route>
  readonly case: RouteCase<Route>
  /** The page's title for this route, once the route value is known. */
  readonly title?: ((route: Route) => string) | undefined
  /** The navigation section this route belongs to, for menus and breadcrumbs. */
  readonly section?: string | undefined
  /**
   * Where the section's nav item points: this node's params for its landing
   * address (a people list with no search, say). Nodes a section never lands
   * on — a person, a file — leave it absent; `Site.landing` reads the first
   * node of a section that declares one.
   */
  readonly landing?: Omit<Route, '_tag'> | undefined
  /**
   * The keys that go to this node's `landing`, as Foldkit's key bindings name
   * them: one press (`'/'`, `'Mod+K'`) or a sequence (`['G', 'H']`).
   * `Site.shortcuts` makes the bindings.
   */
  readonly shortcut?: KeySequence | undefined
  /**
   * Which history step a move within this node is: a string, or a function
   * for nodes where some param changes are entries of their own (another
   * person) and others are views of one entry (another search). A move to
   * another node — or from an unknown location — is always a step.
   */
  readonly history?: HistoryIntent | ((prev: Route, next: Route) => HistoryIntent) | undefined
  /** The Surface this route activates, if the node declares one. */
  readonly bound?: BoundSurface | undefined
  /** A layout wrapping everything under this node, if it declares one. */
  readonly layout?: NodeLayout | undefined
  /** What this node draws for its own route, if it draws anything. */
  readonly view?: NodeView | undefined
  /** What this node says of itself in the head; nodes below override it per field. */
  readonly meta?: NodeMeta<Route> | undefined
  /**
   * Whether search engines index this node and, unless they say otherwise,
   * the nodes below it. Undeclared up the whole chain, a node is indexed.
   */
  readonly indexed?: boolean | undefined
  /**
   * Who may be shown this node and the nodes below it: see `Site.accessOf`.
   * Held as `never` for its reader, so a rule given in the options must
   * name the reader it reads (`allow: (me: Me) => …`).
   */
  readonly access?: NodeAccess<never> | undefined
}

/**
 * Who may be shown a node, and where anyone else is sent. Presentation, not
 * authorization: the server guards what the page reads whatever this says.
 * `Who` is what the application knows of the reader (its `Me` row, say).
 */
export interface NodeAccess<Who> {
  readonly allow: (who: Who) => boolean
  /** Where a reader `allow` refuses goes, given the address they asked for (a sign-in page returning to it). */
  readonly otherwise: (requested: string) => SiteTarget<any>
}

/**
 * Whether the reader may be shown a route: `Allowed`; `Pending` while the
 * application does not know who they are yet, to draw a loading state rather
 * than flash the sign-in page at someone signed in; `Denied` with the address
 * to send them to.
 */
export const Access = defineTaggedUnion({
  Allowed: {},
  Pending: {},
  Denied: { url: Schema.String },
})
export type Access = typeof Access.Type

/** Carries the routes a mount or tree holds, in its type only: nothing sets it. */
declare const routes: unique symbol

/** A node mounted with its children: structure, not state. `Route` is every route it holds. */
export interface SiteMount<Route extends { readonly _tag: string } = any> {
  readonly node: SiteNode<any>
  readonly children: ReadonlyArray<SiteMount>
  readonly [routes]?: (route: Route) => void
}

/** The routes a bare node or a mount holds. */
export type RoutesOf<Mounted> =
  Mounted extends SiteNode<infer Route>
    ? Route
    : Mounted extends SiteMount<infer Route>
      ? Route
      : never

/**
 * A node under construction, from `Site.node`: each method annotates and
 * returns the builder, so nodes compose in steps and annotation bundles are
 * ordinary values. Methods — not pipeable fragments — because each stage of
 * a pipe is a separate generic call and could not infer the route. Read
 * `.node` at any stage for the frozen node so far.
 */
export interface NodeBuilder<Route extends { readonly _tag: string }> {
  /** The node so far: frozen, usable for targets and hrefs at any stage. */
  readonly node: SiteNode<Route>
  /**
   * One named bundle through the builder, Effect-style: the bundle stays
   * generic over the builder it meets, so it instantiates to this node's
   * route with no annotation. Chain for more than one.
   *
   * ```ts
   * const inSection = <R extends { readonly _tag: string }>(b: NodeBuilder<R>) =>
   *   b.section('People').shortcut(['G', 'P'])
   *
   * const Person = Site.node(personRouter, AppRoute.Person).pipe(inSection).node
   * ```
   *
   * Free `pipe(builder, bundle)` from `effect` composes the same way; this
   * method is the same spelling without the import.
   */
  pipe<A>(fn: (builder: NodeBuilder<Route>) => A): A
  /** The page's title for this route, once the route value is known. */
  title(title: (route: Route) => string): NodeBuilder<Route>
  /** The navigation section this route belongs to. */
  section(section: string): NodeBuilder<Route>
  /** Where the section's nav item points, as this node's params. */
  landing(landing: Omit<Route, '_tag'>): NodeBuilder<Route>
  /** The keys that go to this node's landing. */
  shortcut(shortcut: KeySequence): NodeBuilder<Route>
  /** Which history step a move within this node is. */
  history(
    history: HistoryIntent | ((prev: Route, next: Route) => HistoryIntent),
  ): NodeBuilder<Route>
  /** A layout wrapping everything under this node. */
  layout(layout: NodeLayout): NodeBuilder<Route>
  /** What this node draws for its own route. */
  view(view: NodeView): NodeBuilder<Route>
  /** What this node says of itself in the head, from its route and the Model. */
  meta<Model = any>(meta: NodeMeta<Route, Model>): NodeBuilder<Route>
  /** Whether search engines index this node and the nodes below it. */
  indexed(indexed: boolean): NodeBuilder<Route>
  /** Who may be shown this node and the nodes below it, and where anyone else goes. */
  access<Who>(access: NodeAccess<Who>): NodeBuilder<Route>
  /** The Surface this route activates, and the viewer its params read, if any. */
  surface<SRoot, SModel, SMessage, SParams, Viewer = void>(
    config: NodeSurface<Route, SRoot, SModel, SMessage, SParams, Viewer>,
  ): NodeBuilder<Route>
}

/**
 * The deployed topology: roots with everything mounted under them, frozen.
 * `Route` is the union of every node's route, so the tree parses an address
 * to it (`Site.parse`) and builds one back (`Site.hrefOf`).
 */
export interface SiteTree<Route extends { readonly _tag: string } = any> {
  readonly roots: ReadonlyArray<SiteMount>
  readonly [routes]?: (route: Route) => void
}

/** One address a node's `Site.paths` lists: the route's params, and when its content last changed. */
export interface SitePath<Route extends { readonly _tag: string }> {
  readonly params: Omit<Route, '_tag'>
  /** When what the page shows last changed, as ISO 8601 text, for a sitemap. */
  readonly modified?: string | undefined
}

/** A node's addresses, listed by an Effect the build runs: from `Site.paths`. */
export interface SitePaths<E, R> {
  readonly node: SiteNode<any>
  readonly list: Effect.Effect<ReadonlyArray<SitePath<any>>, E, R>
}

/** How a listing of `SitePaths` can fail: each one's error, and none for no paths. */
export type PathsError<Paths> = Paths extends SitePaths<infer E, any> ? E : never
/** What a listing of `SitePaths` needs: each one's services, and none for no paths. */
export type PathsServices<Paths> = Paths extends SitePaths<any, infer R> ? R : never

/** One address of the whole site, from `Site.targets`: a target, and when it last changed. */
export interface SiteListed<Route extends { readonly _tag: string }> extends SiteTarget<Route> {
  readonly modified?: string | undefined
}

/**
 * One typed destination: the node, the route value, and the URL, all from one
 * declaration. Links, prefetch, and route analysis share this instead of each
 * rebuilding it.
 */
export interface SiteTarget<Route extends { readonly _tag: string }> {
  readonly node: SiteNode<Route>
  readonly route: Route
  readonly url: string
}

/**
 * The tag a tagged constructor names, read the way `Surface.when` reads it
 * off a route case. Anything else is a definition-time error, not a silent
 * mismatch.
 */
const tagOfConstructor = (constructor: unknown, what: string): string => {
  const literal = (constructor as { fields?: { _tag?: { ast?: { literal?: unknown } } } }).fields
    ?._tag?.ast?.literal
  if (typeof literal !== 'string') throw new Error(`${what} must be a tagged constructor`)
  return literal
}

interface SiteIndex {
  readonly parent: ReadonlyMap<SiteNode<any>, SiteNode<any> | undefined>
  readonly byTag: ReadonlyMap<string, SiteNode<any>>
  /** The route the first node in tree order reads at an address, or nothing. */
  readonly read: (url: UrlValue) => Option.Option<any>
}

const indexes = new WeakMap<SiteTree, SiteIndex>()

/** The parent and tag maps and the parser of a tree, computed once per tree value. */
const indexOf = (site: SiteTree): SiteIndex => {
  const known = indexes.get(site)
  if (known !== undefined) return known
  const parent = new Map<SiteNode<any>, SiteNode<any> | undefined>()
  const byTag = new Map<string, SiteNode<any>>()
  const visit = (mount: SiteMount, above: SiteNode<any> | undefined): void => {
    if (parent.has(mount.node))
      throw new Error(
        `Site.make: "${mount.node.tag}" is mounted twice; a node has one place in a tree`,
      )
    const knownTag = byTag.get(mount.node.tag)
    if (knownTag !== undefined && knownTag !== mount.node)
      throw new Error(
        `Site.make: two nodes share the tag "${mount.node.tag}"; one route case is one node`,
      )
    parent.set(mount.node, above)
    byTag.set(mount.node.tag, mount.node)
    for (const child of mount.children) visit(child, mount.node)
  }
  for (const root of site.roots) visit(root, undefined)
  // Foldkit's parser takes only a fallback, so no match falls back to `None`.
  const parser = parseUrlWithFallback<any, Option.Option<any>>(
    oneOf(...[...parent.keys()].map(node => node.router)),
    { make: () => Option.none() },
  )
  const read = (url: UrlValue): Option.Option<any> => {
    const parsed = parser(url)
    return Option.isOption(parsed) ? parsed : Option.some(parsed)
  }
  const index = { parent, byTag, read }
  indexes.set(site, index)
  return index
}

/** Whether a node's route has params beyond its tag, so its addresses must be listed. */
const takesParams = (node: SiteNode<any>): boolean =>
  Object.keys((node.case as { fields?: object }).fields ?? {}).some(field => field !== '_tag')

const asMount = (node: SiteNode<any> | SiteMount): SiteMount =>
  'children' in node ? node : { node, children: [] }

/**
 * One surfaced node's `Surface.when` over the route place, or nothing
 * surfaceless. A node reading the viewer is active on its route only while
 * the viewer is known, and keeps the route's tag as its activation.
 */
const sourceOf = <Root>(
  node: SiteNode<any>,
  owner: object,
  place: ModelPlace<Root>,
): [string, ActiveSurface<Root> & SurfaceSource<Root>] | undefined => {
  const bound = node.bound
  if (bound === undefined) return undefined
  const { surface, viewer, params } = bound
  if (surface.owner !== owner)
    throw new Error(`Site: "${surface.name}" belongs to another application than the site`)
  if (viewer === undefined)
    return [node.tag, Surface.when(surface, place, node.case, route => params(route, undefined))]
  const focus = ModelRef.focus(place)
  const gated = Surface.at(surface, (model: Root) => {
    const route = focus.get(model)
    return Predicate.isTagged(route, node.tag)
      ? Option.map(viewer(model), who => params(route, who))
      : Option.none()
  })
  return [node.tag, { ...gated, activation: { path: focus.dependency, tag: node.tag } }]
}

/** The fields a `Meta` gives, so one left `undefined` does not erase an ancestor's. */
const saidOf = (meta: Meta): Meta =>
  Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined))

const freezeMount = (mount: SiteMount): SiteMount =>
  Object.freeze({
    node: mount.node,
    children: Object.freeze(mount.children.map(freezeMount)),
  })

/** A bare node: its tag from its route case, nothing annotated. */
const baseNode = <Route extends { readonly _tag: string }>(
  router: Router<Route>,
  routeCase: RouteCase<Route>,
): SiteNode<Route> =>
  Object.freeze({
    tag: tagOfConstructor(routeCase, 'Site.route: expected a route case from defineRouteUnion'),
    router,
    case: routeCase,
  })

export const Site = {
  /**
   * One deployed location from its Foldkit Router and its route case:
   *
   * ```ts
   * const Person = Site.route(personRouter, AppRoute.Person, {
   *   title: ({ personId }) => `Person ${personId} | Routing`,
   *   section: 'People',
   * })
   * ```
   *
   * The router stays the whole URL story (parse and build); the case names
   * the tag and builds route values. Metadata is annotated once here, and
   * navigation, titles, and history derive from it. To share annotations
   * across nodes, or to build incrementally, use the `Site.node` builder
   * instead — these options are sugar over it.
   */
  route: <Route extends { readonly _tag: string }, SRoot, SModel, SMessage, SParams, Viewer = void>(
    router: Router<Route>,
    routeCase: RouteCase<Route>,
    options?: {
      readonly title?: ((route: Route) => string) | undefined
      readonly section?: string | undefined
      readonly landing?: Omit<Route, '_tag'> | undefined
      readonly shortcut?: KeySequence | undefined
      readonly history?: HistoryIntent | ((prev: Route, next: Route) => HistoryIntent) | undefined
      readonly layout?: NodeLayout | undefined
      readonly view?: NodeView | undefined
      readonly meta?: NodeMeta<Route> | undefined
      readonly indexed?: boolean | undefined
      readonly access?: NodeAccess<never> | undefined
      readonly surface?: NodeSurface<Route, SRoot, SModel, SMessage, SParams, Viewer> | undefined
    },
  ): SiteNode<Route> => {
    let built = Site.node(router, routeCase)
    if (options?.title !== undefined) built = built.title(options.title)
    if (options?.section !== undefined) built = built.section(options.section)
    if (options?.landing !== undefined) built = built.landing(options.landing)
    if (options?.shortcut !== undefined) built = built.shortcut(options.shortcut)
    if (options?.history !== undefined) built = built.history(options.history)
    if (options?.layout !== undefined) built = built.layout(options.layout)
    if (options?.view !== undefined) built = built.view(options.view)
    if (options?.meta !== undefined) built = built.meta(options.meta)
    if (options?.indexed !== undefined) built = built.indexed(options.indexed)
    if (options?.access !== undefined) built = built.access(options.access)
    if (options?.surface !== undefined)
      built = built.surface<SRoot, SModel, SMessage, SParams, Viewer>(options.surface)
    return built.node
  },

  /**
   * One deployed location as an incremental builder, for nodes annotated in
   * steps or annotations shared across nodes:
   *
   * ```ts
   * const Person = Site.node(personRouter, AppRoute.Person)
   *   .title(({ personId }) => `Person ${personId} | Routing`)
   *   .section('People')
   *   .node
   * ```
   *
   * Methods — not pipeable fragments — because a pipeable fragment cannot
   * infer the route: each stage is a separate generic call, so its type
   * parameter falls back to the constraint and a typed callback no longer
   * matches. A method already knows its node's route, so inline lambdas
   * infer with no annotation. Read `.node` at any stage: every step freezes,
   * so intermediates are usable nodes too (targets, hrefs), never drafts.
   * `Site.route`'s options are sugar over this builder — one implementation.
   */
  node: <Route extends { readonly _tag: string }>(
    router: Router<Route>,
    routeCase: RouteCase<Route>,
  ): NodeBuilder<Route> => {
    const at = (built: SiteNode<Route>): NodeBuilder<Route> => ({
      node: built,
      pipe: <A>(fn: (builder: NodeBuilder<Route>) => A): A => fn(at(built)),
      title: title => at(Object.freeze({ ...built, title })),
      section: section => at(Object.freeze({ ...built, section })),
      landing: landing => at(Object.freeze({ ...built, landing })),
      shortcut: shortcut => at(Object.freeze({ ...built, shortcut })),
      history: history => at(Object.freeze({ ...built, history })),
      layout: layout => at(Object.freeze({ ...built, layout })),
      view: view => at(Object.freeze({ ...built, view })),
      meta: meta => at(Object.freeze({ ...built, meta })),
      indexed: indexed => at(Object.freeze({ ...built, indexed })),
      access: access => at(Object.freeze({ ...built, access })),
      surface: config => at(Object.freeze({ ...built, bound: config as BoundSurface })),
    })
    return at(baseNode(router, routeCase))
  },

  /**
   * A node with its children. Returns a mount; the node itself is untouched,
   * so it stays usable bare for targets and hrefs. Children may be bare
   * nodes (childless) or mounts.
   */
  mount: <
    Route extends { readonly _tag: string },
    const Children extends ReadonlyArray<SiteNode<any> | SiteMount> = [],
  >(
    node: SiteNode<Route>,
    children?: Children,
  ): SiteMount<Route | RoutesOf<Children[number]>> =>
    Object.freeze({ node, children: Object.freeze((children ?? []).map(asMount)) }),

  /**
   * The deployed topology from its roots: bare nodes or mounts, frozen.
   * Refuses two nodes sharing a tag and one node mounted twice, since both
   * would make chain inspection ambiguous.
   */
  make: <const Roots extends ReadonlyArray<SiteNode<any> | SiteMount>>(
    ...roots: Roots
  ): SiteTree<RoutesOf<Roots[number]>> => {
    const tree: SiteTree<RoutesOf<Roots[number]>> = Object.freeze({
      roots: Object.freeze(roots.map(asMount).map(freezeMount)),
    })
    // Fail at definition time, not at the first inspection.
    indexOf(tree)
    return tree
  },

  /**
   * One typed destination: the route value and the URL from the node's own
   * declaration, so a link can never point where the parser would not go.
   */
  target: <Route extends { readonly _tag: string }>(
    node: SiteNode<Route>,
    params: Omit<Route, '_tag'>,
  ): SiteTarget<Route> => ({
    node,
    route: node.case(params),
    url: node.router.build(params),
  }),

  /** The URL of a target, or of a node with params directly. */
  href: (<Route extends { readonly _tag: string }>(
    targetOrNode: SiteTarget<Route> | SiteNode<Route>,
    params?: Omit<Route, '_tag'>,
  ): string => {
    if ('url' in targetOrNode) return targetOrNode.url
    if (params === undefined)
      throw new Error(`Site.href: "${targetOrNode.tag}" needs params to build its URL`)
    return Site.target(targetOrNode, params).url
  }) as {
    <Route extends { readonly _tag: string }>(target: SiteTarget<Route>): string
    <Route extends { readonly _tag: string }>(
      node: SiteNode<Route>,
      params: Omit<Route, '_tag'>,
    ): string
  },

  /**
   * The tree's parser: an address to the route of the first node, in tree
   * order (depth-first, parents first), whose router takes all of it, or the
   * fallback. A router that takes any segment (`/:slug`) belongs after the
   * nodes whose literal it would take too. With `Site.hrefOf`, the tree is
   * the one declaration of both directions.
   */
  parse: <Route extends { readonly _tag: string }, Fallback>(
    site: SiteTree<Route>,
    fallback: { readonly make: (data: { readonly path: string }) => Fallback },
  ): ((url: UrlValue) => Route | Fallback) => {
    const { read } = indexOf(site)
    return (url): Route | Fallback =>
      Option.getOrElse(read(url), () => fallback.make({ path: url.pathname }))
  },

  /**
   * The route the tree reads at an address, as `Site.parse` does, or nothing
   * when no node takes it: an address the tree does not hold is another
   * document's, which a link reaches with a full load.
   */
  routeAt: <Route extends { readonly _tag: string }>(
    site: SiteTree<Route>,
    url: UrlValue,
  ): Option.Option<Route> => indexOf(site).read(url),

  /**
   * The address of a route the tree holds, built by its node's router, so it
   * parses back to the same route (`Site.parse`).
   */
  hrefOf: <Route extends { readonly _tag: string }>(
    site: SiteTree<Route>,
    route: Route,
  ): string => {
    const node = indexOf(site).byTag.get(route._tag)
    if (node === undefined) throw new Error(`Site.hrefOf: no node holds the tag "${route._tag}"`)
    const { _tag, ...params } = route
    return node.router.build(params)
  },

  /**
   * A node's addresses, from data: every published post is one. `list` is an
   * Effect the build runs, such as a Remote query read through
   * `Data.satisfy`, so it lists what a visitor may see.
   *
   * ```ts
   * const posts = Site.paths(PostNode, listPosts.pipe(
   *   Effect.map(rows => rows.map(row => ({ params: { slug: row.slug }, modified: row.at }))),
   * ))
   * ```
   */
  paths: <Route extends { readonly _tag: string }, E, R>(
    node: SiteNode<Route>,
    list: Effect.Effect<ReadonlyArray<SitePath<Route>>, E, R>,
  ): SitePaths<E, R> => ({ node, list }),

  /**
   * Every address of the site, in tree order: one for each node whose route
   * has no params, and what `paths` lists for each node whose route has
   * them. What a build renders, a sitemap lists (with `Site.indexedOf`), and
   * a prefetch warms. A node with params and no `paths` is refused, as are
   * `paths` for a node the tree does not hold or twice for one node, so no
   * page is left out unsaid; `Site.paths(node, Effect.succeed([]))` lists none.
   */
  targets: <const Paths extends ReadonlyArray<SitePaths<any, any>>>(
    site: SiteTree,
    paths: Paths,
  ): Effect.Effect<
    ReadonlyArray<SiteListed<any>>,
    PathsError<Paths[number]>,
    PathsServices<Paths[number]>
  > => {
    const nodes = Site.nodesOf(site)
    const listed = new Map<SiteNode<any>, SitePaths<any, any>>()
    for (const each of paths) {
      if (!nodes.includes(each.node))
        throw new Error(`Site.targets: "${each.node.tag}" has paths but is not in the tree`)
      if (listed.has(each.node)) throw new Error(`Site.targets: "${each.node.tag}" has paths twice`)
      listed.set(each.node, each)
    }
    const unlisted = nodes.filter(node => takesParams(node) && !listed.has(node))
    if (unlisted.length > 0)
      throw new Error(
        `Site.targets: ${unlisted.map(node => `"${node.tag}"`).join(', ')} take params and have no paths`,
      )
    return Effect.map(
      Effect.forEach(
        nodes,
        node => {
          const source = listed.get(node)
          if (source === undefined) return Effect.succeed([Site.target(node, {})])
          return Effect.map(source.list, found =>
            found.map(({ params, modified }) => ({
              ...Site.target(node, params),
              ...(modified === undefined ? {} : { modified }),
            })),
          )
        },
        { concurrency: 'unbounded' },
      ),
      perNode => perNode.flat(),
    )
  },

  /** Every node in the tree, depth-first, parents before children. */
  nodesOf: (site: SiteTree): ReadonlyArray<SiteNode<any>> => {
    const out: Array<SiteNode<any>> = []
    const visit = (mount: SiteMount): void => {
      out.push(mount.node)
      for (const child of mount.children) visit(child)
    }
    for (const root of site.roots) visit(root)
    return out
  },

  /** The node a route value is on, or nothing for a tag the tree does not hold. */
  nodeOf: (site: SiteTree, route: { readonly _tag: string }): SiteNode<any> | undefined =>
    indexOf(site).byTag.get(route._tag),

  /** The chain a route value is on, root first; none for an unknown tag. */
  chainOf: (site: SiteTree, route: { readonly _tag: string }): ReadonlyArray<SiteNode<any>> => {
    const { parent, byTag } = indexOf(site)
    const node = byTag.get(route._tag)
    if (node === undefined) return []
    const chain: Array<SiteNode<any>> = [node]
    let above = parent.get(node)
    while (above !== undefined) {
      chain.unshift(above)
      above = parent.get(above)
    }
    return chain
  },

  /** The node above this one in the tree, or nothing at a root. */
  parentOf: (site: SiteTree, node: SiteNode<any>): SiteNode<any> | undefined =>
    indexOf(site).parent.get(node),

  /** Every node above this one, root first. */
  ancestorsOf: (site: SiteTree, node: SiteNode<any>): ReadonlyArray<SiteNode<any>> => {
    const { parent } = indexOf(site)
    const out: Array<SiteNode<any>> = []
    let above = parent.get(node)
    while (above !== undefined) {
      out.unshift(above)
      above = parent.get(above)
    }
    return out
  },

  /** How deep the node sits: a root is 0, its children 1. */
  depthOf: (site: SiteTree, node: SiteNode<any>): number => Site.ancestorsOf(site, node).length,

  /** The title the tree annotates for a route value, or nothing. */
  titleOf: (site: SiteTree, route: { readonly _tag: string }): string | undefined => {
    const node = indexOf(site).byTag.get(route._tag)
    return node?.title?.(route)
  },

  /**
   * Whether search engines index a route: the nearest declaration up its
   * chain, so a `noindex` studio covers every node below it. A route the tree
   * does not hold is indexed, as a page with no declaration is.
   */
  indexedOf: (site: SiteTree, route: { readonly _tag: string }): boolean => {
    const chain = Site.chainOf(site, route)
    for (let at = chain.length - 1; at >= 0; at--) {
      const indexed = chain[at]!.indexed
      if (indexed !== undefined) return indexed
    }
    return true
  },

  /**
   * Whether the reader may be shown a route: every `access` up its chain,
   * root first, must allow `who`, and the first that refuses sends them to
   * its `otherwise`, given the route's address. `who` is `Option.none()`
   * while the application does not know yet (its `Me` loading): `Pending`
   * wherever a rule would need it. A route no rule covers is `Allowed`.
   *
   * ```ts
   * Access.match(Site.accessOf(AppSite, model.route, me), {
   *   Allowed: () => page,
   *   Pending: () => loading,
   *   Denied: ({ url }) => redirecting, // and `update` replaces the URL with `url`
   * })
   * ```
   *
   * A server answers `Denied` with a 303 to `url` before rendering. It is
   * presentation: what the page reads is guarded on the server regardless.
   */
  accessOf: <Route extends { readonly _tag: string }, Who>(
    site: SiteTree<Route>,
    route: Route,
    who: Option.Option<Who>,
  ): Access => {
    for (const node of Site.chainOf(site, route)) {
      const { access } = node
      if (access === undefined) continue
      if (Option.isNone(who)) return Access.Pending()
      // The tree holds its rules' readers as `never`: `who` is the reader they read.
      if ((access as NodeAccess<Who>).allow(who.value)) continue
      const target = access.otherwise(Site.hrefOf(site, route))
      // A target this same rule covers refuses the reader again, for ever.
      if (Site.chainOf(site, target.route).includes(node))
        throw new Error(
          `foldkit-site: ${node.tag}'s access sends a refused reader to ${target.url}, which it also covers`,
        )
      return Access.Denied({ url: target.url })
    }
    return Access.Allowed()
  },

  /**
   * What a route says of itself in the head, for an SSR plan's `meta`:
   *
   * ```ts
   * SSR.plan(App, { id: 'site', state, meta: model => Site.metaOf(AppSite, model.route, model) })
   * ```
   *
   * Each node of the chain's `meta`, root first, with a deeper node's field
   * replacing its ancestor's and a field it leaves out keeping the ancestor's.
   * The preview title falls back to the route's `title`. An unindexed route
   * (`Site.indexedOf`) is `noindex` whatever its `meta` says.
   */
  metaOf: <Root>(site: SiteTree, route: { readonly _tag: string }, model: Root): Meta => {
    let meta: Meta = {}
    for (const node of Site.chainOf(site, route))
      if (node.meta !== undefined) meta = { ...meta, ...saidOf(node.meta({ route, model })) }
    const title = meta.title ?? Site.titleOf(site, route)
    return {
      ...meta,
      ...(title === undefined ? {} : { title }),
      ...(Site.indexedOf(site, route) ? {} : { robots: 'noindex' }),
    }
  },

  /** The navigation section the tree annotates for a route value, or nothing. */
  sectionOf: (site: SiteTree, route: { readonly _tag: string }): string | undefined =>
    indexOf(site).byTag.get(route._tag)?.section,

  /**
   * Where a section's nav item points: the first node of the section with a
   * landing, as a target. Nothing when no node of the section declares one —
   * every section shown needs a landing, so navigation asserts it.
   */
  landing: (site: SiteTree, section: string): SiteTarget<any> | undefined => {
    for (const candidate of Site.nodesOf(site)) {
      if (candidate.section !== section) continue
      const landing = candidate.landing
      if (landing === undefined) continue
      return Site.target(candidate, landing)
    }
    return undefined
  },

  /**
   * The tree's shortcuts as key bindings, each sending the Message
   * `toMessage` makes of its node's landing:
   *
   * ```ts
   * Dom.streamFromKeyBindings({
   *   bindings: Site.shortcuts(AppSite, target => Message.PressedShortcut({ url: target.url })),
   * })
   * ```
   *
   * A shortcut on a node with no `landing` goes nowhere, and one used twice
   * goes to two places; both are refused.
   */
  shortcuts: <Message>(
    site: SiteTree,
    toMessage: (target: SiteTarget<any>) => Message,
  ): ReadonlyArray<KeyBinding<Message>> => {
    const taken = new Map<string, string>()
    return Site.nodesOf(site).flatMap((node): ReadonlyArray<KeyBinding<Message>> => {
      const keys = node.shortcut
      if (keys === undefined) return []
      if (node.landing === undefined)
        throw new Error(`Site.shortcuts: "${node.tag}" has a shortcut and no landing to go to`)
      const named = typeof keys === 'string' ? keys : keys.join(' ')
      const other = taken.get(named)
      if (other !== undefined)
        throw new Error(`Site.shortcuts: "${named}" goes to both "${other}" and "${node.tag}"`)
      taken.set(named, node.tag)
      const message = toMessage(Site.target(node, node.landing))
      const mapEvent = () => message
      // The binding's two shapes are told apart by `keys`, so each is made whole.
      return [typeof keys === 'string' ? { keys, mapEvent } : { keys, mapEvent }]
    })
  },

  /**
   * Which history step a move is: to another node, a step; within a node, its
   * declaration (a string, or a function for nodes where some param changes
   * are entries of their own); with no previous target — the current location
   * is unknown to the site — a step too, so Back can still return to it.
   */
  historyOf: (prev: SiteTarget<any> | undefined, next: SiteTarget<any>): HistoryIntent => {
    if (prev === undefined || prev.node !== next.node) return 'push'
    const rule = next.node.history ?? 'replace'
    return typeof rule === 'function' ? rule(prev.route, next.route) : rule
  },

  /**
   * What the route draws: the deepest node's view, wrapped by every
   * ancestor's layout root-first. Ancestors contribute layouts only — never
   * their views. Pure function composition over ordinary Foldkit rendering;
   * unknown tags and viewless leaves fail loudly, since rendering one would
   * guess.
   */
  view: <Root, Message>(
    site: SiteTree,
    route: { readonly _tag: string },
    model: Root,
    h: HtmlBuilder<Message>,
  ): Html => {
    const chain = Site.chainOf(site, route)
    if (chain.length === 0) throw new Error(`Site.view: no node holds the tag "${route._tag}"`)
    // A lookup, so the non-null assertion is the documented one.
    const leaf = chain[chain.length - 1]!
    if (leaf.view === undefined)
      throw new Error(`Site.view: "${leaf.tag}" draws nothing; give the leaf a view`)
    let child = leaf.view.render(model, h)
    for (let at = chain.length - 2; at >= 0; at--) {
      const layout = chain[at]!.layout
      if (layout !== undefined) child = layout.render(child, model, h)
    }
    return child
  },

  /**
   * What the tree's surfaced nodes activate, keyed by tag, for `Data.wiring`,
   * `Data.subscriptions`, `Data.satisfy`, or an SSR plan's `surfaces`: each
   * node's `Surface.when` over the application's route place. A surface from
   * another application is refused here, not at its reads.
   */
  sources: <Root>(
    site: SiteTree,
    owner: object,
    place: ModelPlace<Root>,
  ): Record<string, ActiveSurface<Root> & SurfaceSource<Root>> => {
    const out: Record<string, ActiveSurface<Root> & SurfaceSource<Root>> = {}
    for (const node of Site.nodesOf(site)) {
      const entry = sourceOf(node, owner, place)
      if (entry !== undefined) out[entry[0]] = entry[1]
    }
    return out
  },

  /**
   * The route-level Sources for one destination: the same entries as
   * `Site.sources`, but only the target's chain. Prefetch, SSR, and DevTools
   * read what a route will activate without building its Model first; the
   * preparation itself stays caller-composed (`Data.satisfy` over these, with
   * the route set to the target's). A tag the tree does not hold resolves to
   * no Sources, the way an inactive Surface resolves to nothing.
   *
   * ```ts
   * const active = Site.sourcesFor(AppSite, App.owner, App.model.route, target.route)
   * const prepared = yield* Data.satisfy({ ...model, route: target.route }, active)
   * ```
   *
   * There is deliberately no `SitePlan` object: the chain is already
   * `Site.chainOf`, and the head is `Site.metaOf`.
   */
  sourcesFor: <Root>(
    site: SiteTree,
    owner: object,
    place: ModelPlace<Root>,
    route: { readonly _tag: string },
  ): Record<string, ActiveSurface<Root> & SurfaceSource<Root>> => {
    const out: Record<string, ActiveSurface<Root> & SurfaceSource<Root>> = {}
    for (const node of Site.chainOf(site, route)) {
      const entry = sourceOf(node, owner, place)
      if (entry !== undefined) out[entry[0]] = entry[1]
    }
    return out
  },

  /**
   * The application's link-click and URL-change lifecycle as one wiring, so
   * `update` stops hand-writing those two branches. A click on a link the
   * tree holds navigates (pushing or replacing per `Site.historyOf`); on any
   * other, on this origin or not, it loads, since another document serves
   * it (`Site.routeAt`); a URL change sets the route field — or touches
   * nothing when the address parses to the route already shown, so an echo
   * of our own write never re-renders or clears pending state. The
   * application's own update answers nothing for either message; `reduces`
   * names them for its guard, the way `Remote.reduces` does.
   *
   * ```ts
   * const Routing = Site.routing<Model, Message, AppRoute>({
   *   site: AppSite,
   *   owner: App.owner,
   *   route: {
   *     dependency: ModelRef.focus(App.model.route).dependency,
   *     get: (model) => model.route,
   *     set: (model, route) => modifyFields(model, { route: () => route }),
   *   },
   *   parse: urlToAppRoute,
   *   tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
   *   completed: Message.CompletedNavigation,
   * })
   * const assembly = Bundle.assemble([Routing, ...pages])
   * const update = assembly.update((model, message) =>
   *   Routing.reduces(message) ? { model } : updateOwn(model, message),
   * )
   * ```
   *
   * One routing per application: it claims the click tag and shares the
   * change tag with URL mirrors, which read their slices first. With `pages`,
   * a route change sets the field and then informs each page whose route
   * arrived, through the page's own `changed` Message.
   */
  routing: <
    Root,
    Message extends { readonly _tag: string },
    Route extends { readonly _tag: string },
    R = never,
  >(config: {
    readonly site: SiteTree
    /**
     * The application's identity token, for the Module contract. Raw Foldkit
     * applications have none; omit it and the contract claims no owner.
     */
    readonly owner?: object | undefined
    /** The route field, read and written (a `RouteField`, struct). */
    readonly route: RouteField<Root, Route>
    /** The application's URL parser, with its NotFound fallback. */
    readonly parse: (url: UrlValue) => Route
    /** The application's own link-click and URL-change tags. */
    readonly tags: { readonly clicked: string; readonly changed: string }
    /** One completion for the navigation commands to dispatch. */
    readonly completed: Schema.Schema<Message> & (() => Message)
    /**
     * Routed pages, informed when their route arrives. With service-needing
     * pages, name the services fourth:
     * `Site.routing<Model, Message, AppRoute, RemoteClient>`.
     */
    readonly pages?: ReadonlyArray<SitePage<Root, Message, R, any>> | undefined
    /**
     * What the application does once a new route is set and its pages are
     * told: moving focus to what it drew, say. An echo of the shown address
     * arrives nowhere, so it runs nothing.
     */
    readonly arrived?: ((model: Root, route: Route) => Update.Return<Root, Message, R>) | undefined
    /**
     * Reads a page ahead when the reader means to follow a link to it, so it
     * draws at once when they do. `links` says where they mean to go
     * (`pointedLinks()` from `foldkit-primitives/dom`), `intended` is the
     * application's Message carrying it, which the routing claims, and `read`
     * reads what the Model would read there, the route already set:
     * `there => Data.preload(there, actives)`. An address no node holds, or
     * the route shown, reads nothing, and the Model is never changed: what
     * was read lands as `read`'s own Messages.
     */
    readonly preload?:
      | {
          readonly links: Stream.Stream<UrlValue>
          readonly intended: Schema.Schema<Message> &
            ((fields: { readonly url: UrlValue }) => Message)
          readonly read: (there: Root) => Command.Command<Message, never, R>
        }
      | undefined
  }): Wiring<Root, Message, R> & {
    /** Whether the routing owns a message: its click, its URL change, or its preload intent. */
    readonly reduces: (message: Message) => boolean
  } => {
    const completedTag = tagOfConstructor(
      config.completed,
      'Site.routing: completed must be a message constructor',
    )
    const Navigate = Command.define('Site.Navigate', {
      args: { url: Schema.String, history: Schema.Literals(['push', 'replace']) },
      messages: [config.completed],
      execute: ({ url, history }) =>
        (history === 'push' ? Navigation.pushUrl(url) : Navigation.replaceUrl(url)).pipe(
          Effect.as(config.completed()),
        ),
    })
    const { arrived, preload } = config
    const intendedTag =
      preload === undefined
        ? undefined
        : tagOfConstructor(
            preload.intended,
            'Site.routing: preload.intended must be a message constructor',
          )
    const Load = Command.define('Site.Load', {
      args: { href: Schema.String },
      messages: [config.completed],
      execute: ({ href }) => Navigation.load(href).pipe(Effect.as(config.completed())),
    })
    // Route values are plain data from the same constructors, so equal
    // addresses compare equal. Checked before every write, so an echo of our
    // own navigation touches nothing: same Model back, no re-render.
    const sameRoute = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b)
    const setRoute = (model: Root, next: Route): Root => {
      const current = config.route.get(model)
      return sameRoute(current, next) ? model : config.route.set(model, next)
    }
    const currentTarget = (model: Root): SiteTarget<Route> | undefined => {
      const current = config.route.get(model)
      const node = Site.nodeOf(config.site, current) as SiteNode<Route> | undefined
      if (node === undefined) return undefined
      // The tag rides along for matching only; params are everything else.
      const { _tag, ...params } = current
      return Site.target(node, params)
    }
    const handles = [
      config.tags.clicked,
      config.tags.changed,
      ...(intendedTag === undefined ? [] : [intendedTag]),
    ]
    const reduces = (message: Message): boolean =>
      // tag-check: open — the tags are the application's own variants, named in config
      handles.includes(message._tag)
    const wiring: Wiring<Root, Message, R> = {
      key: 'site',
      handles,
      shared: [config.tags.changed],
      ...(preload === undefined
        ? {}
        : {
            subscriptions: Subscription.make<Root, Message, R>()(() => ({
              'site.intent': Subscription.persistentEntry(
                Stream.map(preload.links, url => preload.intended({ url })),
              ),
            })),
          }),
      route: (model, message) => {
        // tag-check: open — same ownership as reduces
        if (preload !== undefined && message._tag === intendedTag) {
          const url = (message as unknown as { readonly url: UrlValue }).url
          return Option.some(
            Option.match(Site.routeAt(config.site, url), {
              // Another document's page, which this application cannot read ahead.
              onNone: () => ({ model }),
              onSome: next =>
                sameRoute(config.route.get(model), next)
                  ? { model }
                  : { model, commands: [preload.read(config.route.set(model, next))] },
            }),
          )
        }
        // tag-check: open — same ownership as reduces
        if (message._tag === config.tags.clicked) {
          const request = (message as unknown as { readonly request: UrlRequest }).request
          return Option.some(
            UrlRequest.match(request, {
              Internal: ({ url }) =>
                Option.match(Site.routeAt(config.site, url), {
                  // No node takes it, so another document serves it.
                  onNone: () => ({ model, commands: [Load({ href: Url.toString(url) })] }),
                  onSome: next => {
                    // A lookup: the route came from one of the tree's nodes.
                    const node = Site.nodeOf(config.site, next)!
                    const history = Site.historyOf(currentTarget(model), {
                      node,
                      route: next,
                      url: Url.toString(url),
                    })
                    return {
                      model,
                      commands: [Navigate({ url: Url.toString(url), history })],
                    }
                  },
                }),
              External: ({ href }) => ({ model, commands: [Load({ href })] }),
            }),
          )
        }
        // tag-check: open — same ownership as reduces
        if (message._tag === config.tags.changed) {
          const url = (message as unknown as { readonly url: UrlValue }).url
          const next = config.parse(url)
          // An echo of the shown address touches nothing: same Model back,
          // and no page is informed of a route it already has.
          if (sameRoute(config.route.get(model), next)) return Option.some({ model })
          const steps: Array<Update.Step<Root, Message, R>> = [
            model => ({ model: setRoute(model, next) }),
            ...(config.pages ?? []).map(
              page => (model: Root) =>
                Option.getOrElse(page.inform(model, next), () => ({ model })),
            ),
            ...(arrived === undefined ? [] : [(model: Root) => arrived(model, next)]),
          ]
          return Option.some(Update.combine(model, steps))
        }
        return Option.none()
      },
      onUrl: (model, url) => setRoute(model, config.parse(url)),
      contract: {
        kind: 'site',
        name: 'site',
        owner: config.owner,
        owns: [],
        observes: [config.route.dependency],
        messages: [completedTag, ...(intendedTag === undefined ? [] : [intendedTag])],
        metadata: [],
      } satisfies Contract,
    }
    return { ...wiring, reduces }
  },

  /**
   * One routed page stated once: its link (where its Model lives and how its
   * Messages wrap), what starts it, and what its route arrival tells it. The
   * link carries the field and the wrapper together; `placed.update` folds
   * the child's Messages and `placed.view` draws it, and `Site.routing`
   * informs it through `changed` when its route arrives.
   *
   * ```ts
   * const PeoplePage = Site.placement(People, PeopleBundle, {
   *   link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
   *   args: parent => ({
   *     searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
   *   }),
   *   changed: route => People.Message.ChangedRoute({ route }),
   * })
   * const assembly = Bundle.assemble([PeoplePage.placed, Routing])
   * ```
   *
   * `changed` receives the node's own case value and returns the child's
   * Message, or nothing when the arrival needs no answer. Without it the
   * page is never informed. Bundles with OutMessages, and children that are
   * not Bundles, stay on `Bundle.at` and `Link.child` directly.
   */
  placement: <
    Route extends { readonly _tag: string },
    Parent,
    LinkMessage extends AnyMessage,
    ChildModel,
    ChildMessage extends AnyMessage,
    Field extends string,
    Name extends string,
    Args,
    BundleR = never,
    BundleS = never,
    ViewInputs = void,
    Resources extends ResourceEntries<ChildModel, ChildMessage> = never,
    Helpers extends Readonly<Record<string, Helper<ChildModel, ChildMessage, never, BundleR>>> =
      never,
    ObserverR = never,
  >(
    node: SiteNode<Route>,
    bundle: Bundle.Bundle<
      Name,
      Args,
      ChildModel,
      ChildMessage,
      never,
      BundleR,
      BundleS,
      ViewInputs,
      Resources,
      Helpers
    >,
    config: {
      readonly link: Link<Parent, LinkMessage, ChildModel, ChildMessage, Field>
      readonly changed?: (route: Route) => ChildMessage | undefined
    } & PlacementConfig<
      Args,
      Parent,
      LinkMessage,
      ChildMessage,
      never,
      never,
      ObserverR,
      SeedFor<Parent, Field>
    >,
  ): SitePage<
    Parent,
    LinkMessage,
    BundleR | ObserverR,
    Placed<
      Name,
      Parent,
      LinkMessage,
      ChildModel,
      ChildMessage,
      BundleR | ObserverR,
      BundleS,
      ViewInputs,
      Resources,
      Helpers,
      Field,
      LinkMessage extends { readonly _tag: infer Tag extends string } ? Tag : string
    >
  > => {
    const { link, changed } = config
    // `link` and `changed` are this helper's own: `Bundle.at` reads its
    // known keys, and a non-literal tolerates the extra properties.
    const placed = bundle.at(link, config)
    return {
      node,
      placed,
      inform: (model, route) => {
        if (!Predicate.isTagged(route, node.tag) || changed === undefined) return Option.none()
        // Guarded by the tag the node was built from, which `Site.make`
        // keeps unique: this is the node's own case value.
        const child = changed(route as Route)
        if (child === undefined) return Option.none()
        return placed.update(model, link.toParentMessage(child))
      },
    }
  },
}

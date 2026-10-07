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
import { Effect, Option, Predicate, Schema } from 'effect'
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
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Navigation from 'foldkit/navigation'
import { UrlRequest } from 'foldkit/navigation'
import type { Router } from 'foldkit/route'
import * as Update from 'foldkit/update'
import * as Url from 'foldkit/url'
import type { Url as UrlValue } from 'foldkit/url'
import {
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
  readonly params: (route: any) => any
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
 * The route's place in the Model, read and written. A field holding a tagged
 * union is a *union of* `FieldRef`s, one per case, which no single
 * `ModelRef<Root, Route>` accepts — so this is structural:
 *
 * ```ts
 * route: {
 *   dependency: App.model.route.dependency,
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
   * The keyboard shortcut announcing this node, for key bindings derived
   * beside the application (`G H` for Home): the characters pressed in
   * sequence. Key bindings stay application-owned; this only names them once,
   * next to the destination they go to.
   */
  readonly shortcut?: string | undefined
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
}

/** A node mounted with its children: structure, not state. */
export interface SiteMount {
  readonly node: SiteNode<any>
  readonly children: ReadonlyArray<SiteMount>
}

/** The deployed topology: roots with everything mounted under them, frozen. */
export interface SiteTree {
  readonly roots: ReadonlyArray<SiteMount>
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
}

const indexes = new WeakMap<SiteTree, SiteIndex>()

/** The parent and tag maps of a tree, computed once per tree value. */
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
  const index = { parent, byTag }
  indexes.set(site, index)
  return index
}

const asMount = (node: SiteNode<any> | SiteMount): SiteMount =>
  'children' in node ? node : { node, children: [] }

/** One surfaced node's `Surface.when` over the route place, or nothing surfaceless. */
const sourceOf = <Root>(
  node: SiteNode<any>,
  owner: object,
  place: ModelPlace<Root>,
): [string, ActiveSurface<Root> & SurfaceSource<Root>] | undefined => {
  const bound = node.bound
  if (bound === undefined) return undefined
  if (bound.surface.owner !== owner)
    throw new Error(`Site: "${bound.surface.name}" belongs to another application than the site`)
  return [node.tag, Surface.when(bound.surface, place, node.case, bound.params)]
}

const freezeMount = (mount: SiteMount): SiteMount =>
  Object.freeze({
    node: mount.node,
    children: Object.freeze(mount.children.map(freezeMount)),
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
   * navigation, titles, and history derive from it.
   */
  route: <Route extends { readonly _tag: string }, SRoot, SModel, SMessage, SParams>(
    router: Router<Route>,
    routeCase: RouteCase<Route>,
    options?: {
      readonly title?: ((route: Route) => string) | undefined
      readonly section?: string | undefined
      readonly landing?: Omit<Route, '_tag'> | undefined
      readonly shortcut?: string | undefined
      readonly history?: HistoryIntent | ((prev: Route, next: Route) => HistoryIntent) | undefined
      readonly layout?: NodeLayout | undefined
      readonly view?: NodeView | undefined
      readonly surface?:
        | {
            readonly surface: SurfaceType<SRoot, SModel, SMessage, SParams>
            readonly params: (route: Route) => SParams
          }
        | undefined
    },
  ): SiteNode<Route> =>
    Object.freeze({
      tag: tagOfConstructor(routeCase, 'Site.route: expected a route case from defineRouteUnion'),
      router,
      case: routeCase,
      ...(options?.title === undefined ? {} : { title: options.title }),
      ...(options?.section === undefined ? {} : { section: options.section }),
      ...(options?.landing === undefined ? {} : { landing: options.landing }),
      ...(options?.shortcut === undefined ? {} : { shortcut: options.shortcut }),
      ...(options?.history === undefined ? {} : { history: options.history }),
      ...(options?.layout === undefined ? {} : { layout: options.layout }),
      ...(options?.view === undefined ? {} : { view: options.view }),
      ...(options?.surface === undefined ? {} : { bound: options.surface as BoundSurface }),
    }),

  /**
   * A node with its children. Returns a mount; the node itself is untouched,
   * so it stays usable bare for targets and hrefs. Children may be bare
   * nodes (childless) or mounts.
   */
  mount: (
    node: SiteNode<any>,
    children: ReadonlyArray<SiteNode<any> | SiteMount> = [],
  ): SiteMount => Object.freeze({ node, children: Object.freeze(children.map(asMount)) }),

  /**
   * The deployed topology from its roots: bare nodes or mounts, frozen.
   * Refuses two nodes sharing a tag and one node mounted twice, since both
   * would make chain inspection ambiguous.
   */
  make: (...roots: ReadonlyArray<SiteNode<any> | SiteMount>): SiteTree => {
    const tree: SiteTree = Object.freeze({
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
   * There is deliberately no `SitePlan` object yet: the chain is already
   * `Site.chainOf`, and head/access metadata arrive with their real consumers
   * (§31.9), not ahead of them.
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
   * `update` stops hand-writing those two branches. A click on an internal
   * link navigates (pushing or replacing per `Site.historyOf`); on an
   * external link it loads; a URL change sets the route field — or touches
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
   *     dependency: App.model.route.dependency,
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
  }): Wiring<Root, Message, R> & {
    /** Whether the routing owns a message: its click or its URL change. */
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
    // tag-check: open — the tags are the application's own variants, named in config
    const reduces = (message: Message): boolean =>
      message._tag === config.tags.clicked || message._tag === config.tags.changed
    const wiring: Wiring<Root, Message, R> = {
      key: 'site',
      handles: [config.tags.clicked, config.tags.changed],
      shared: [config.tags.changed],
      route: (model, message) => {
        // tag-check: open — same ownership as reduces
        if (message._tag === config.tags.clicked) {
          const request = (message as unknown as { readonly request: UrlRequest }).request
          return Option.some(
            UrlRequest.match(request, {
              Internal: ({ url }) => {
                const next = config.parse(url)
                const node = Site.nodeOf(config.site, next)
                const intent =
                  node === undefined
                    ? ('push' as const)
                    : Site.historyOf(currentTarget(model), {
                        node,
                        route: next,
                        url: Url.toString(url),
                      })
                return {
                  model,
                  commands: [Navigate({ url: Url.toString(url), history: intent })],
                }
              },
              External: ({ href }) => ({ model, commands: [Load({ href })] }),
            }),
          )
        }
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
        messages: [completedTag],
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

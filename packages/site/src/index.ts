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
 * is frozen at `Site.make`.
 */
import type { Schema } from 'effect'
import type { Router } from 'foldkit/route'
import {
  Surface,
  type ActiveSurface,
  type ModelPlace,
  type Surface as SurfaceType,
  type SurfaceSource,
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
   * Which history step a move within this node is: a string, or a function
   * for nodes where some param changes are entries of their own (another
   * person) and others are views of one entry (another search). A move to
   * another node is always a step; the first page replaces nothing.
   */
  readonly history?: HistoryIntent | ((prev: Route, next: Route) => HistoryIntent) | undefined
  /** The Surface this route activates, if the node declares one. */
  readonly bound?: BoundSurface | undefined
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

/** The tag a route-case constructor names, read the way `Surface.when` reads it. */
const tagOfCase = (routeCase: unknown): string => {
  const literal = (routeCase as { fields?: { _tag?: { ast?: { literal?: unknown } } } }).fields
    ?._tag?.ast?.literal
  if (typeof literal !== 'string')
    throw new Error(
      'Site.route: expected a route case from defineRouteUnion, a tagged constructor with a literal _tag',
    )
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
      readonly history?: HistoryIntent | ((prev: Route, next: Route) => HistoryIntent) | undefined
      readonly surface?:
        | {
            readonly surface: SurfaceType<SRoot, SModel, SMessage, SParams>
            readonly params: (route: Route) => SParams
          }
        | undefined
    },
  ): SiteNode<Route> =>
    Object.freeze({
      tag: tagOfCase(routeCase),
      router,
      case: routeCase,
      ...(options?.title === undefined ? {} : { title: options.title }),
      ...(options?.section === undefined ? {} : { section: options.section }),
      ...(options?.history === undefined ? {} : { history: options.history }),
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
   * Which history step a move is: to another node, a step; within a node, its
   * declaration (a string, or a function for nodes where some param changes
   * are entries of their own); with no previous target, there is nothing to
   * replace past — also a replace.
   */
  historyOf: (prev: SiteTarget<any> | undefined, next: SiteTarget<any>): HistoryIntent => {
    // No previous page (a cold load is already its own entry): nothing to step from.
    if (prev === undefined) return 'replace'
    if (prev.node !== next.node) return 'push'
    const rule = next.node.history ?? 'replace'
    return typeof rule === 'function' ? rule(prev.route, next.route) : rule
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
      const bound = node.bound
      if (bound === undefined) continue
      if (bound.surface.owner !== owner)
        throw new Error(
          `Site.sources: "${bound.surface.name}" belongs to another application than the site`,
        )
      out[node.tag] = Surface.when(bound.surface, place, node.case, bound.params)
    }
    return out
  },
}

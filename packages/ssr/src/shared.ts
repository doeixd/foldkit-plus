/**
 * What the server and the browser both read: the plan, the envelope as the
 * browser reads it, static regions, and the page's bindings. Nothing here
 * imports Foldkit's server renderer, so `client.ts` can carry all of it.
 */
import { Effect, Option, Result, Schema, Stream, type Layer } from 'effect'
import type { Runtime } from 'foldkit'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import type { Ports } from 'foldkit/port'
import type { ActiveSurface, Metadata, SurfaceSource, WritableProjection } from 'foldkit-surface'
import { current, type Region } from './context.js'
import { decodeBindings, readBindings, type DecodedBinding } from './listen.js'

/**
 * The attribute Foldkit's server stamps on an application's root, as
 * `foldkit/experimental/server` exports it. Written out here so a page can
 * find its root without that module; a test pins the two together.
 */
export const FOLDKIT_APP_ATTRIBUTE = 'data-foldkit-app'

/**
 * The attribute on the stamped root that carries a page's resume envelope.
 * Foldkit pairs its own handoff the same way: the build id rides on the root
 * beside the app stamp, and the client reads it before adopting anything.
 */
export const RESUME_ATTRIBUTE = 'data-foldkit-plus-resume'

/** The envelope format this package writes and reads. */
export const PROTOCOL = 1

const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/**
 * JSON for a script element: `<` is escaped so `</script>` in the data ends
 * nothing. U+2028 and U+2029 are escaped too: they are fine in JSON and break a
 * reader that treats the text as JavaScript.
 */
export const serializeJsonScript = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029')

/**
 * The envelope JSON as the stamped root carries it: `serializeJsonScript`
 * already escaped `<` and the line separators, and an attribute must escape
 * `&` and `"` besides, so no string in the Model can break out of the value.
 * `getAttribute` resolves the entities back, which is exactly the JSON.
 */
export const attributeOf = (json: string): string =>
  ` ${RESUME_ATTRIBUTE}="${json.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`

/**
 * What a page says of itself beyond Foldkit's `Document` (`title`, `lang`,
 * `dir`, `canonical`, `ogUrl`): what a search result and a link preview show.
 * `title` is the preview's title (`og:title`), when it differs from the
 * document's. Dates are ISO 8601 text; `jsonLd` is structured data, each
 * entry written as its own script.
 */
export interface Meta {
  readonly description?: string | undefined
  readonly title?: string | undefined
  readonly image?: string | undefined
  readonly type?: 'website' | 'article' | undefined
  readonly siteName?: string | undefined
  readonly article?:
    { readonly published?: string | undefined; readonly modified?: string | undefined } | undefined
  readonly robots?: string | undefined
  readonly alternates?:
    ReadonlyArray<{ readonly hreflang: string; readonly href: string }> | undefined
  readonly jsonLd?: ReadonlyArray<Readonly<Record<string, unknown>>> | undefined
}

/** Marks each head element a plan's `meta` wrote, so the browser can replace them. */
export const META_ATTRIBUTE = 'data-foldkit-meta'

const attributeText = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

/** The head markup of a `Meta`, every value escaped, one element per line. */
export const metaMarkup = (meta: Meta): string => {
  const tag = (element: string, attributes: ReadonlyArray<readonly [string, string]>) =>
    `<${element} ${META_ATTRIBUTE} ${attributes.map(([name, value]) => `${name}="${attributeText(value)}"`).join(' ')}>`
  const named = (name: string, value: string | undefined) =>
    value === undefined
      ? []
      : [
          tag('meta', [
            ['name', name],
            ['content', value],
          ]),
        ]
  const property = (name: string, value: string | undefined) =>
    value === undefined
      ? []
      : [
          tag('meta', [
            ['property', name],
            ['content', value],
          ]),
        ]
  return [
    ...named('description', meta.description),
    ...property('og:title', meta.title),
    ...property('og:description', meta.description),
    ...property('og:type', meta.type),
    ...property('og:site_name', meta.siteName),
    ...property('og:image', meta.image),
    ...(meta.description === undefined && meta.image === undefined && meta.title === undefined
      ? []
      : named('twitter:card', meta.image === undefined ? 'summary' : 'summary_large_image')),
    ...property('article:published_time', meta.article?.published),
    ...property('article:modified_time', meta.article?.modified),
    ...named('robots', meta.robots),
    ...(meta.alternates ?? []).map(({ hreflang, href }) =>
      tag('link', [
        ['rel', 'alternate'],
        ['hreflang', hreflang],
        ['href', href],
      ]),
    ),
    ...(meta.jsonLd ?? []).map(
      data =>
        `<script ${META_ATTRIBUTE} type="application/ld+json">${serializeJsonScript(data)}</script>`,
    ),
  ].join('\n')
}

/**
 * The Subscription entry that keeps the head's `meta` elements in step with
 * the Model, so a move within the page (another post) changes its
 * description too. It writes the head and sends no Message.
 */
export const metaEntry = <Model>(meta: (model: Model) => Meta) => ({
  dependenciesSchema: Schema.String,
  modelToDependencies: (model: Model) => metaMarkup(meta(model)),
  dependenciesToStream: (markup: string) =>
    Stream.drain(
      Stream.fromEffect(
        Effect.sync(() => {
          const written = document.createElement('template')
          written.innerHTML = markup
          for (const old of document.head.querySelectorAll(`[${META_ATTRIBUTE}]`)) old.remove()
          document.head.append(written.content)
        }),
      ),
    ),
})

/** One entry of a resume plan's `surfaces`: a lone Surface, or a `Surface.each` family. */
export type PlanSurface<Model> = ActiveSurface<Model> | SurfaceSource<Model>

/**
 * What a plan entry resolves to for a Model: the lone projection of a
 * `Surface.at`/`Surface.when` value, or a family's parent first and then each
 * instance. The parent joins so the envelope carries what the instances were
 * discovered through, not just what they read.
 */
export const projectionsOf = <Model>(
  source: PlanSurface<Model>,
  model: Model,
): ReadonlyArray<{ readonly metadata: Metadata }> => {
  if (typeof (source as Partial<SurfaceSource<Model>>).instancesOf === 'function') {
    const origin = source as SurfaceSource<Model>
    const from = (source as { readonly from?: ActiveSurface<Model> }).from
    const parent = from === undefined ? [] : Option.toArray(from.projectionOf(model))
    return [...parent, ...origin.instancesOf(model).map(instance => instance.projection)]
  }
  return Option.toArray((source as ActiveSurface<Model>).projectionOf(model))
}

/**
 * Which part of the Model the browser owns, and what it starts from.
 *
 * `state` is a writable projection of that part, from `Projection.pick` or
 * `Projection.compose`. `baseline` is the Model the browser sets it onto, by
 * default the application's own initial Model. `boot` names the Commands the
 * browser runs on load, since `init` does not run there.
 */
export interface ResumePlan<Model, Fields extends Schema.Struct.Fields, Commands = unknown> {
  readonly id: string
  readonly state: WritableProjection<Model, Fields>
  readonly baseline: Model
  readonly boot?: ((model: Model) => Commands) | undefined
  /** Model paths allowed to start from the baseline, as `ModelRef.dependency` gives them. */
  readonly local: ReadonlyArray<ReadonlyArray<string>>
  /** The Surfaces the browser may activate, which the plan must cover. */
  readonly surfaces: ReadonlyArray<PlanSurface<Model>>
  /** State another package owns, each captured and restored by that package. */
  readonly parts: ReadonlyArray<ResumePart<Model>>
  /** The application's Message Schema, which encodes the page's bindings. */
  readonly Message?: Schema.Top | undefined
  /**
   * When the browser boots the runtime: `now` on load, `idle` when the browser
   * is idle or on the first interaction, `on-interaction` on the first only.
   * Until then the page answers events from its bindings and queues the
   * Messages, which the runtime runs through `update` before any other.
   */
  readonly start: Start
  /** Subscription and Managed Resource keys that may start late (decision 10). */
  readonly deferrable: ReadonlyArray<string>
  /**
   * `server`: a form whose `OnSubmit` names a Message also posts it to the
   * page's own URL, and `SSR.handle` runs `update` there, so the form works
   * with scripts off or not yet loaded.
   */
  readonly fallback?: 'server' | undefined
  /**
   * What the page says of itself, from the Model: rendered into the head on
   * the server, checked like the view, and kept in step in the browser.
   */
  readonly meta?: ((model: Model) => Meta) | undefined
  /**
   * The data the page was built from, for the browser's freshness check: a
   * Remote cursor, a revision number, anything the check compares. Unset
   * when the page has no age.
   */
  readonly version?: unknown | undefined
}

export type Start = 'now' | 'idle' | 'on-interaction'

/**
 * A package's contribution to the envelope, for state the plan's slice cannot
 * carry, such as Remote's normalized store. On the server `capture` takes what
 * the active Surfaces' projections read and returns it as JSON; in the browser
 * `restore` sets it onto the Model, or says why it cannot. A part owns its
 * encoding: this package only carries the value.
 *
 * `covers` names the metadata keys whose reads the part resumes, so the
 * coverage check counts those reads as sent. `Remote.resume(Data)` is one.
 */
export interface ResumePart<Model> {
  readonly id: string
  readonly covers: ReadonlyArray<string>
  readonly capture: (
    model: Model,
    projections: ReadonlyArray<{ readonly metadata: Metadata }>,
  ) => unknown
  readonly restore: (model: Model, value: unknown) => Result.Result<Model, string>
  /**
   * Whether a Subscription or Managed Resource entry of this part's package
   * may start late, when a deferred boot is asked for. A part knows its own
   * entries; nothing is deferrable by default.
   */
  readonly deferrable?: ((key: string, entry: unknown) => boolean) | undefined
}

/** Why a page's resume envelope was refused. */
export class ResumeRefused extends Schema.TaggedError<ResumeRefused>()('ResumeRefused', {
  reason: Schema.Literals([
    'Missing',
    'Duplicate',
    'Unreadable',
    'Protocol',
    'Plan',
    'Invalid',
    'Route',
  ]),
  message: Schema.String,
}) {}

export const refuse = (reason: ResumeRefused['reason'], message: string) =>
  Result.fail(new ResumeRefused({ reason, message }))

/**
 * The slice's Schema as a codec needing no services. A resume plan's state is
 * plain data, so any field that needs one cannot cross a page anyway.
 */
export const codecOf = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>) =>
  schema as unknown as Schema.Codec<Schema.Struct.Type<Fields>, unknown>

/**
 * A resume plan for an application. The baseline defaults to the
 * application's initial Model. It is never written: a writable projection's
 * `set` returns a new Model, so a baseline Foldkit freezes in development is
 * safe to start from.
 *
 * `surfaces` are the Surfaces the browser may activate, and `local` the Model
 * fields allowed to start from the baseline, such as an open menu. Rendering
 * refuses a plan that leaves a Surface's read or activation in neither.
 */
export const plan = <Model, Fields extends Schema.Struct.Fields, Commands = unknown>(
  application: {
    readonly initial: Model
    readonly owner?: object
    readonly Message?: Schema.Top | undefined
  },
  config: {
    readonly id: string
    readonly state: WritableProjection<Model, Fields>
    readonly baseline?: Model | undefined
    readonly boot?: ((model: Model) => Commands) | undefined
    readonly local?: ReadonlyArray<{ readonly dependency: ReadonlyArray<string> }> | undefined
    readonly surfaces?: ReadonlyArray<PlanSurface<Model>> | undefined
    readonly parts?: ReadonlyArray<ResumePart<Model>> | undefined
    readonly start?: Start | undefined
    readonly deferrable?: ReadonlyArray<string> | undefined
    readonly fallback?: 'server' | undefined
    readonly meta?: ((model: Model) => Meta) | undefined
    readonly version?: unknown | undefined
  },
): ResumePlan<Model, Fields, Commands> => {
  const surfaces = config.surfaces ?? []
  const parts = config.parts ?? []
  const repeated = parts.find((part, index) => parts.findIndex(p => p.id === part.id) !== index)
  if (repeated !== undefined) {
    throw new Error(
      `SSR.plan: two parts of plan "${config.id}" share the id "${repeated.id}"; give one an id of its own`,
    )
  }
  // A family joins its parent's requirements with its instances', so the
  // parent's application is checked too: a family smuggling another
  // application's Surface is refused here, not at its reads.
  const entered = surfaces.flatMap(surface => {
    const from = (surface as { readonly from?: PlanSurface<Model> }).from
    return from === undefined ? [surface] : [surface, from]
  })
  const foreign = entered.find(
    surface => application.owner !== undefined && surface.owner !== application.owner,
  )
  if (foreign !== undefined) {
    throw new Error(
      `SSR.plan: the Surface "${foreign.name}" belongs to another application than plan "${config.id}"`,
    )
  }
  return {
    id: config.id,
    state: config.state,
    baseline: config.baseline ?? application.initial,
    ...(config.boot === undefined ? {} : { boot: config.boot }),
    local: (config.local ?? []).map(place => place.dependency),
    surfaces,
    parts,
    ...(application.Message === undefined ? {} : { Message: application.Message }),
    start: config.start ?? 'now',
    deferrable: config.deferrable ?? [],
    ...(config.fallback === undefined ? {} : { fallback: config.fallback }),
    ...(config.meta === undefined ? {} : { meta: config.meta }),
    ...(config.version === undefined ? {} : { version: config.version }),
  }
}

/**
 * How a page's recorded route is compared with the browser's. `full` compares
 * path and query. `path` compares the path alone, ignoring a trailing slash or
 * `index.html`, for a page generated as a file: a static host serves one file
 * for every query, and for `/about` and `/about/` alike.
 */
export type RouteMatch = 'full' | 'path'

/** A path as a `path` match compares it. */
export const pathKey = (route: string): string => {
  const path = route.split(/[?#]/)[0] ?? ''
  const trimmed = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * The Model a payload resumes: the baseline with the slice set onto it, then
 * each part restored, in order. Every part the plan names must be there and
 * restore, and no other may be: a page is never half-restored.
 */
export const modelFrom = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  payload: { readonly state: unknown; readonly parts?: unknown },
): Result.Result<Model, string> => {
  const decoded = Schema.decodeUnknownResult(codecOf(plan.state.schema))(payload.state)
  if (Result.isFailure(decoded)) {
    return Result.fail(`the envelope's state does not decode: ${decoded.failure.message}`)
  }
  const given = payload.parts ?? {}
  if (typeof given !== 'object' || Array.isArray(given)) {
    return Result.fail("the envelope's parts are not an object of parts by id")
  }
  const parts = given as Readonly<Record<string, unknown>>
  const unknown = Object.keys(parts).find(id => !plan.parts.some(part => part.id === id))
  if (unknown !== undefined) {
    return Result.fail(`the envelope carries a part "${unknown}" the plan does not name`)
  }
  let model = plan.state.set(plan.baseline, decoded.success)
  for (const part of plan.parts) {
    if (!Object.hasOwn(parts, part.id))
      return Result.fail(`the envelope carries no "${part.id}" part`)
    const restored = part.restore(model, parts[part.id])
    if (Result.isFailure(restored)) {
      return Result.fail(`the "${part.id}" part does not restore: ${restored.failure}`)
    }
    model = restored.success
  }
  return Result.succeed(model)
}

/** The page's envelope, read off its stamped root; refused when there is no root, more than one, no envelope, or not JSON. */
const readEnvelope = (
  page: ParentNode,
): Result.Result<Readonly<Record<string, unknown>>, ResumeRefused> => {
  const roots = page.querySelectorAll(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  if (roots.length === 0) return refuse('Missing', 'the page holds no stamped application root')
  if (roots.length > 1) {
    return refuse('Duplicate', `the page holds ${roots.length} stamped application roots`)
  }
  const carried = roots[0]?.getAttribute(RESUME_ATTRIBUTE)
  if (carried === null || carried === undefined) {
    return refuse('Missing', 'the page holds no resume envelope')
  }
  try {
    const parsed: unknown = JSON.parse(carried)
    return Result.succeed((parsed ?? {}) as Readonly<Record<string, unknown>>)
  } catch (error) {
    return refuse('Unreadable', `the resume envelope is not JSON: ${String(error)}`)
  }
}

/**
 * The Model a page resumes from: the baseline with the stamped root's envelope
 * set onto it. Refused, with the reason, when the page holds no stamped root
 * or more than one, when the root carries no envelope or not JSON, when it is
 * not this protocol or this plan, or when the slice does not decode through
 * the plan's Schema. A page is never half-restored.
 */
export const resume = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  page: ParentNode,
  options: { readonly route?: string | undefined } = {},
): Result.Result<Model, ResumeRefused> => {
  const read = readEnvelope(page)
  if (Result.isFailure(read)) return Result.fail(read.failure)
  const parsed = read.success
  const { v, plan: id, state, parts, route, match } = parsed
  if (v !== PROTOCOL) {
    return refuse('Protocol', `the envelope is protocol ${String(v)}, not ${PROTOCOL}`)
  }
  if (id !== plan.id) {
    return refuse('Plan', `the envelope is for plan "${String(id)}", not "${plan.id}"`)
  }
  // The route the Model was made for. The runtime never reports the URL at
  // boot, so a page resumed on another route would show one and be on the
  // other.
  if (route !== undefined && options.route !== undefined) {
    const matches =
      match === 'path' ? pathKey(String(route)) === pathKey(options.route) : route === options.route
    if (!matches) {
      return refuse(
        'Route',
        `the page was ${match === 'path' ? 'generated' : 'rendered'} for ${String(route)}, not ${options.route}`,
      )
    }
  }
  const resumed = modelFrom(plan, { state, parts })
  return Result.isFailure(resumed)
    ? refuse('Invalid', resumed.failure)
    : Result.succeed(resumed.success)
}

/** The tag a Message value carries, for naming it. */
export const tagOf = (message: unknown): string =>
  typeof message === 'object' &&
  message !== null &&
  '_tag' in message &&
  typeof message._tag === 'string'
    ? message._tag
    : 'an untagged Message'

/**
 * The Message tags the plan's Surfaces active for `model` may send, which is
 * what a page's bindings may dispatch (the design's rule 3).
 */
export const allowedTags = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
): ReadonlySet<string> =>
  new Set(
    plan.surfaces.flatMap(source =>
      projectionsOf(source, model).length > 0 ? source.messages : [],
    ),
  )

/** The attribute on a static region's element, naming the region. */
export const STATIC_ATTRIBUTE = 'data-foldkit-plus-static'

const boundary = (id: string, trusted: string | undefined, children: Region): Html =>
  inertHtml.div(
    [
      inertHtml.Attribute(STATIC_ATTRIBUTE, id),
      ...(trusted === undefined ? [] : [inertHtml.InnerHTML(trusted)]),
    ],
    children,
  )

/**
 * A region of the page the server owns for the life of the document. It is
 * rendered on the server with the inert builder, so it can dispatch no
 * Message. The browser adopts the server's markup as trusted `InnerHTML` and
 * never runs `render`, so the region reads nothing from the browser's Model
 * and a plan need not send what it reads.
 *
 * A region changes only with a new document. Content a Message should change
 * belongs in a Surface, not here.
 */
export const staticRegion = (id: string, render: (ih: HtmlBuilder<never>) => Region): Html => {
  const now = current()
  if (now?.mode === 'resume') {
    const snapshot = now.snapshots.get(id)
    if (snapshot !== undefined) return boundary(id, snapshot, [])
    if (!now.reported.has(id)) {
      now.reported.add(id)
      console.error(
        `[foldkit-ssr] the static region "${id}" is not in the server's page, so it is rendered in the browser`,
      )
    }
    return boundary(id, undefined, render(inertHtml))
  }
  const replayed = now?.mode === 'replay' ? now.regions.get(id) : undefined
  if (replayed !== undefined) return boundary(id, undefined, replayed)
  if (now?.mode !== 'collect') return boundary(id, undefined, render(inertHtml))
  const outer = now.region
  now.region = id
  try {
    const children = render(inertHtml)
    if (now.regions.has(id)) now.duplicates.add(id)
    else now.regions.set(id, children)
    return boundary(id, undefined, children)
  } finally {
    now.region = outer
  }
}

/**
 * Whether the view call in progress is the server rendering a page, rather than the browser: true
 * through both of `render`'s passes, false while the browser resumes and outside any render. For a
 * view that sends markup it will adopt in the browser rather than draw there, such as
 * `foldkit-richtext-dom`'s editor host, whose placement takes this as `serverRendered`.
 */
export const serving = (): boolean => {
  const mode = current()?.mode
  return mode === 'collect' || mode === 'replay'
}

/**
 * The `makeApplication` options `SSR` hands to Foldkit as they are, typed as
 * Foldkit types them.
 */
type ApplicationOptions<Model, Message> = Partial<
  Pick<
    Runtime.RoutingApplicationConfig<Model, Message, never, never, Ports | undefined>,
    | 'routing'
    | 'ports'
    | 'crash'
    | 'slow'
    | 'viewTransition'
    | 'freezeModel'
    | 'preserveScroll'
    | 'devTools'
  >
>

/**
 * The part of a Foldkit application config a server render and a resumed
 * client need. The full `makeApplication` config fits, whichever of its four
 * shapes, and its callbacks (`routing`'s, say) are typed from `update`'s
 * Message as Foldkit types them.
 */
export interface ResumableConfig<Model, Message = any> extends ApplicationOptions<Model, Message> {
  readonly Model: Schema.Codec<Model, any, unknown, unknown>
  readonly init: (...args: ReadonlyArray<any>) => {
    readonly model: Model
    readonly commands?: ReadonlyArray<{ readonly name: string }> | undefined
  }
  readonly update: (model: Model, message: Message) => { readonly model: Model }
  readonly view: (model: Model, h: any) => unknown
  readonly container: HTMLElement | null
  readonly Flags?: unknown
  readonly subscriptions?: Readonly<Record<string, unknown>> | undefined
  readonly managedResources?: Readonly<Record<string, unknown>> | undefined
  /** The services Commands need, as Foldkit's runtime provides them. */
  readonly resources?: Layer.Layer<never, never, never> | undefined
  /**
   * Bundles whose bodies load on demand (`Bundle.lazy`). The server loads
   * them before it renders; the browser loads them before it boots, answering
   * from the markers meanwhile, so a page never shows a bundle's placeholder.
   */
  readonly lazy?: ReadonlyArray<Loadable> | undefined
}

/** What `SSR` needs of a lazy bundle: `Bundle.lazy` gives it. */
export interface Loadable {
  readonly name: string
  readonly load: () => Promise<void>
  readonly isLoaded: () => boolean
}

/**
 * The config without a `Flags` key at all. Deleted, never set to `undefined`:
 * Foldkit's server asks whether `Flags` is defined and its client whether the
 * key exists, so an `undefined` one renders and is then refused.
 */
const withoutFlags = <Config extends { readonly Flags?: unknown }>(config: Config) => {
  const { Flags: _flags, ...rest } = config
  return rest
}

/** The config whose `init` returns this start, whatever arguments it is given. */
export const startingFrom = <Model>(
  config: ResumableConfig<Model>,
  start: { readonly model: Model; readonly commands?: ReadonlyArray<unknown> },
) => ({ ...withoutFlags(config), init: () => start })

/** A route as the envelope records it: the path and the query. */
export const routeOf = (url: string): string => {
  const parsed = new URL(url, 'http://localhost')
  return `${parsed.pathname}${parsed.search}`
}

/**
 * The page's bindings, decoded through the plan's Message Schema, kept to the
 * Messages the Surfaces active for `model` may send, and checked against
 * every marker in `root`. Refused, with the reason, when the page carries
 * none, an entry is not one of the application's Messages or one no active
 * Surface lists, or a marker names a binding the page does not carry: a page
 * is answered whole or not at all.
 */
export const bindings = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  page: ParentNode,
  root: Element,
  model: Model,
): Result.Result<ReadonlyArray<DecodedBinding>, ResumeRefused> =>
  Result.map(bindingsAndEvents(plan, page, root, model), read => read.bindings)

const EnvelopeEvents = Schema.optional(Schema.Array(Schema.String))

/**
 * `bindings`, and the events the envelope says the markers name, if it says:
 * a page from before the envelope listed them leaves `listen` to find them.
 */
export const bindingsAndEvents = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  page: ParentNode,
  root: Element,
  model: Model,
): Result.Result<
  {
    readonly bindings: ReadonlyArray<DecodedBinding>
    readonly events: ReadonlyArray<string> | undefined
  },
  ResumeRefused
> => {
  const parsed = readEnvelope(page)
  if (Result.isFailure(parsed)) return Result.fail(parsed.failure)
  const read = readBindings(parsed.success.bindings ?? [])
  if (Result.isFailure(read)) {
    return refuse('Invalid', `the page's bindings are malformed: ${read.failure}`)
  }
  const encoded = read.success
  if (encoded.length > 0 && plan.surfaces.length === 0) {
    return refuse(
      'Invalid',
      'the page has bindings and the plan declares no surfaces to allow them',
    )
  }
  const events = Schema.decodeUnknownResult(EnvelopeEvents)(parsed.success.events)
  if (Result.isFailure(events)) {
    return refuse('Invalid', `the page's events are malformed: ${events.failure.message}`)
  }
  const decoded = decodeBindings(plan.Message, encoded, root, allowedTags(plan, model))
  return Result.isFailure(decoded)
    ? refuse('Invalid', decoded.failure)
    : Result.succeed({ bindings: decoded.success, events: events.success })
}

/**
 * `foldkit-ssr`: what crosses from the server to the browser when a page is
 * rendered on one and resumed on the other.
 *
 * Built from the plan in `docs/design/ssr-PLAN.md`. A resume plan names the
 * slice of the Model the browser owns. The server writes that slice into the
 * page as a JSON script; the browser reads it back and sets it onto a baseline
 * Model. Nothing outside the slice crosses, and a payload that cannot be read
 * back exactly is refused, never half-restored.
 *
 * Rendering and hydrating stay Foldkit's own: this package adds only the
 * handover.
 */
import { Cause, Effect, Exit, Option, Result, Schema, Stream, type Layer } from 'effect'
import {
  FOLDKIT_APP_ATTRIBUTE,
  FOLDKIT_FLAGS_ATTRIBUTE,
  Rendered,
  Responded,
  injectIntoTemplate,
  renderToString,
  toResponse,
  type EntryModule,
  type RenderError,
  type RenderedApplication,
} from 'foldkit/experimental/server'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import { hydrate as adopt, makeApplication, run } from 'foldkit/runtime'
import {
  Metadata,
  type ActiveSurface,
  type MetadataSummary,
  type WritableProjection,
} from 'foldkit-surface'
import { current, withContext, type Binding, type Region, type RenderContext } from './context.js'
import { FALLBACK_DEPTH_FIELD, FALLBACK_FIELD, builder, view } from './resumable.js'
import {
  EncodedBindings,
  decodeBindings,
  listen,
  type DecodedBinding,
  type EncodedBinding,
} from './listen.js'

/** The attribute on the script that carries a page's resume envelope. */
export const RESUME_ATTRIBUTE = 'data-foldkit-plus-resume'

/** The envelope format this package writes and reads. */
const PROTOCOL = 1

/**
 * JSON that is safe inside `<script type="application/json">`. Escaping `<`
 * keeps `</script`, `<!--` and `<script` out of it, as Foldkit escapes its
 * Flags. U+2028 and U+2029 are escaped too: they are fine in JSON and break a
 * reader that treats the text as JavaScript.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

export const serializeJsonScript = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029')

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
  readonly surfaces: ReadonlyArray<ActiveSurface<Model>>
  /** State another package owns, each captured and restored by that package. */
  readonly parts: ReadonlyArray<ResumePart<Model>>
  /** The application's Message Schema, which encodes the page's bindings. */
  readonly Message?: Schema.Top | undefined
  /**
   * When the browser boots the runtime: `now` on load, `idle` when the browser
   * is idle or on the first interaction, `on-interaction` on the first only.
   * Until then the page answers events from its bindings and queues the
   * Messages, which replay once the runtime has adopted the page.
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

const refuse = (reason: ResumeRefused['reason'], message: string) =>
  Result.fail(new ResumeRefused({ reason, message }))

/**
 * The slice's Schema as a codec needing no services. A resume plan's state is
 * plain data, so any field that needs one cannot cross a page anyway.
 */
const codecOf = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>) =>
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
const plan = <Model, Fields extends Schema.Struct.Fields, Commands = unknown>(
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
    readonly surfaces?: ReadonlyArray<ActiveSurface<Model>> | undefined
    readonly parts?: ReadonlyArray<ResumePart<Model>> | undefined
    readonly start?: Start | undefined
    readonly deferrable?: ReadonlyArray<string> | undefined
    readonly fallback?: 'server' | undefined
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
  const foreign = surfaces.find(
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
  }
}

/**
 * How a page's recorded route is compared with the browser's. `full` compares
 * path and query. `path` compares the path alone, ignoring a trailing slash or
 * `index.html`, for a page generated as a file: a static host serves one file
 * for every query, and for `/about` and `/about/` alike.
 */
type RouteMatch = 'full' | 'path'

/** A path as a `path` match compares it. */
const pathKey = (route: string): string => {
  const path = route.split(/[?#]/)[0] ?? ''
  const trimmed = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** The projections of the plan's Surfaces that are active for `model`. */
const activeProjections = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
) =>
  plan.surfaces.flatMap(surface => {
    const projection = surface.projectionOf(model)
    return projection === undefined ? [] : [projection]
  })

/** What the envelope carries of a Model: the encoded slice, and each part's capture. */
interface Payload {
  readonly state: unknown
  readonly parts?: Readonly<Record<string, unknown>>
}

/**
 * What the envelope carries of `model`: the plan's slice, encoded through its
 * own Schema, and each part's capture.
 */
const payloadOf = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
): Payload => {
  const state = Schema.encodeSync(codecOf(plan.state.schema))(plan.state.get(model))
  if (plan.parts.length === 0) return { state }
  const projections = activeProjections(plan, model)
  return {
    state,
    parts: Object.fromEntries(plan.parts.map(part => [part.id, part.capture(model, projections)])),
  }
}

/**
 * The Model a payload resumes: the baseline with the slice set onto it, then
 * each part restored, in order. Every part the plan names must be there and
 * restore, and no other may be: a page is never half-restored.
 */
const modelFrom = <Model, Fields extends Schema.Struct.Fields>(
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

interface EnvelopeOptions {
  readonly route?: string | undefined
  readonly match?: RouteMatch | undefined
  readonly bindings?: ReadonlyArray<EncodedBinding> | undefined
}

/**
 * The script a server writes into its page's template: the plan's slice of
 * `model`, encoded through the slice's own Schema, each part's capture, and
 * the route it was rendered for, if it was rendered for one.
 */
const envelope = <Model, Fields extends Schema.Struct.Fields>(
  resume: ResumePlan<Model, Fields>,
  model: Model,
  options: EnvelopeOptions = {},
): string => envelopeOf(resume, payloadOf(resume, model), options)

/** The envelope script for a payload already built. */
const envelopeOf = <Model, Fields extends Schema.Struct.Fields>(
  resume: ResumePlan<Model, Fields>,
  payload: Payload,
  options: EnvelopeOptions,
): string => {
  const body = serializeJsonScript({
    v: PROTOCOL,
    plan: resume.id,
    ...payload,
    ...(options.route === undefined ? {} : { route: options.route }),
    ...(options.match === 'path' ? { match: 'path' } : {}),
    ...(options.bindings === undefined || options.bindings.length === 0
      ? {}
      : { bindings: options.bindings }),
  })
  return `<script type="application/json" ${RESUME_ATTRIBUTE}>${body}</script>`
}

/** The page's one envelope, parsed; refused when there is none, more than one, or not JSON. */
const readEnvelope = (
  page: ParentNode,
): Result.Result<Readonly<Record<string, unknown>>, ResumeRefused> => {
  const scripts = page.querySelectorAll(`script[${RESUME_ATTRIBUTE}]`)
  if (scripts.length === 0) return refuse('Missing', 'the page holds no resume envelope')
  if (scripts.length > 1) {
    return refuse('Duplicate', `the page holds ${scripts.length} resume envelopes`)
  }
  try {
    const parsed: unknown = JSON.parse(scripts[0]!.textContent ?? '')
    return Result.succeed((parsed ?? {}) as Readonly<Record<string, unknown>>)
  } catch (error) {
    return refuse('Unreadable', `the resume envelope is not JSON: ${String(error)}`)
  }
}

/**
 * The Model a page resumes from: the baseline with the envelope's slice set
 * onto it. Refused, with the reason, when the page holds no envelope or more
 * than one, when it is not this protocol or this plan, or when the slice does
 * not decode through the plan's Schema. A page is never half-restored.
 */
const resume = <Model, Fields extends Schema.Struct.Fields>(
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

/**
 * The Model the browser will start from when the server's Model is `model`:
 * the payload taken through the page as the envelope carries it, as JSON, and
 * resumed exactly as `SSR.resume` resumes it. A part that cannot restore its
 * own capture fails here, on the server.
 */
const browserModelOf = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  payload: Payload,
): Result.Result<Model, string> => modelFrom(plan, JSON.parse(serializeJsonScript(payload)))

/** Where the browser gets a Model path's value: the envelope, the baseline, or nowhere it may. */
export type Cover = 'state' | 'local' | 'missing'

/** One Surface as a plan covers it, for the server's Model. */
export interface SurfaceCoverage {
  readonly name: string
  /** Whether the Surface is active for the server's Model. */
  readonly active: boolean
  /** The place a `Surface.when` activation reads; absent for `Surface.at`. */
  readonly activation?: { readonly path: string; readonly cover: Cover } | undefined
  /** The Model paths the active Surface reads. */
  readonly reads: ReadonlyArray<{ readonly path: string; readonly cover: Cover }>
  /**
   * What the active Surface reads that no Model path names, such as Remote
   * data, by its metadata. The slice cannot carry it.
   */
  readonly unresumed: ReadonlyArray<MetadataSummary>
  /** Whether the browser's Model activates it the same way, with the same reads. */
  readonly sameInBrowser: boolean
}

/** What a plan sends, what it leaves local, and how it covers each Surface. */
export interface PlanInspection {
  readonly id: string
  readonly state: ReadonlyArray<string>
  readonly local: ReadonlyArray<string>
  /** The ids of the parts that resume state the slice cannot carry. */
  readonly parts: ReadonlyArray<string>
  readonly surfaces: ReadonlyArray<SurfaceCoverage>
}

const pathOf = (path: ReadonlyArray<string>): string =>
  path.length === 0 ? '(the whole Model)' : path.join('.')

/**
 * A path is covered by a sent or local path equal to it or containing it. An
 * empty path is the whole Model, which no pick covers.
 */
const coverOf = (
  path: ReadonlyArray<string>,
  plan: {
    readonly state: { readonly dependencies: ReadonlyArray<ReadonlyArray<string>> }
    readonly local: ReadonlyArray<ReadonlyArray<string>>
  },
): Cover => {
  const contains = (outer: ReadonlyArray<string>) =>
    outer.length > 0 &&
    outer.length <= path.length &&
    outer.every((key, index) => path[index] === key)
  if (plan.state.dependencies.some(contains)) return 'state'
  if (plan.local.some(contains)) return 'local'
  return 'missing'
}

/** A projection's reads as one comparable string, or `inactive`. */
const readsKey = (
  projection:
    | {
        readonly dependencies: ReadonlyArray<ReadonlyArray<string>>
        readonly metadata: Metadata
      }
    | undefined,
): string =>
  projection === undefined
    ? 'inactive'
    : JSON.stringify([projection.dependencies, Metadata.summarize(projection.metadata)])

/**
 * How a plan covers each of its Surfaces when the server's Model is `model`.
 * A Surface's reads depend on the Model, through its params, so coverage is
 * worked out for a Model, not for the plan alone.
 */
const inspect = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
): PlanInspection => {
  const resumed = browserModelOf(plan, payloadOf(plan, model))
  if (Result.isFailure(resumed)) throw new Error(`SSR.inspect: ${resumed.failure}`)
  return coverage(plan, model, resumed.success)
}

/** How a plan covers its Surfaces, given the server's Model and the browser's. */
const coverage = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
  browser: Model,
): PlanInspection => {
  const covered = new Set(plan.parts.flatMap(part => part.covers))
  return {
    id: plan.id,
    state: plan.state.dependencies.map(pathOf),
    local: plan.local.map(pathOf),
    parts: plan.parts.map(part => part.id),
    surfaces: plan.surfaces.map(surface => {
      const served = surface.projectionOf(model)
      return {
        name: surface.name,
        active: served !== undefined,
        ...(surface.activation === undefined
          ? {}
          : {
              activation: {
                path: pathOf(surface.activation.path),
                cover: coverOf(surface.activation.path, plan),
              },
            }),
        reads: (served?.dependencies ?? []).map(path => ({
          path: pathOf(path),
          cover: coverOf(path, plan),
        })),
        unresumed:
          served === undefined
            ? []
            : Metadata.summarize(served.metadata).filter(summary => !covered.has(summary.name)),
        sameInBrowser: readsKey(served) === readsKey(surface.projectionOf(browser)),
      }
    }),
  }
}

/** Each way an inspection shows the plan falls short, one line each. */
const shortfalls = (inspection: PlanInspection): ReadonlyArray<string> =>
  inspection.surfaces.flatMap(surface => [
    ...(surface.activation?.cover === 'missing'
      ? [
          `Surface "${surface.name}" is activated by ${surface.activation.path}, which is neither in the plan's state nor local`,
        ]
      : []),
    ...surface.reads
      .filter(read => read.cover === 'missing')
      .map(
        read =>
          `Surface "${surface.name}" reads ${read.path}, which is neither in the plan's state nor local`,
      ),
    ...surface.unresumed.map(
      summary =>
        `Surface "${surface.name}" reads ${summary.name} data (${summary.entries.join(', ')}), which no part of the plan resumes`,
    ),
    ...(surface.sameInBrowser
      ? []
      : [
          `Surface "${surface.name}" is ${surface.active ? 'active' : 'inactive'} on the server and activates differently from the Model the browser starts from`,
        ]),
  ])

/** Why a server refused to render a page against its plan. */
export class ResumeUnsafe extends Schema.TaggedError<ResumeUnsafe>()('ResumeUnsafe', {
  reason: Schema.Literals([
    'UndeclaredStartup',
    'Uncovered',
    'ViewDependsOnUnsentState',
    'DuplicateStaticRegion',
    'UngeneratablePath',
    'UnrestorablePart',
    'UnencodableBinding',
    'EagerStartRequired',
    'UndeclaredSurfaces',
    'BindingInStaticRegion',
  ]),
  message: Schema.String,
}) {}

/** The tag a Message value carries, for naming it. */
const tagOf = (message: unknown): string =>
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
const allowedTags = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
): ReadonlySet<string> =>
  new Set(
    plan.surfaces.flatMap(surface =>
      surface.projectionOf(model) === undefined ? [] : surface.messages,
    ),
  )

/** Each binding whose Message no active Surface lists, one line each. */
const unlistedBindings = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
  bindings: ReadonlyArray<Binding>,
): ReadonlyArray<string> => {
  const allowed = allowedTags(plan, model)
  return bindings
    .filter(binding => !allowed.has(tagOf(binding.message)))
    .map(
      binding =>
        `the ${binding.event} binding on ${binding.element} dispatches ${tagOf(binding.message)}, which no active Surface lists in its messages`,
    )
}

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
const staticRegion = (id: string, render: (ih: HtmlBuilder<never>) => Region): Html => {
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

/** Each static region's markup in the page, read before hydration touches it. */
const snapshotsOf = (root: Element): ReadonlyMap<string, string> =>
  new Map(
    Array.from(root.querySelectorAll(`[${STATIC_ATTRIBUTE}]`), element => [
      element.getAttribute(STATIC_ATTRIBUTE) ?? '',
      element.innerHTML,
    ]),
  )

/**
 * The part of a Foldkit application config a server render and a resumed
 * client need. The full `makeApplication` config fits.
 */
export interface ResumableConfig<Model> {
  readonly Model: Schema.Codec<Model, any, unknown, unknown>
  readonly init: (...args: ReadonlyArray<any>) => {
    readonly model: Model
    readonly commands?: ReadonlyArray<{ readonly name: string }> | undefined
  }
  readonly update: (model: Model, message: any) => { readonly model: Model }
  readonly view: (model: Model, h: any) => unknown
  readonly container: HTMLElement | null
  readonly Flags?: unknown
  readonly routing?: unknown
  readonly subscriptions?: Readonly<Record<string, unknown>> | undefined
  readonly managedResources?: Readonly<Record<string, unknown>> | undefined
  /** The services Commands need, as Foldkit's runtime provides them. */
  readonly resources?: Layer.Layer<any, any, never> | undefined
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

/** Loads every lazy bundle's bodies, so the view renders whole. */
const loadLazy = (config: { readonly lazy?: ReadonlyArray<Loadable> | undefined }) =>
  Effect.promise(() => Promise.all((config.lazy ?? []).map(bundle => bundle.load())))

/**
 * The build attribute on Foldkit's hydration root. Foldkit does not export it,
 * as it does the app and Flags attributes; a test pins it to what Foldkit's
 * server stamps.
 */
const BUILD_ATTRIBUTE = 'data-foldkit-build'

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
const startingFrom = <Model>(
  config: ResumableConfig<Model>,
  start: { readonly model: Model; readonly commands?: ReadonlyArray<unknown> },
) => ({ ...withoutFlags(config), init: () => start })

/** A route as the envelope records it: the path and the query. */
const routeOf = (url: string): string => {
  const parsed = new URL(url, 'http://localhost')
  return `${parsed.pathname}${parsed.search}`
}

/** Foldkit's own Flags script, which a resumed page never carries. */
const FLAGS_SCRIPT = new RegExp(
  `<script[^>]*${FOLDKIT_FLAGS_ATTRIBUTE}[^>]*>[\\s\\S]*?</script>`,
  'g',
)

/**
 * The head fields a render returns beside the body. Each is read by the view,
 * so each must come out the same from the browser's Model; since Foldkit 0.163
 * none has a default from the URL.
 */
const HEAD_FIELDS = ['title', 'lang', 'dir', 'canonical', 'ogUrl'] as const

/** A render's bindings, encoded, or why one cannot be. */
const encodeBindings = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  bindings: ReadonlyArray<Binding>,
): Result.Result<ReadonlyArray<EncodedBinding>, string> => {
  if (bindings.length === 0) return Result.succeed([])
  if (plan.Message === undefined) {
    return Result.fail(
      'the page has bindings, and the plan has no Message Schema to encode them with: make the plan from the application',
    )
  }
  const encode = Schema.encodeUnknownResult(plan.Message as Schema.Codec<unknown, unknown>)
  const out: Array<EncodedBinding> = []
  for (const binding of bindings) {
    const message = encode(binding.message)
    if (Result.isFailure(message)) {
      return Result.fail(
        `the ${binding.event} binding on ${binding.element} does not encode as a Message: ${message.failure.message}`,
      )
    }
    out.push({
      attribute: binding.attribute,
      message: message.success,
      ...(binding.hole === undefined ? {} : { hole: binding.hole }),
      ...(binding.depth === undefined ? {} : { depth: binding.depth }),
      ...(binding.options === undefined ? {} : { options: binding.options }),
    })
  }
  return Result.succeed(out)
}

/**
 * The bindings that differ between the server's render and the browser's, by
 * element: a Message built from a field the plan does not send would dispatch
 * one Message before boot and another after.
 */
const changedBindings = (
  served: ReadonlyArray<Binding>,
  encoded: ReadonlyArray<EncodedBinding>,
  reencoded: ReadonlyArray<EncodedBinding>,
): ReadonlyArray<string> =>
  served.flatMap((binding, index) =>
    JSON.stringify(encoded[index]) === JSON.stringify(reencoded[index])
      ? []
      : [`${binding.event} binding on ${binding.element}`],
  )

/**
 * The Subscription and Managed Resource entries that would start late under a
 * deferred boot and are not declared deferrable, by the plan or by a part.
 * Foldkit starts every Subscription's stream at boot, so every entry counts; a
 * Managed Resource counts when the Model asks for it.
 */
const eagerEntries = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  model: Model,
): ReadonlyArray<string> => {
  if (plan.start === 'now') return []
  const declared = (key: string, entry: unknown) =>
    plan.deferrable.includes(key) || plan.parts.some(part => part.deferrable?.(key, entry) === true)
  const subscriptions = Object.entries(config.subscriptions ?? {}).filter(
    ([key, entry]) => !declared(key, entry),
  )
  const resources = Object.entries(config.managedResources ?? {}).filter(([key, entry]) => {
    const asks = (
      entry as { modelToMaybeRequirements?: (model: Model) => unknown }
    ).modelToMaybeRequirements?.(model)
    const active = Option.isOption(asks) ? Option.isSome(asks) : asks !== undefined
    return active && !declared(key, entry)
  })
  return [
    ...subscriptions.map(([key]) => `subscription "${key}"`),
    ...resources.map(([key]) => `resource "${key}"`),
  ]
}

/**
 * Renders a page on the server against a resume plan.
 *
 * The application's `init` runs once. Its Model's slice is round-tripped
 * through the plan's Schema and set onto the baseline, which is the Model the
 * browser will start from, and the page is rendered from that Model. Every
 * way the browser could start somewhere else is a `ResumeUnsafe`, whose
 * `reason` names it; the README lists them. The one that matters most: the
 * view rendered from the browser's Model differs from the one rendered from
 * the server's, because it reads a field the plan leaves out. In production
 * Foldkit would rebuild that part of the page silently, so this is the one
 * place it shows.
 */
const render = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly url?: string | undefined
    readonly flags?: unknown
  },
): Effect.Effect<
  { readonly rendered: RenderedApplication; readonly envelope: string },
  RenderError | ResumeUnsafe
> => renderMatching(config, plan, options, 'full')

const renderMatching = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly url?: string | undefined
    readonly flags?: unknown
  },
  match: RouteMatch,
): Effect.Effect<
  { readonly rendered: RenderedApplication; readonly envelope: string },
  RenderError | ResumeUnsafe
> =>
  Effect.gen(function* () {
    yield* loadLazy(config)
    let served: ReturnType<ResumableConfig<Model>['init']> | undefined
    const regions = new Map<string, Region>()
    const duplicates = new Set<string>()
    const servedBindings: Array<Binding> = []
    const browserBindings: Array<Binding> = []
    const inStatic: Array<{ region: string; element: string; event: string }> = []
    const fallback = fallbackEncoder(plan)
    const capturing = withContext(
      { ...config, init: (...args: ReadonlyArray<unknown>) => (served = config.init(...args)) },
      {
        mode: 'collect',
        regions,
        duplicates,
        bindings: servedBindings,
        fallback,
        wrap: message => message,
        depth: 0,
        region: undefined,
        inStatic,
      },
    )
    const full = yield* renderToString(capturing as never, options as never)
    if (duplicates.size > 0) {
      return yield* new ResumeUnsafe({
        reason: 'DuplicateStaticRegion',
        message: `two static regions share the id ${[...duplicates].map(id => `"${id}"`).join(', ')}: the browser could adopt only one`,
      })
    }
    if (inStatic.length > 0) {
      const found = inStatic.map(
        ({ region, element, event }) => `a ${event} handler on ${element} in "${region}"`,
      )
      return yield* new ResumeUnsafe({
        reason: 'BindingInStaticRegion',
        message: `a static region is the server's alone, and these would never run: ${found.join(', ')}. What a Message changes belongs in a Surface`,
      })
    }
    const started = served!
    const commands = started.commands ?? []
    if (commands.length > 0 && plan.boot === undefined) {
      return yield* new ResumeUnsafe({
        reason: 'UndeclaredStartup',
        message: `init returned ${commands.map(command => command.name).join(', ')}, which no browser would run: name them in the plan's boot`,
      })
    }

    // Built once: each part's capture reads the whole store it owns.
    const payload = payloadOf(plan, started.model)
    const resumed = browserModelOf(plan, payload)
    if (Result.isFailure(resumed)) {
      return yield* new ResumeUnsafe({ reason: 'UnrestorablePart', message: resumed.failure })
    }
    const browser = resumed.success

    const eager = eagerEntries(config, plan, started.model)
    if (eager.length > 0) {
      return yield* new ResumeUnsafe({
        reason: 'EagerStartRequired',
        message: `the plan starts ${plan.start}, and these would start late: ${eager.join(', ')}. Name each in the plan's deferrable, or start now`,
      })
    }

    if (servedBindings.length > 0 && plan.surfaces.length === 0) {
      return yield* new ResumeUnsafe({
        reason: 'UndeclaredSurfaces',
        message: `the page has ${servedBindings.length} binding${servedBindings.length === 1 ? '' : 's'} and the plan declares no surfaces, so nothing says which Messages it may dispatch: name them in the plan's surfaces`,
      })
    }
    const uncovered = [
      ...shortfalls(coverage(plan, started.model, browser)),
      ...unlistedBindings(plan, started.model, servedBindings),
    ]
    if (uncovered.length > 0) {
      return yield* new ResumeUnsafe({
        reason: 'Uncovered',
        message: `the plan does not cover what the browser reads:\n- ${uncovered.join('\n- ')}`,
      })
    }

    // With no `Flags` key in the config, Foldkit writes no Flags script.
    const rendered = yield* renderToString(
      withContext(startingFrom(config, { model: browser }), {
        mode: 'replay',
        regions,
        bindings: browserBindings,
        fallback,
        wrap: message => message,
        depth: 0,
      }) as never,
      options as never,
    )
    const encoded = encodeBindings(plan, servedBindings)
    const reencoded = encodeBindings(plan, browserBindings)
    if (Result.isFailure(encoded)) {
      return yield* new ResumeUnsafe({ reason: 'UnencodableBinding', message: encoded.failure })
    }
    const differing = [
      ...(full.html.replace(FLAGS_SCRIPT, '') === rendered.html ? [] : ['body']),
      ...HEAD_FIELDS.filter(field => full[field] !== rendered[field]),
      ...changedBindings(
        servedBindings,
        encoded.success,
        Result.isFailure(reencoded) ? [] : reencoded.success,
      ),
    ]
    if (differing.length > 0) {
      return yield* new ResumeUnsafe({
        reason: 'ViewDependsOnUnsentState',
        message: `the view differs in its ${differing.join(', ')} when rendered from the Model the browser will start from: it reads a field the plan leaves out`,
      })
    }
    return {
      rendered,
      envelope: envelopeOf(plan, payload, {
        ...(options.url === undefined
          ? {}
          : { route: match === 'path' ? pathKey(routeOf(options.url)) : routeOf(options.url) }),
        match,
        bindings: encoded.success,
      }),
    }
  })

/**
 * The page to serve: the rendered application in the template, with the
 * envelope before `</body>`. Not in the rendered HTML, which
 * `injectIntoTemplate` requires to hold only the root and Foldkit's payload.
 */
const page = (
  template: string,
  result: { readonly rendered: RenderedApplication; readonly envelope: string },
): string =>
  injectIntoTemplate(template.replace('</body>', `${result.envelope}</body>`), result.rendered)

/** A page generated at build time, and the file a static host serves it from. */
export interface GeneratedPage {
  readonly path: string
  readonly file: string
  readonly html: string
}

/**
 * One generated page per path, in the paths' order: a tuple when the paths
 * are written out, so `const [home, about] = pages` needs no check.
 */
export type GeneratedPages<Paths extends ReadonlyArray<string>> = {
  readonly [K in keyof Paths]: GeneratedPage
}

/** The file a static host serves for a path: `/about` is `about/index.html`. */
const fileOf = (path: string): string => {
  const trimmed = path.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return 'index.html'
  return trimmed.endsWith('.html') ? trimmed : `${trimmed}/index.html`
}

/**
 * Renders pages at build time, one per path, each as `SSR.render` and
 * `SSR.page` would, to be written as files. `origin` makes each path the full
 * URL a routing application parses. `flags`, when the application has them,
 * gives each path its own.
 *
 * A generated page records its path alone: a static host serves the same file
 * whatever the query, so the browser checks the path and ignores the query. A
 * path with a query or fragment, or two paths that would be one file, are
 * refused.
 */
const generate = <
  Model,
  Fields extends Schema.Struct.Fields,
  const Paths extends ReadonlyArray<string>,
>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly template: string
    readonly origin: string
    readonly paths: Paths
    readonly flags?: ((path: string) => unknown) | undefined
  },
): Effect.Effect<GeneratedPages<Paths>, RenderError | ResumeUnsafe> =>
  Effect.gen(function* () {
    const files = new Map<string, string>()
    for (const path of options.paths) {
      if (!path.startsWith('/') || /[?#]/.test(path)) {
        return yield* new ResumeUnsafe({
          reason: 'UngeneratablePath',
          message: `"${path}" is not a path a file can be served at: start it with / and leave out any query or fragment`,
        })
      }
      const other = files.get(fileOf(path))
      if (other !== undefined) {
        return yield* new ResumeUnsafe({
          reason: 'UngeneratablePath',
          message: `"${other}" and "${path}" would both be written to ${fileOf(path)}`,
        })
      }
      files.set(fileOf(path), path)
    }
    const pages = yield* Effect.forEach(options.paths, path =>
      Effect.map(
        renderMatching(
          config,
          plan,
          {
            buildId: options.buildId,
            url: new URL(path, options.origin).href,
            ...(options.flags === undefined ? {} : { flags: options.flags(path) }),
          },
          'path',
        ),
        result => ({ path, file: fileOf(path), html: page(options.template, result) }),
      ),
    )
    // One page per path, in order, so the array is the tuple the paths describe.
    return pages as unknown as GeneratedPages<Paths>
  })

/**
 * The server entry for Foldkit's fetch handler: the `renderPage` that
 * `handleRequest` calls, and that the `fetch.js` a Foldkit build emits
 * exports, so a resumed page is served by Node and Workers alike.
 *
 * `GET` and `HEAD` render the page against the plan, with the request's URL
 * and, when the application has Flags, `flags(request)`. `POST` goes to
 * `SSR.handle` when the plan has a server fallback, and is answered `400` when
 * the post is unusable. Any other method is answered `405` (`handleRequest`
 * passes every method through). A render that fails, or a plan the render
 * refuses, is answered `500` with the reason logged, never with a page the
 * browser cannot resume.
 *
 * The page is answered whole, as `Responded`: a `Rendered` result is placed in
 * `handleRequest`'s one template, which has no place for a per-request
 * envelope. Foldkit's own `toResponse` still builds the response, from a
 * template that already holds the envelope, so the headers and the
 * injection are Foldkit's. `handleRequest` still classifies static misses and
 * answers `HEAD` without a body.
 */
const entry = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly template: string
    readonly containerId?: string | undefined
    readonly flags?: ((request: Request) => unknown | PromiseLike<unknown>) | undefined
  },
): EntryModule => ({
  renderPage: async request => {
    const method = request.method.toUpperCase()
    const posting = method === 'POST' && plan.fallback === 'server'
    if (method !== 'GET' && method !== 'HEAD' && !posting) {
      const allow = plan.fallback === 'server' ? 'GET, HEAD, POST' : 'GET, HEAD'
      return Responded(new Response(null, { status: 405, headers: { allow } }))
    }
    const flagsOf = options.flags
    // `Effect.result` would miss a defect, such as a view that throws, and a
    // `flags` that throws or rejects is not in the Effect at all: both would
    // reject `renderPage` instead of answering it.
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const flags =
          flagsOf === undefined ? undefined : yield* Effect.tryPromise(async () => flagsOf(request))
        const flagged = flagsOf === undefined ? {} : { flags }
        return posting
          ? yield* handle(request, config, plan, { buildId: options.buildId, ...flagged })
          : yield* render(config, plan, { buildId: options.buildId, url: request.url, ...flagged })
      }),
    )
    if (Exit.isFailure(exit)) {
      const refused = Cause.findErrorOption(exit.cause).pipe(
        Option.filter(error => error instanceof FallbackRefused),
      )
      if (Option.isSome(refused)) {
        return Responded(
          new Response(`The form could not be handled: ${refused.value.message}`, {
            status: 400,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
        )
      }
      console.error(`[foldkit-ssr] ${request.url} was not rendered: ${Cause.pretty(exit.cause)}`)
      return Responded(
        new Response('The page could not be rendered.', {
          status: 500,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      )
    }
    const template = options.template.replace('</body>', `${exit.value.envelope}</body>`)
    return Responded(
      toResponse(
        template,
        Rendered(exit.value.rendered),
        options.containerId === undefined ? undefined : { containerId: options.containerId },
      ),
    )
  },
})

/**
 * Starts the browser from the page's resumed Model, without running `init`.
 *
 * In the order Foldkit checks a page: the build id first, before the payload
 * is read, then the envelope and its route. A page from another build is
 * refused by Foldkit itself. A page that cannot resume is refused and contained
 * by Foldkit's own refusal, and the reason is logged. A server page is never
 * rendered again on the client. A page with no server render at all, no
 * stamped root, is rendered on the client as usual.
 */
const hydrate = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: { readonly buildId: string },
): void => {
  const root = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  if (root === null) {
    run(makeApplication(config as never))
    return
  }
  const program = (start: { readonly model: Model; readonly commands?: ReadonlyArray<unknown> }) =>
    makeApplication({ ...startingFrom(config, start), container: root } as never)
  if (root.getAttribute(BUILD_ATTRIBUTE) !== options.buildId) {
    adopt(program({ model: plan.baseline }), { buildId: options.buildId })
    return
  }
  const resumed = resume(plan, document, { route: routeOf(window.location.href) })
  if (Result.isFailure(resumed)) {
    console.error(`[foldkit-ssr] the page cannot resume: ${resumed.failure.message}`)
    // Foldkit refuses an empty build id and contains the page, so the page is
    // refused the way Foldkit refuses one, with nothing copied here.
    adopt(program({ model: plan.baseline }), { buildId: '' })
    return
  }
  const model = resumed.success
  const commands = (plan.boot?.(model) as ReadonlyArray<unknown> | undefined) ?? []
  const resuming: RenderContext = {
    mode: 'resume',
    snapshots: snapshotsOf(root),
    reported: new Set(),
  }
  const boot = (subscriptions: Readonly<Record<string, unknown>> = {}) =>
    adopt(
      makeApplication({
        ...withContext(startingFrom(config, { model, commands }), resuming),
        container: root,
        subscriptions: { ...config.subscriptions, ...subscriptions },
      } as never),
      { buildId: options.buildId },
    )
  const pending = (config.lazy ?? []).filter(bundle => !bundle.isLoaded())
  if (plan.start === 'now' && pending.length === 0) {
    boot()
    return
  }
  const decoded = bindings(plan, document, root, model)
  if (Result.isFailure(decoded)) {
    console.error(`[foldkit-ssr] the page cannot resume: ${decoded.failure.message}`)
    adopt(program({ model: plan.baseline }), { buildId: '' })
    return
  }
  deferBoot(root, decoded.success, plan.start, boot, pending)
}

/**
 * Lets the page answer from its bindings until something asks for the
 * runtime, then boots it with the answers queued for replay.
 *
 * The queued Messages reach the runtime through one Subscription entry added
 * for the purpose, so they go through Foldkit's own queue, in order, after
 * its first render, and the Model ends where an eager boot would have taken
 * it. When lazy bundles must load first, the boot waits for them.
 */
const deferBoot = (
  root: HTMLElement,
  decoded: ReadonlyArray<DecodedBinding>,
  start: Start,
  boot: (subscriptions: Readonly<Record<string, unknown>>) => void,
  pending: ReadonlyArray<Loadable>,
): void => {
  const queue: Array<unknown> = []
  // Events only the live page can answer, met while the bodies were loading.
  const unanswered: Array<{ readonly event: Event; readonly element: Element }> = []
  let booted = false
  // Foldkit's hydrate runs its first render before returning: it adopts the
  // page and attaches its listeners. So the event that boots the page, still
  // in dispatch, reaches the live page afterwards, unless a bundle's bodies
  // are still on their way; then the page gets the event again once booted.
  const stop = listen(root, {
    bindings: decoded,
    onAnswer: ({ event, messages, unnamed }) => {
      // An answer the markers could not complete is left to the live page.
      if (unnamed !== undefined) {
        // Kept for a boot still waiting on bodies; one that just committed
        // has stopped listening and reads this no more.
        startNow()
        unanswered.push({ event, element: unnamed })
        return
      }
      // Answered here and replayed after boot: the live page must not answer
      // this one as well.
      queue.push(...messages)
      startNow()
      event.stopPropagation()
    },
  })
  const replay = {
    dependenciesSchema: Schema.Null,
    modelToDependencies: () => null,
    dependenciesToStream: () => Stream.fromIterable(queue),
  }
  const commit = () => {
    boot({ 'foldkit-ssr.replay': replay })
    stop()
    for (const { event, element } of unanswered.splice(0)) {
      const Ctor = event.constructor as new (type: string, init: Event) => Event
      element.dispatchEvent(new Ctor(event.type, event))
    }
  }
  const startNow = () => {
    if (booted) return
    booted = true
    if (pending.length === 0) {
      commit()
      return
    }
    void Promise.all(pending.map(bundle => bundle.load())).then(commit, (error: unknown) => {
      console.error(`[foldkit-ssr] a bundle's bodies did not load: ${String(error)}`)
      commit()
    })
  }
  if (start === 'now') startNow()
  else if (start === 'idle') {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(startNow)
    else setTimeout(startNow, 0)
  }
}

/** How a form's Message is written into the page for the fallback, when the plan has one. */
const fallbackEncoder = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
): ((message: unknown) => string | undefined) | undefined => {
  if (plan.fallback !== 'server' || plan.Message === undefined) return undefined
  const encode = Schema.encodeUnknownResult(plan.Message as Schema.Codec<unknown, unknown>)
  return message => {
    const encoded = encode(message)
    return Result.isFailure(encoded) ? undefined : JSON.stringify(encoded.success)
  }
}

/** Why a posted form was not handled: the request, not the page or the plan, is at fault. */
export class FallbackRefused extends Schema.TaggedError<FallbackRefused>()('FallbackRefused', {
  reason: Schema.Literals(['Missing', 'Unreadable', 'Invalid', 'Unlisted', 'NoFallback']),
  message: Schema.String,
}) {}

const refuseFallback = (reason: FallbackRefused['reason'], message: string) =>
  Effect.fail(new FallbackRefused({ reason, message }))

/** A Command as Foldkit runs it: named, with the Effect that yields its Message. */
interface RunnableCommand {
  readonly name: string
  readonly effect: Effect.Effect<unknown, unknown, any>
}

const isRunnable = (command: unknown): command is RunnableCommand =>
  typeof command === 'object' &&
  command !== null &&
  'effect' in command &&
  Effect.isEffect(command.effect)

/**
 * The most Messages and Commands one post may run. The browser's loop runs
 * for the life of the page, so a Command that schedules itself again, a tick
 * or a poll, is ordinary there; on the server it would hold the request open
 * for ever.
 */
const MAX_STEPS = 100

/**
 * Foldkit's loop, once, on the server: `update` for each Message, then each
 * returned Command run under the config's `resources`, its Message folded
 * back through `update`, until no Command remains.
 */
const fold = <Model>(
  config: ResumableConfig<Model>,
  model: Model,
  messages: ReadonlyArray<unknown>,
  commands: ReadonlyArray<unknown>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let current = model
    const pending = [...messages]
    const queue = [...commands]
    let steps = 0
    let last = ''
    while (pending.length > 0 || queue.length > 0) {
      if (++steps > MAX_STEPS) {
        return yield* Effect.die(
          new Error(
            `SSR.handle: the post did not settle within ${MAX_STEPS} Messages and Commands; the last Command run was "${last}". A Command that schedules itself again cannot run on the server`,
          ),
        )
      }
      if (pending.length > 0) {
        const next = config.update(current, pending.shift()) as {
          readonly model: Model
          readonly commands?: ReadonlyArray<unknown> | undefined
        }
        current = next.model
        queue.push(...(next.commands ?? []))
        continue
      }
      const command = queue.shift()
      if (!isRunnable(command)) {
        return yield* Effect.die(
          new Error(`SSR.handle: a Command has no Effect to run: ${JSON.stringify(command)}`),
        )
      }
      // A Command that fails would crash Foldkit's runtime; here it is a defect
      // the entry answers with 500, since the config declares its requirements.
      const provided: Effect.Effect<unknown, unknown, never> =
        config.resources === undefined
          ? (command.effect as Effect.Effect<unknown, unknown, never>)
          : (Effect.provide(command.effect, config.resources) as Effect.Effect<
              unknown,
              unknown,
              never
            >)
      last = command.name
      const result = yield* Effect.orDie(provided)
      // A Command fired and forgotten yields no Message, and folds nothing in.
      if (result !== undefined && result !== null) pending.push(result)
    }
    return current
  })

/** The Model `init` gives this request, as the server's render would start from. */
const startOf = <Model>(
  config: ResumableConfig<Model>,
  options: { readonly url?: string | undefined; readonly flags?: unknown },
): Effect.Effect<ReturnType<ResumableConfig<Model>['init']>, RenderError> =>
  Effect.gen(function* () {
    let started: ReturnType<ResumableConfig<Model>['init']> | undefined
    yield* renderToString(
      {
        ...config,
        init: (...args: ReadonlyArray<unknown>) => (started = config.init(...args)),
      } as never,
      { buildId: 'x', ...options } as never,
    )
    return started!
  })

/**
 * Answers a form posted by a page rendered with `fallback: 'server'`: the
 * posted Message is decoded through the plan's Message Schema, with posted
 * fields of the same names as its own overriding them, and must be one the
 * Surfaces active for the request's Model may send. The server then rebuilds
 * that Model as a render would, `init` and then the plan's `boot`, runs
 * `update` with the Message and every Command that follows, and renders the
 * result as a fresh page.
 */
const handle = <Model, Fields extends Schema.Struct.Fields>(
  request: Request,
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: { readonly buildId: string; readonly flags?: unknown },
): Effect.Effect<
  { readonly rendered: RenderedApplication; readonly envelope: string },
  RenderError | ResumeUnsafe | FallbackRefused
> =>
  Effect.gen(function* () {
    if (plan.fallback !== 'server' || plan.Message === undefined) {
      return yield* refuseFallback('NoFallback', `plan "${plan.id}" has no server fallback`)
    }
    const form = yield* Effect.tryPromise({
      try: () => request.formData(),
      catch: () => new FallbackRefused({ reason: 'Unreadable', message: 'the body is not a form' }),
    })
    const posted = form.get(FALLBACK_FIELD)
    if (typeof posted !== 'string') {
      return yield* refuseFallback('Missing', `the form carries no ${FALLBACK_FIELD} field`)
    }
    let raw: unknown
    try {
      raw = JSON.parse(posted)
    } catch {
      return yield* refuseFallback('Unreadable', `${FALLBACK_FIELD} is not JSON`)
    }
    const decode = Schema.decodeUnknownResult(plan.Message as Schema.Codec<unknown, unknown>)
    const invalid = (failure: { readonly message: string }) =>
      refuseFallback('Invalid', `the posted Message does not decode: ${failure.message}`)
    // The posted Message is decoded before anything reads it.
    const written = decode(raw)
    if (Result.isFailure(written)) return yield* invalid(written.failure)
    // A form inside a placement posts the parent's Message; the fields it
    // names sit `depth` wrappers down.
    const postedDepth = form.get(FALLBACK_DEPTH_FIELD) ?? '0'
    if (typeof postedDepth !== 'string' || !/^\d{1,2}$/.test(postedDepth)) {
      return yield* refuseFallback('Unreadable', `${FALLBACK_DEPTH_FIELD} is not a depth`)
    }
    const override = (value: unknown, down: number): unknown => {
      if (typeof value !== 'object' || value === null) return value
      const copy: Record<string, unknown> = { ...value }
      if (down > 0) {
        copy.message = override(copy.message, down - 1)
        return copy
      }
      form.forEach((field, name) => {
        if (name !== FALLBACK_FIELD && Object.hasOwn(copy, name) && typeof field === 'string') {
          copy[name] = field
        }
      })
      return copy
    }
    // The fields typed into the form, set into the Message and decoded again.
    const decoded = decode(override(raw, Number(postedDepth)))
    if (Result.isFailure(decoded)) return yield* invalid(decoded.failure)
    const message = decoded.success
    const started = yield* startOf(config, { url: request.url, ...options })
    const allowed = allowedTags(plan, started.model)
    if (!allowed.has(tagOf(message))) {
      return yield* refuseFallback(
        'Unlisted',
        `the posted ${tagOf(message)} is not one an active Surface lists in its messages`,
      )
    }
    const boot = (plan.boot?.(started.model) as ReadonlyArray<unknown> | undefined) ?? []
    const model = yield* fold(
      config,
      started.model,
      [message],
      [...(started.commands ?? []), ...boot],
    )
    return yield* render(startingFrom(config, { model }) as ResumableConfig<Model>, plan, {
      buildId: options.buildId,
      url: request.url,
    })
  })

/**
 * The page's bindings, decoded through the plan's Message Schema, kept to the
 * Messages the Surfaces active for `model` may send, and checked against
 * every marker in `root`. Refused, with the reason, when the page carries
 * none, an entry is not one of the application's Messages or one no active
 * Surface lists, or a marker names a binding the page does not carry: a page
 * is answered whole or not at all.
 */
const bindings = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  page: ParentNode,
  root: Element,
  model: Model,
): Result.Result<ReadonlyArray<DecodedBinding>, ResumeRefused> => {
  const parsed = readEnvelope(page)
  if (Result.isFailure(parsed)) return Result.fail(parsed.failure)
  const read = Schema.decodeUnknownResult(EncodedBindings)(parsed.success.bindings ?? [])
  if (Result.isFailure(read)) {
    return refuse('Invalid', `the page's bindings are malformed: ${read.failure.message}`)
  }
  const encoded = read.success
  if (encoded.length > 0 && plan.surfaces.length === 0) {
    return refuse(
      'Invalid',
      'the page has bindings and the plan declares no surfaces to allow them',
    )
  }
  const decoded = decodeBindings(plan.Message, encoded, root, allowedTags(plan, model))
  return Result.isFailure(decoded)
    ? refuse('Invalid', decoded.failure)
    : Result.succeed(decoded.success)
}

/** The resumable track: bindings the server's markup names, so a page can answer before it boots. */
export const Resume = { builder, view, bindings, listen }

export const SSR = {
  plan,
  envelope,
  resume,
  render,
  page,
  hydrate,
  inspect,
  static: staticRegion,
  generate,
  entry,
  handle,
  serializeJsonScript,
}

export {
  BINDING_ATTRIBUTE,
  FALLBACK_FIELD,
  SLOT_ATTRIBUTE,
  type ResumableBuilder,
} from './resumable.js'
export type { DecodedBinding } from './listen.js'

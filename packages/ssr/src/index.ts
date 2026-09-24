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
import { Cause, Effect, Exit, Result, Schema } from 'effect'
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
import { builder, view } from './resumable.js'

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
}

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

type Reason = 'Missing' | 'Duplicate' | 'Unreadable' | 'Protocol' | 'Plan' | 'Invalid' | 'Route'

const refuse = (reason: Reason, message: string) =>
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
  const parts = (payload.parts ?? {}) as Readonly<Record<string, unknown>>
  const unknown = Object.keys(parts).find(id => !plan.parts.some(part => part.id === id))
  if (unknown !== undefined) {
    return Result.fail(`the envelope carries a part "${unknown}" the plan does not name`)
  }
  let model = plan.state.set(plan.baseline, decoded.success)
  for (const part of plan.parts) {
    if (!(part.id in parts)) return Result.fail(`the envelope carries no "${part.id}" part`)
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
  const scripts = page.querySelectorAll(`script[${RESUME_ATTRIBUTE}]`)
  if (scripts.length === 0) return refuse('Missing', 'the page holds no resume envelope')
  if (scripts.length > 1) {
    return refuse('Duplicate', `the page holds ${scripts.length} resume envelopes`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(scripts[0]!.textContent ?? '')
  } catch (error) {
    return refuse('Unreadable', `the resume envelope is not JSON: ${String(error)}`)
  }
  const { v, plan: id, state, parts, route, match } = (parsed ?? {}) as Record<string, unknown>
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
  ]),
  message: Schema.String,
}) {}

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
  const children = render(inertHtml)
  if (now?.mode === 'collect') {
    if (now.regions.has(id)) now.duplicates.add(id)
    else now.regions.set(id, children)
  }
  return boundary(id, undefined, children)
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
}

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

/**
 * A binding as the envelope carries it: Foldkit's attribute (`OnSubmit`,
 * `OnBlur`), whose tag says what its handler does beside dispatching; the
 * Message, encoded through the application's Message Schema (for a hole, with
 * the hole filled by a placeholder); the fields the event fills; and the
 * attribute's options. Its ordinal is its index.
 */
export interface EncodedBinding {
  readonly attribute: string
  readonly message: unknown
  readonly hole?: ReadonlyArray<string> | undefined
  readonly options?: unknown
}

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
 * Renders a page on the server against a resume plan.
 *
 * The application's `init` runs once. Its Model's slice is round-tripped
 * through the plan's Schema and set onto the baseline, which is the Model the
 * browser will start from, and the page is rendered from that Model. Three
 * refusals keep the handover honest:
 *
 * - `init` returned Commands and the plan names no `boot`. Foldkit drops
 *   `init`'s Commands on the server and the browser does not run `init`, so an
 *   undeclared one would never run anywhere.
 * - A Surface in the plan reads, or is activated by, a field in neither the
 *   slice nor `local`, reads data no part of the plan resumes, or activates
 *   differently from the browser's Model. `SSR.inspect` shows why.
 * - The view rendered from the browser's Model differs from the view rendered
 *   from the server's. The view reads a field the plan leaves out, and the
 *   browser would rebuild that part of the page. In production Foldkit does so
 *   silently, so this is the one place it shows.
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
    let served: ReturnType<ResumableConfig<Model>['init']> | undefined
    const regions = new Map<string, Region>()
    const duplicates = new Set<string>()
    const servedBindings: Array<Binding> = []
    const browserBindings: Array<Binding> = []
    const capturing = withContext(
      { ...config, init: (...args: ReadonlyArray<unknown>) => (served = config.init(...args)) },
      { mode: 'collect', regions, duplicates, bindings: servedBindings },
    )
    const full = yield* renderToString(capturing as never, options as never)
    if (duplicates.size > 0) {
      return yield* new ResumeUnsafe({
        reason: 'DuplicateStaticRegion',
        message: `two static regions share the id ${[...duplicates].map(id => `"${id}"`).join(', ')}: the browser could adopt only one`,
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

    const uncovered = shortfalls(coverage(plan, started.model, browser))
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
 * and, when the application has Flags, `flags(request)`. Any other method is
 * answered `405` (`handleRequest` passes every method through, `POST`
 * included). A render that fails, or a plan the render refuses, is answered
 * `500` with the reason logged, never with a page the browser cannot resume.
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
    if (method !== 'GET' && method !== 'HEAD') {
      return Responded(new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } }))
    }
    const flagsOf = options.flags
    // `Effect.result` would miss a defect, such as a view that throws, and a
    // `flags` that throws or rejects is not in the Effect at all: both would
    // reject `renderPage` instead of answering it.
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const flags =
          flagsOf === undefined ? undefined : yield* Effect.tryPromise(async () => flagsOf(request))
        return yield* render(config, plan, {
          buildId: options.buildId,
          url: request.url,
          ...(flagsOf === undefined ? {} : { flags }),
        })
      }),
    )
    if (Exit.isFailure(exit)) {
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
  adopt(
    makeApplication({
      ...withContext(startingFrom(config, { model, commands }), resuming),
      container: root,
    } as never),
    { buildId: options.buildId },
  )
}

/** The resumable track: bindings the server's markup names, so a page can answer before it boots. */
export const Resume = { builder, view }

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
  serializeJsonScript,
}

export { BINDING_ATTRIBUTE, type ResumableBuilder } from './resumable.js'

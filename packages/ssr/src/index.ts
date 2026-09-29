/**
 * `foldkit-ssr`: what crosses from the server to the browser when a page is
 * rendered on one and resumed on the other.
 *
 * Built from the plan in `docs/design/ssr-PLAN.md`. A resume plan names the
 * slice of the Model the browser owns. The server writes that slice onto the
 * stamped root as a JSON attribute, beside Foldkit's own stamps; the browser
 * reads it back and sets it onto a baseline
 * Model. Nothing outside the slice crosses, and a payload that cannot be read
 * back exactly is refused, never half-restored.
 *
 * Rendering and hydrating stay Foldkit's own: this package adds only the
 * handover. This module is the server's side and the browser's
 * (`foldkit-ssr/client`) together.
 */
import { Cause, Effect, Exit, Option, Result, Schema } from 'effect'
import {
  FOLDKIT_FLAGS_ATTRIBUTE,
  Rendered,
  Responded,
  injectIntoTemplate,
  renderToString,
  type EntryModule,
  type EntryResult,
  type RenderError,
  type RenderedApplication,
} from 'foldkit/experimental/server'
import { Metadata, type MetadataSummary } from 'foldkit-surface'
import { withContext, type Binding, type Region, type UnnamedHandler } from './context.js'
import { type EncodedBinding } from './listen.js'
import { FALLBACK_DEPTH_FIELD, FALLBACK_FIELD } from './resumable.js'
import { SSR as Client } from './client.js'
import {
  PROTOCOL,
  allowedTags,
  attributeOf,
  codecOf,
  modelFrom,
  metaMarkup,
  pathKey,
  plan,
  resume,
  routeOf,
  serializeJsonScript,
  serving,
  startingFrom,
  staticRegion,
  tagOf,
  type Loadable,
  type ResumableConfig,
  type ResumePlan,
  type RouteMatch,
} from './shared.js'

/** The projections of the plan's Surfaces that are active for `model`. */
const activeProjections = <Model, Fields extends Schema.Struct.Fields>(
  plan: ResumePlan<Model, Fields>,
  model: Model,
) => plan.surfaces.flatMap(surface => Option.toArray(surface.projectionOf(model)))

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

interface EnvelopeOptions {
  readonly route?: string | undefined
  readonly match?: RouteMatch | undefined
  readonly bindings?: ReadonlyArray<EncodedBinding> | undefined
  /** Every event the page's markers name, so the browser listens without scanning for them. */
  readonly events?: ReadonlyArray<string> | undefined
}

/**
 * The envelope for `model`: the plan's slice, each part's capture, and
 * the route it was rendered for, if it was rendered for one. `SSR.render`
 * carries it on the stamped root, beside Foldkit's own stamps, escaped for
 * the attribute; this is the same JSON unescaped, for tests and hosts that
 * place the page themselves.
 */
const envelope = <Model, Fields extends Schema.Struct.Fields>(
  resume: ResumePlan<Model, Fields>,
  model: Model,
  options: EnvelopeOptions = {},
): string => envelopeOf(resume, payloadOf(resume, model), options)

/**
 * The envelope for a payload already built: the JSON the stamped root carries.
 */
const envelopeOf = <Model, Fields extends Schema.Struct.Fields>(
  resume: ResumePlan<Model, Fields>,
  payload: Payload,
  options: EnvelopeOptions,
): string =>
  serializeJsonScript({
    v: PROTOCOL,
    plan: resume.id,
    ...payload,
    ...(options.route === undefined ? {} : { route: options.route }),
    ...(options.match === 'path' ? { match: 'path' } : {}),
    ...(options.bindings === undefined || options.bindings.length === 0
      ? {}
      : { bindings: options.bindings }),
    ...(options.events === undefined || options.events.length === 0
      ? {}
      : { events: options.events }),
  })

/**
 * The rendered application with the envelope on its stamped root, beside
 * Foldkit's own app and build stamps. `injectIntoTemplate` accepts the
 * envelope there, as part of the root, and refuses it beside the root, so a
 * page the host injects carries the handover without the entry owning the
 * template. Hydration adopts the server's nodes around it and drops the
 * attribute on its first patch, so the browser reads the envelope before it
 * boots.
 */
const withEnvelopeAttribute = (html: string, json: string): string => {
  const stamp = 'data-foldkit-app="'
  // The stamp names the root's open tag: it opens the markup, and no quoted
  // attribute value before it may hold a `>` of its own, which would end a
  // naive scan early, or the stamp string itself. A stamp past the tag's end,
  // or in text, is not the root.
  let from = 0
  for (;;) {
    const at = html.indexOf(stamp, from)
    if (at === -1) {
      throw new Error(
        'foldkit-ssr: the rendered application has no stamped root to carry the resume envelope',
      )
    }
    if (isInRootTag(html, at)) {
      const end = html.indexOf('"', at + stamp.length)
      if (end === -1) {
        throw new Error(
          'foldkit-ssr: the rendered application has no stamped root to carry the resume envelope',
        )
      }
      return `${html.slice(0, end + 1)}${attributeOf(json)}${html.slice(end + 1)}`
    }
    from = at + stamp.length
  }
}

/** Whether `at` sits inside the markup's first tag: quoted values skipped whole. */
const isInRootTag = (html: string, at: number): boolean => {
  if (!html.startsWith('<')) return false
  let index = 1
  while (index < at) {
    const char = html[index]
    if (char === '"' || char === "'") {
      const close = html.indexOf(char, index + 1)
      if (close === -1 || close >= at) return false
      index = close + 1
    } else if (char === '>') {
      return false
    } else {
      index++
    }
  }
  return true
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
      const served = Option.getOrUndefined(surface.projectionOf(model))
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
        sameInBrowser:
          readsKey(served) === readsKey(Option.getOrUndefined(surface.projectionOf(browser))),
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

/** Loads every lazy bundle's bodies, so the view renders whole. */
const loadLazy = (config: { readonly lazy?: ReadonlyArray<Loadable> | undefined }) =>
  Effect.promise(() => Promise.all((config.lazy ?? []).map(bundle => bundle.load())))

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

/** A page the server rendered against a plan, with its envelope. */
export interface RenderedPage {
  /**
   * The rendered application with the envelope on its stamped root, so
   * Foldkit's `injectIntoTemplate` places the page whole: the host owns the
   * template, and the entry never splices markup into it.
   */
  readonly rendered: RenderedApplication
  /** The envelope, as carried on the root, for tests and custom hosts. */
  readonly envelope: string
  /** The head markup of the plan's `meta`, empty without one. */
  readonly meta: string
  /**
   * Each element whose handler for an event is a function, marked `*`: the
   * page cannot answer that event before the live runtime boots.
   */
  readonly unnamed: ReadonlyArray<UnnamedHandler>
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
const render = <Model, Fields extends Schema.Struct.Fields, Message = any>(
  config: ResumableConfig<Model, Message>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly url?: string | undefined
    readonly flags?: unknown
  },
): Effect.Effect<RenderedPage, RenderError | ResumeUnsafe> =>
  renderMatching(config, plan, options, 'full')

const renderMatching = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly url?: string | undefined
    readonly flags?: unknown
  },
  match: RouteMatch,
): Effect.Effect<RenderedPage, RenderError | ResumeUnsafe> =>
  Effect.gen(function* () {
    yield* loadLazy(config)
    let served: ReturnType<ResumableConfig<Model>['init']> | undefined
    const regions = new Map<string, Region>()
    const duplicates = new Set<string>()
    const servedBindings: Array<Binding> = []
    const browserBindings: Array<Binding> = []
    const inStatic: Array<{ region: string; element: string; event: string }> = []
    const unnamed: Array<UnnamedHandler> = []
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
        unnamed,
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
    const meta = plan.meta === undefined ? '' : metaMarkup(plan.meta(started.model))
    const differing = [
      ...(full.html.replace(FLAGS_SCRIPT, '') === rendered.html ? [] : ['body']),
      ...HEAD_FIELDS.filter(field => full[field] !== rendered[field]),
      ...(plan.meta === undefined || metaMarkup(plan.meta(browser)) === meta ? [] : ['meta']),
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
    const envelope = envelopeOf(plan, payload, {
      ...(options.url === undefined
        ? {}
        : { route: match === 'path' ? pathKey(routeOf(options.url)) : routeOf(options.url) }),
      match,
      bindings: encoded.success,
      events: [
        ...new Set([
          ...servedBindings.map(binding => binding.event),
          ...unnamed.map(handler => handler.event),
        ]),
      ].sort(),
    })
    return {
      rendered: { ...rendered, html: withEnvelopeAttribute(rendered.html, envelope) },
      meta,
      envelope,
      unnamed,
    }
  })

/**
 * What a page adds to its head, given what it rendered: such as a stylesheet
 * of the classes the markup uses (`Style.usedIn` in `foldkit-mixins`).
 */
export type Head = (rendered: RenderedApplication) => string

/**
 * The template with `extra` before its last `</head>`, as a slice for the same
 * reason as the envelope. Nothing to add leaves it as it is; something to add
 * and no `</head>` is refused, rather than dropped.
 */
const withHead = (template: string, extra: string): string => {
  if (extra === '') return template
  const at = template.search(/<\/head>(?![\s\S]*<\/head>)/i)
  if (at === -1) throw new Error('foldkit-ssr: the template has no </head> to put the head in')
  return `${template.slice(0, at)}${extra}${template.slice(at)}`
}

/**
 * Foldkit fills `canonical` and `og:url` only into a tag the template already
 * has, and leaves the page without one otherwise. A render that sets either
 * and a template without its tag is refused, naming the tag.
 */
const FILLED_TAGS = [
  {
    field: 'canonical',
    tag: '<link rel="canonical" href="">',
    at: /<link\b[^>]*\brel\s*=\s*["']?canonical["'\s>]/i,
  },
  {
    field: 'ogUrl',
    tag: '<meta property="og:url" content="">',
    at: /<meta\b[^>]*\bproperty\s*=\s*["']?og:url["'\s>]/i,
  },
] as const

const withFilledTags = (template: string, rendered: RenderedApplication): string => {
  const missing = FILLED_TAGS.filter(
    ({ field, at }) => rendered[field] !== undefined && !at.test(template),
  )
  if (missing.length > 0) {
    throw new Error(
      `foldkit-ssr: the view sets ${missing.map(({ field }) => field).join(' and ')}, and the template has no ${missing.map(({ tag }) => tag).join(' or ')} for Foldkit to fill: add it to the template's head`,
    )
  }
  return template
}

/** The plan's `meta`, then what `head` adds, one line apart. */
const headOf = (
  result: { readonly rendered: RenderedApplication; readonly meta: string },
  head: Head | undefined,
): string => [result.meta, head?.(result.rendered) ?? ''].filter(markup => markup !== '').join('\n')

/**
 * The page to serve: the rendered application in the template, with the
 * plan's `meta` and `head`'s markup, if any, before `</head>`. The envelope
 * is already in the rendered root, so this is Foldkit's `injectIntoTemplate`
 * with a head, and nothing else.
 */
const page = (
  template: string,
  result: { readonly rendered: RenderedApplication; readonly meta: string },
  options: { readonly head?: Head | undefined } = {},
): string =>
  injectIntoTemplate(
    withHead(withFilledTags(template, result.rendered), headOf(result, options.head)),
    result.rendered,
  )

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

const xmlText = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

/**
 * A sitemap of the pages a build generated, each at its full address under
 * `origin`, in the order given. `modified`, when a page has it, is any date
 * `Date` reads, written as the UTC day. A path that does not start with `/`,
 * a path given twice, and a date `Date` cannot read are refused: each would
 * make a sitemap a search engine rejects or misreads.
 */
const sitemap = (
  pages: ReadonlyArray<{ readonly path: string; readonly modified?: string | undefined }>,
  options: { readonly origin: string },
): string => {
  const seen = new Set<string>()
  const urls = pages.map(({ path, modified }) => {
    if (!path.startsWith('/')) throw new Error(`SSR.sitemap: "${path}" does not start with /`)
    if (seen.has(path)) throw new Error(`SSR.sitemap: "${path}" is listed twice`)
    seen.add(path)
    const loc = `<loc>${xmlText(new URL(path, options.origin).href)}</loc>`
    if (modified === undefined) return `  <url>${loc}</url>`
    const at = new Date(modified)
    if (Number.isNaN(at.getTime())) {
      throw new Error(`SSR.sitemap: "${modified}", the date of "${path}", is not a date`)
    }
    return `  <url>${loc}<lastmod>${at.toISOString().slice(0, 10)}</lastmod></url>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * A `robots.txt` that lets every crawler in, except under `disallow`, and
 * names the sitemap at `sitemap` (default `/sitemap.xml`) under `origin`.
 */
const robots = (options: {
  readonly origin: string
  readonly sitemap?: string | undefined
  readonly disallow?: ReadonlyArray<string> | undefined
}): string =>
  [
    'User-agent: *',
    'Allow: /',
    ...(options.disallow ?? []).map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${new URL(options.sitemap ?? '/sitemap.xml', options.origin).href}`,
    '',
  ].join('\n')

// Keyed by plan, element and event: a server renders the same page for every
// request, so one warning each is enough to learn which handler to name.
const warnedUnnamed = new Set<string>()

/**
 * Warns, once per process, about each handler that keeps a page from
 * answering before boot. Only a page that waits to boot is held up: one
 * started `'now'`, with no lazy bundle to load, boots before any event.
 */
const warnUnnamed = <Model, Fields extends Schema.Struct.Fields>(
  config: ResumableConfig<Model>,
  plan: ResumePlan<Model, Fields>,
  unnamed: ReadonlyArray<UnnamedHandler>,
): void => {
  if (plan.start === 'now' && (config.lazy ?? []).length === 0) return
  for (const { element, event } of unnamed) {
    const key = JSON.stringify([plan.id, element, event])
    if (warnedUnnamed.has(key)) continue
    warnedUnnamed.add(key)
    console.warn(
      `[foldkit-ssr] plan "${plan.id}": ${element} handles ${event} with a function, which the page cannot name, so that event waits for the live runtime. Give the handler a Message, or, for OnInput, OnChange, OnKeyDown or OnKeyUp, the Message's constructor with the field the event fills left out.`,
    )
  }
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
  Message = any,
>(
  config: ResumableConfig<Model, Message>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly template: string
    readonly origin: string
    readonly paths: Paths
    readonly flags?: ((path: string) => unknown) | undefined
    readonly head?: Head | undefined
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
        result => {
          warnUnnamed(config, plan, result.unnamed)
          return {
            path,
            file: fileOf(path),
            html: page(options.template, result, { head: options.head }),
          }
        },
      ),
    )
    // One page per path, in order, so the array is the tuple the paths describe.
    return pages as unknown as GeneratedPages<Paths>
  })

/**
 * The server entry for Foldkit's pipeline: the `renderPage` a dev server,
 * a fetch handler, or `handleRequest` calls, and that the `fetch.js` a Foldkit
 * build emits imports from the server entry module, so a resumed page is
 * served by Node and Workers alike.
 *
 * `GET` and `HEAD` render the page against the plan, with the request's URL
 * and, when the application has Flags, `flags(request)`. `POST` goes to
 * `SSR.handle` when the plan has a server fallback, and is answered `400` when
 * the post is unusable. `OPTIONS` is answered `204`, and any other method
 * `405`, each with the methods the entry answers in `allow` (`handleRequest`
 * passes every method through). A render that fails, or a plan the render
 * refuses, is answered `500` with the reason logged, never with a page the
 * browser cannot resume. `headers(request)` rides on the `Rendered` result, so
 * Foldkit's `toResponse` sets it over its own on the page: a cache policy, or
 * a CORS answer to a preflight.
 *
 * The page is answered as `Rendered`: the rendered application carries the
 * envelope in its root, so the host injects it into its own template with
 * Foldkit's `injectIntoTemplate`, and a build can generate it with Foldkit's
 * `prerender`. The template, and the container it fills, are the host's:
 * `handleRequest` still classifies static misses and answers `HEAD` without
 * a body.
 *
 * What the page says of itself (`meta`) and per-page `head` markup are
 * written into a template's head, which the host owns here: a plan with
 * `meta` is refused when the entry is made, and served with `SSR.generate`.
 */
const entry = <Model, Fields extends Schema.Struct.Fields, Message = any>(
  config: ResumableConfig<Model, Message>,
  plan: ResumePlan<Model, Fields>,
  options: {
    readonly buildId: string
    readonly flags?: ((request: Request) => unknown | PromiseLike<unknown>) | undefined
    readonly headers?: ((request: Request) => HeadersInit) | undefined
  },
): EntryModule => {
  if (plan.meta !== undefined) {
    throw new Error(
      `foldkit-ssr: plan "${plan.id}" says what the page says of itself (meta), which is written into the template's head, and the template is the host's: serve it with SSR.generate, not SSR.entry`,
    )
  }
  const allow = plan.fallback === 'server' ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, OPTIONS'
  // Deleted and appended rather than set, which would keep one `set-cookie` of several.
  const merge = (response: Response, extra: Headers): Response => {
    for (const name of new Set(extra.keys())) response.headers.delete(name)
    extra.forEach((value, name) => response.headers.append(name, value))
    return response
  }
  const answer = async (request: Request): Promise<EntryResult> => {
    const method = request.method.toUpperCase()
    const posting = method === 'POST' && plan.fallback === 'server'
    const headersOf = options.headers
    let extra: Headers | undefined
    if (headersOf !== undefined) {
      try {
        extra = new Headers(headersOf(request))
      } catch (error) {
        console.error(
          `[foldkit-ssr] ${request.url} was not answered: headers threw ${String(error)}`,
        )
        return Responded(plainText(500, 'The page could not be rendered.'))
      }
    }
    const responded = (response: Response): EntryResult =>
      Responded(extra === undefined ? response : merge(response, extra))
    if (method === 'OPTIONS')
      return responded(new Response(null, { status: 204, headers: { allow } }))
    if (method !== 'GET' && method !== 'HEAD' && !posting) {
      return responded(new Response(null, { status: 405, headers: { allow } }))
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
        if (posting) {
          return yield* handle(request, config, plan, { buildId: options.buildId, ...flagged })
        }
        return yield* render(config, plan, {
          buildId: options.buildId,
          url: request.url,
          ...flagged,
        })
      }),
    )
    if (Exit.isFailure(exit)) {
      const refused = Cause.findErrorOption(exit.cause).pipe(
        Option.filter(error => error instanceof FallbackRefused),
      )
      if (Option.isSome(refused)) {
        return responded(plainText(400, `The form could not be handled: ${refused.value.message}`))
      }
      console.error(`[foldkit-ssr] ${request.url} was not rendered: ${Cause.pretty(exit.cause)}`)
      return responded(plainText(500, 'The page could not be rendered.'))
    }
    warnUnnamed(config, plan, exit.value.unnamed)
    // No `headers` key without custom headers: a `Rendered` that carries none
    // stays generatable as a static file.
    return extra === undefined
      ? Rendered(exit.value.rendered)
      : Rendered(exit.value.rendered, { headers: extra })
  }
  return { renderPage: answer }
}

const plainText = (status: number, body: string): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

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
 * the Model the browser had, `init` and then the plan's `boot` with every
 * Command it leads to, runs `update` with the Message and every Command that
 * follows, and renders the result as a fresh page.
 */
const handle = <Model, Fields extends Schema.Struct.Fields, Message = any>(
  request: Request,
  config: ResumableConfig<Model, Message>,
  plan: ResumePlan<Model, Fields>,
  options: { readonly buildId: string; readonly flags?: unknown },
): Effect.Effect<RenderedPage, RenderError | ResumeUnsafe | FallbackRefused> =>
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
    // As the browser got here: `init` on the server, then the plan's `boot`
    // at hydration, and only then the user's Message. `init`'s own Commands
    // never run in the browser, so they do not run here.
    const boot = (plan.boot?.(started.model) as ReadonlyArray<unknown> | undefined) ?? []
    const booted = yield* fold(config, started.model, [], boot)
    const model = yield* fold(config, booted, [message], [])
    return yield* render(startingFrom(config, { model }) as ResumableConfig<Model>, plan, {
      buildId: options.buildId,
      url: request.url,
    })
  })

export const SSR = {
  plan,
  envelope,
  resume,
  render,
  page,
  hydrate: Client.hydrate,
  inspect,
  static: staticRegion,
  serving,
  generate,
  entry,
  handle,
  serializeJsonScript,
  sitemap,
  robots,
}

export {
  FOLDKIT_APP_ATTRIBUTE,
  META_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  STATIC_ATTRIBUTE,
  Resume,
  ResumeRefused,
  BINDING_ATTRIBUTE,
  FALLBACK_FIELD,
  SLOT_ATTRIBUTE,
  metaMarkup,
  type DecodedBinding,
  type Loadable,
  type Meta,
  type ResumableBuilder,
  type ResumableConfig,
  type ResumePart,
  type ResumePlan,
  type Start,
  type UnnamedHandler,
} from './client.js'

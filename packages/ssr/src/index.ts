/**
 * `foldkit-ssr`: what crosses from the server to the browser when a page is
 * rendered on one and resumed on the other.
 *
 * Phase 1 of the plan (`docs/design/ssr-PLAN.md`). A resume plan names the
 * slice of the Model the browser owns. The server writes that slice into the
 * page as a JSON script; the browser reads it back and sets it onto a baseline
 * Model. Nothing outside the slice crosses, and a payload that cannot be read
 * back exactly is refused, never half-restored.
 *
 * Rendering and hydrating stay Foldkit's own: this package adds only the
 * handover.
 */
import { Effect, Result, Schema } from 'effect'
import {
  injectIntoTemplate,
  renderToString,
  type RenderError,
  type RenderedApplication,
} from 'foldkit/experimental/server'
import { hydrate as adopt, makeApplication, run } from 'foldkit/runtime'
import type { WritableProjection } from 'foldkit-surface'

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
 */
const plan = <Model, Fields extends Schema.Struct.Fields, Commands = unknown>(
  application: { readonly initial: Model },
  config: {
    readonly id: string
    readonly state: WritableProjection<Model, Fields>
    readonly baseline?: Model | undefined
    readonly boot?: ((model: Model) => Commands) | undefined
  },
): ResumePlan<Model, Fields, Commands> => ({
  id: config.id,
  state: config.state,
  baseline: config.baseline ?? application.initial,
  ...(config.boot === undefined ? {} : { boot: config.boot }),
})

/**
 * The script a server writes into its page's template: the plan's slice of
 * `model`, encoded through the slice's own Schema, and the route it was
 * rendered for, if it was rendered for one.
 */
const envelope = <Model, Fields extends Schema.Struct.Fields>(
  resume: ResumePlan<Model, Fields>,
  model: Model,
  options: { readonly route?: string | undefined } = {},
): string => {
  const state = Schema.encodeSync(codecOf(resume.state.schema))(resume.state.get(model))
  const body = serializeJsonScript({
    v: PROTOCOL,
    plan: resume.id,
    state,
    ...(options.route === undefined ? {} : { route: options.route }),
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
  const { v, plan: id, state, route } = (parsed ?? {}) as Record<string, unknown>
  if (v !== PROTOCOL) {
    return refuse('Protocol', `the envelope is protocol ${String(v)}, not ${PROTOCOL}`)
  }
  if (id !== plan.id) {
    return refuse('Plan', `the envelope is for plan "${String(id)}", not "${plan.id}"`)
  }
  // The route the Model was made for. The runtime never reports the URL at
  // boot, so a page resumed on another route would show one and be on the
  // other.
  if (route !== undefined && options.route !== undefined && route !== options.route) {
    return refuse('Route', `the page was rendered for ${String(route)}, not ${options.route}`)
  }
  const decoded = Schema.decodeUnknownResult(codecOf(plan.state.schema))(state)
  if (Result.isFailure(decoded)) {
    return refuse('Invalid', `the envelope's state does not decode: ${decoded.failure.message}`)
  }
  return Result.succeed(plan.state.set(plan.baseline, decoded.success))
}

/** Why a server refused to render a page against its plan. */
export class ResumeUnsafe extends Schema.TaggedError<ResumeUnsafe>()('ResumeUnsafe', {
  reason: Schema.Literals(['UndeclaredStartup', 'ViewDependsOnUnsentState']),
  message: Schema.String,
}) {}

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
 * Foldkit's hydration root attributes. The build one is not exported by
 * Foldkit; a test pins it to what Foldkit's server stamps.
 */
const BUILD_ATTRIBUTE = 'data-foldkit-build'
const APP_ATTRIBUTE = 'data-foldkit-app'

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
const FLAGS_SCRIPT = /<script[^>]*data-foldkit-flags[^>]*>[\s\S]*?<\/script>/g

/**
 * Renders a page on the server against a resume plan.
 *
 * The application's `init` runs once. Its Model's slice is round-tripped
 * through the plan's Schema and set onto the baseline, which is the Model the
 * browser will start from, and the page is rendered from that Model. Two
 * refusals keep the handover honest:
 *
 * - `init` returned Commands and the plan names no `boot`. Foldkit drops
 *   `init`'s Commands on the server and the browser does not run `init`, so an
 *   undeclared one would never run anywhere.
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
> =>
  Effect.gen(function* () {
    let served: ReturnType<ResumableConfig<Model>['init']> | undefined
    const capturing = {
      ...config,
      init: (...args: ReadonlyArray<unknown>) => (served = config.init(...args)),
    }
    const full = yield* renderToString(capturing as never, options as never)
    const started = served!
    const commands = started.commands ?? []
    if (commands.length > 0 && plan.boot === undefined) {
      return yield* new ResumeUnsafe({
        reason: 'UndeclaredStartup',
        message: `init returned ${commands.map(command => command.name).join(', ')}, which no browser would run: name them in the plan's boot`,
      })
    }

    const codec = codecOf(plan.state.schema)
    const slice = Schema.decodeUnknownSync(codec)(
      Schema.encodeSync(codec)(plan.state.get(started.model)),
    )
    const browser = plan.state.set(plan.baseline, slice)
    // With no `Flags` key in the config, Foldkit writes no Flags script.
    const rendered = yield* renderToString(
      startingFrom(config, { model: browser }) as never,
      options as never,
    )
    if (full.html.replace(FLAGS_SCRIPT, '') !== rendered.html) {
      return yield* new ResumeUnsafe({
        reason: 'ViewDependsOnUnsentState',
        message:
          'the view differs when rendered from the Model the browser will start from: it reads a field the plan leaves out',
      })
    }
    return {
      rendered,
      envelope: envelope(plan, started.model, {
        ...(options.url === undefined ? {} : { route: routeOf(options.url) }),
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
  const root = document.querySelector<HTMLElement>(`[${APP_ATTRIBUTE}]`)
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
  adopt(program({ model, commands }), { buildId: options.buildId })
}

export const SSR = { plan, envelope, resume, render, page, hydrate, serializeJsonScript }

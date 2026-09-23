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
import { Result, Schema } from 'effect'
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
  reason: Schema.Literals(['Missing', 'Duplicate', 'Unreadable', 'Protocol', 'Plan', 'Invalid']),
  message: Schema.String,
}) {}

type Reason = 'Missing' | 'Duplicate' | 'Unreadable' | 'Protocol' | 'Plan' | 'Invalid'

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
 * `model`, encoded through the slice's own Schema.
 */
const envelope = <Model, Fields extends Schema.Struct.Fields>(
  resume: ResumePlan<Model, Fields>,
  model: Model,
): string => {
  const state = Schema.encodeSync(codecOf(resume.state.schema))(resume.state.get(model))
  const body = serializeJsonScript({ v: PROTOCOL, plan: resume.id, state })
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
  const { v, plan: id, state } = (parsed ?? {}) as Record<string, unknown>
  if (v !== PROTOCOL) {
    return refuse('Protocol', `the envelope is protocol ${String(v)}, not ${PROTOCOL}`)
  }
  if (id !== plan.id) {
    return refuse('Plan', `the envelope is for plan "${String(id)}", not "${plan.id}"`)
  }
  const decoded = Schema.decodeUnknownResult(codecOf(plan.state.schema))(state)
  if (Result.isFailure(decoded)) {
    return refuse('Invalid', `the envelope's state does not decode: ${decoded.failure.message}`)
  }
  return Result.succeed(plan.state.set(plan.baseline, decoded.success))
}

export const SSR = { plan, envelope, resume, serializeJsonScript }

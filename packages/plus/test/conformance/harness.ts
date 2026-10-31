/**
 * A conformance suite for the ways a Foldkit view is drawn
 * (docs/design/foldkit-renderer-independence-PLAN.md, R0).
 *
 * A case is a program and a script of interactions. Each drawer plays the
 * script and reports, before any step and after each one, what it drew, the
 * Messages that reached `update`, and the Mounts that started and ended. The
 * reference drawer is Foldkit's own runtime; every other drawer must report
 * the same. A drawer that cannot interact (a server) draws the Models the
 * reference reached instead, and is compared on its markup alone.
 *
 * A new renderer conforms by implementing `LiveDrawer` (or `StaticDrawer`)
 * and running `conform` over `cases.ts`.
 */
import { Data, Effect, Option, Result, type Schema, type Scope } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

/** What every Message is: Foldkit's runtime routes by tag. */
export interface Tagged {
  readonly _tag: string
}

/** What a drawer draws: Foldkit's element program, with an `update` that issues no Commands. */
export interface Program<Model, Message extends Tagged> {
  readonly Model: Schema.Codec<Model, any, unknown, unknown>
  readonly init: Model
  readonly update: (model: Model, message: Message) => Model
  readonly view: (model: Model, h: HtmlBuilder<Message>) => Html
}

/** A Mount starting or ending, with the args it was drawn with. */
export interface MountEvent {
  readonly event: 'started' | 'ended'
  readonly name: string
  readonly args: Readonly<Record<string, unknown>>
}

/**
 * How a case's Mount tells the drawer it is held: `hold` records its start,
 * records its end when its scope closes, and answers `message`. A drawer
 * that runs Mounts passes one that records; one that resolves them by
 * description (Scene) never runs it.
 */
export interface Probe {
  readonly hold: <Message>(
    name: string,
    args: Readonly<Record<string, unknown>>,
    message: Message,
  ) => Effect.Effect<Message, never, Scope.Scope>
}

/** One interaction. Targets are CSS selectors in the subset Scene reads (tags, ids, classes, attributes, descendants). */
export type Step<Message> = Data.TaggedEnum<{
  /** A click on the first element the selector finds. */
  Click: { readonly target: string }
  /** Typing `value` into a field: an `input` event with the field holding it. */
  Type: { readonly target: string; readonly value: string }
  /** A `keydown` of `key` on the first element the selector finds. */
  Key: { readonly target: string; readonly key: string }
  /** A Message from outside the view, as a Subscription delivers one. */
  Send: { readonly message: Message }
}>
interface StepDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Step<this['A']>
}
export const Step = Data.taggedEnum<StepDefinition>()

export interface Case<Model, Message extends Tagged> {
  readonly name: string
  readonly program: (probe: Probe) => Program<Model, Message>
  readonly script: ReadonlyArray<Step<Message>>
  /**
   * The Message a Mount answers when it starts, for a drawer that resolves
   * Mounts by description: the Mount's own, before any `Mount.mapMessage`,
   * or none for a Mount that answers nothing until something happens.
   */
  readonly mounted?: (mount: Omit<MountEvent, 'event'>) => Option.Option<unknown>
  /** The Mounts built on the `Probe`, whose lifecycle every drawer reports. */
  readonly probed?: ReadonlyArray<string>
}

/** What a drawer showed at one point of a script. */
export interface Observation<Model> {
  /** The Model the drawing is of. */
  readonly model: Model
  /** The canonical markup (`markup.ts`), or why the drawer refused to draw. */
  readonly markup: Result.Result<string, string>
  /** The Messages that reached `update` since the last observation, in order. */
  readonly messages: ReadonlyArray<unknown>
  /** The Mounts that started or ended since the last observation, in any order. */
  readonly mounts: ReadonlyArray<MountEvent>
}

/** A drawer that plays a script: one observation before any step, then one after each. */
export interface LiveDrawer {
  readonly name: string
  readonly play: <Model, Message extends Tagged>(
    subject: Case<Model, Message>,
  ) => Promise<ReadonlyArray<Observation<Model>>>
}

/** A drawer that draws a Model and nothing else, such as a server. */
export interface StaticDrawer {
  readonly name: string
  readonly draw: <Model, Message extends Tagged>(
    program: Program<Model, Message>,
    model: Model,
  ) => Promise<Result.Result<string, string>>
}

/** Where a drawer departed from the reference. */
export interface Disagreement {
  readonly drawer: string
  /** 0 is before any step; n is after the script's nth step. */
  readonly step: number
  /** `play` is a drawer that could not play the script at all. */
  readonly aspect: 'play' | 'markup' | 'messages' | 'mounts'
  readonly reference: string
  readonly drawn: string
}

/** A stable text of a Message or Mount args: keys sorted, an `Option` by its JSON. */
const show = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner) && !('toJSON' in inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  )

const showMarkup = (markup: Result.Result<string, string>): string =>
  Result.match(markup, { onSuccess: text => text, onFailure: reason => `refused: ${reason}` })

const showMounts = (mounts: ReadonlyArray<MountEvent>): string =>
  mounts
    .map(mount => show(mount))
    .sort()
    .join('\n')

const showMessages = (messages: ReadonlyArray<unknown>): string => messages.map(show).join('\n')

const compare = (
  drawer: string,
  step: number,
  aspect: Disagreement['aspect'],
  reference: string,
  drawn: string,
): ReadonlyArray<Disagreement> =>
  reference === drawn ? [] : [{ drawer, step, aspect, reference, drawn }]

/** A Probe that records into `events`. */
export const recordingProbe = (events: Array<MountEvent>): Probe => ({
  hold: (name, args, message) =>
    Effect.acquireRelease(
      Effect.sync(() => void events.push({ event: 'started', name, args })),
      () => Effect.sync(() => void events.push({ event: 'ended', name, args })),
    ).pipe(Effect.as(message)),
})

/**
 * Plays `subject` on every drawer and returns where each departed from the
 * reference. An empty result is conformance.
 */
export const conform = async <Model, Message extends Tagged>(
  subject: Case<Model, Message>,
  drawers: {
    readonly reference: LiveDrawer
    readonly live: ReadonlyArray<LiveDrawer>
    readonly static: ReadonlyArray<StaticDrawer>
  },
): Promise<ReadonlyArray<Disagreement>> => {
  const reference = await drawers.reference.play(subject)
  const found: Array<Disagreement> = []
  for (const drawer of drawers.live) {
    const played = await drawer.play(subject).then(
      observations => Result.succeed(observations),
      (error: unknown) => Result.fail(error instanceof Error ? error.message : String(error)),
    )
    if (Result.isFailure(played)) {
      found.push(...compare(drawer.name, 0, 'play', 'played', played.failure))
      continue
    }
    const observations = played.success
    reference.forEach((expected, step) => {
      const seen = Option.fromNullishOr(observations[step])
      if (Option.isNone(seen)) {
        found.push(...compare(drawer.name, step, 'markup', showMarkup(expected.markup), 'nothing'))
        return
      }
      found.push(
        ...compare(
          drawer.name,
          step,
          'markup',
          showMarkup(expected.markup),
          showMarkup(seen.value.markup),
        ),
        ...compare(
          drawer.name,
          step,
          'messages',
          showMessages(expected.messages),
          showMessages(seen.value.messages),
        ),
        ...compare(
          drawer.name,
          step,
          'mounts',
          showMounts(expected.mounts),
          showMounts(seen.value.mounts),
        ),
      )
    })
  }
  const program = subject.program(recordingProbe([]))
  for (const drawer of drawers.static) {
    for (const [step, expected] of reference.entries()) {
      const drawn = await drawer.draw(program, expected.model)
      found.push(
        ...compare(drawer.name, step, 'markup', showMarkup(expected.markup), showMarkup(drawn)),
      )
    }
  }
  return found
}

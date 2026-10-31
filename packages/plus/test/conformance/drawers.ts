/**
 * Today's three ways to draw a Foldkit view, as drawers (`harness.ts`):
 * the runtime (`Runtime.makeElement` and `embed` into the page's DOM, jsdom
 * or a browser), Scene (Foldkit's test renderer, which walks the VNode), and
 * the server (`renderToString`, parsed back as a browser would).
 */
import { Effect, Option, Queue, Result, Schema, Stream } from 'effect'
import { renderToString } from 'foldkit/experimental/server'
import type { Html } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { Scene } from 'foldkit/test'
import { Frames } from 'foldkit-mixins/testing'
import {
  Step,
  recordingProbe,
  type Case,
  type LiveDrawer,
  type MountEvent,
  type Observation,
  type Program,
  type StaticDrawer,
  type Tagged,
} from './harness.js'
import { ofElement, ofServedMarkup, ofVNode } from './markup.js'

const turn = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** Messages and Mount events since the last observation. */
const recorder = () => {
  const messages: Array<unknown> = []
  const mounts: Array<MountEvent> = []
  return {
    messages,
    mounts,
    /** How much has happened, to tell when a drawer has gone quiet. */
    count: () => messages.length + mounts.length,
    take: <Model>(markup: Result.Result<string, string>, model: Model): Observation<Model> => ({
      model,
      markup,
      messages: messages.splice(0),
      mounts: mounts.splice(0),
    }),
  }
}

let containers = 0

/** Foldkit's runtime, embedded in the current document. */
export const runtime: LiveDrawer = {
  name: 'runtime',
  play: async <Model, Message extends Tagged>(subject: Case<Model, Message>) => {
    const record = recorder()
    const program = subject.program(recordingProbe(record.mounts))
    const sent = Effect.runSync(Queue.unbounded<Message>())
    let model = program.init
    // `embed` replaces its container with what it draws, so the drawing is read from a host around it.
    const host = document.createElement('div')
    const container = document.createElement('div')
    container.id = `conformance-${++containers}`
    host.append(container)
    document.body.append(host)
    const frames = Frames.track()
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model: program.Model,
        init: () => ({ model: program.init }),
        update: (current: Model, message: Message) => {
          record.messages.push(message)
          model = program.update(current, message)
          return { model }
        },
        view: program.view,
        container,
        subscriptions: Subscription.make<Model, Message>()(entry => ({
          sent: entry(
            {},
            { modelToDependencies: () => ({}), dependenciesToStream: () => Stream.fromQueue(sent) },
          ),
        })),
      }),
    )
    const drawn = (): Element => {
      const root = host.firstElementChild
      if (root === null || root === container) throw new Error('the runtime has drawn nothing yet')
      return root
    }
    // A Mount's Message arrives on a fiber after the frame that inserted it,
    // and may ask for another frame: settled is a round with nothing new.
    const settle = async () => {
      for (let round = 0, quiet = 0; round < 50; round++) {
        const before = record.count()
        await frames.settle()
        await turn()
        quiet = record.count() === before ? quiet + 1 : 0
        if (quiet === 2) return
      }
      throw new Error('the runtime did not settle')
    }
    const observe = () => record.take(Result.succeed(ofElement(drawn())), model)
    const observations: Array<Observation<Model>> = []
    try {
      for (let wait = 0; host.firstElementChild === container; wait++) {
        if (wait > 200) throw new Error('the runtime never drew')
        await turn()
      }
      await settle()
      observations.push(observe())
      for (const step of subject.script) {
        Step.$match(step, {
          Click: ({ target }) => {
            const element =
              drawn().querySelector(target) ?? (drawn().matches(target) ? drawn() : null)
            if (!(element instanceof HTMLElement))
              throw new Error(`nothing drawn matches ${target}`)
            element.click()
          },
          Type: ({ target, value }) => {
            const element = drawn().querySelector(target)
            if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
              throw new Error(`no field drawn matches ${target}`)
            element.value = value
            element.dispatchEvent(new Event('input', { bubbles: true }))
          },
          Send: ({ message }) => {
            Queue.offerUnsafe(sent, message)
          },
        })
        await settle()
        observations.push(observe())
      }
    } finally {
      handle.dispose()
      frames.dispose()
      host.remove()
    }
    return observations
  },
}

/** Scene's record of its Mounts, which it keeps out of the simulation's public fields. */
const SceneSlots = Schema.Struct({
  mountSlots: Schema.Array(
    Schema.Struct({
      slot: Schema.Struct({
        name: Schema.String,
        args: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
      }),
      status: Schema.Struct({ _tag: Schema.String, acknowledged: Schema.optional(Schema.Boolean) }),
    }),
  ),
})
const sceneSlots = Schema.decodeUnknownSync(SceneSlots)

// Where `OnMount` marks a VNode: Foldkit's `FOLDKIT_MOUNT_KEY`, which `foldkit/html` does not export.
const mountKey = 'foldkitMount'
const markerOf = Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String }))

/**
 * The names of the Mounts a VNode draws, in the order the runtime starts
 * them: snabbdom calls an element's `insert` hook after its children's, where
 * Scene lists its pending Mounts parent first.
 */
const startOrder = (node: Exclude<Html, null> | string): ReadonlyArray<string> => {
  if (typeof node === 'string') return []
  const children = (node.children ?? []).flatMap(startOrder)
  return Option.match(markerOf(Reflect.get(node.data ?? {}, mountKey)), {
    onNone: () => children,
    onSome: ({ name }) => [...children, name],
  })
}

/** Scene: the view's VNode, walked; Mounts resolved by their description, never run. */
export const scene: LiveDrawer = {
  name: 'scene',
  play: async <Model, Message extends Tagged>(subject: Case<Model, Message>) => {
    const record = recorder()
    // Scene never runs a Mount, so its probe is never asked.
    const program = subject.program(recordingProbe([]))
    let model = program.init
    const observations: Array<Observation<Model>> = []
    type Simulation = Scene.SceneSimulation<Model, Message>
    const probed = new Set(subject.probed ?? [])
    const mountedBy = (name: string, args: Readonly<Record<string, unknown>>): unknown => {
      if (subject.mounted === undefined)
        throw new Error(
          `${subject.name} draws the Mount ${name} but says nothing of the Message it answers`,
        )
      return Option.getOrThrowWith(
        subject.mounted({ name, args }),
        () =>
          new Error(
            `Scene resolves every Mount with a Message, and ${name} answers none when it starts`,
          ),
      )
    }
    // Every Mount Scene has drawn is resolved and every one it saw end is
    // acknowledged, one at a time, since each re-renders.
    const settle = (simulation: Simulation): Simulation => {
      let current = simulation
      for (let round = 0; round < 100; round++) {
        const ended = sceneSlots(current).mountSlots.find(
          ({ status }) => status._tag === 'Ended' && status.acknowledged === false,
        )
        if (ended !== undefined) {
          const { name, args } = ended.slot
          if (probed.has(name)) record.mounts.push({ event: 'ended', name, args: args ?? {} })
          current = Scene.Mount.expectEnded(args === undefined ? { name } : { name, args })(current)
          continue
        }
        // Resolved in the runtime's order, since each start's Message is compared in order.
        const pending = startOrder(current.html)
          .map(name => current.mounts.find(mount => mount.name === name))
          .find(mount => mount !== undefined)
        if (pending === undefined) return current
        const { name, args } = pending
        if (probed.has(name)) record.mounts.push({ event: 'started', name, args: args ?? {} })
        current = Scene.Mount.resolve(
          args === undefined ? { name } : { name, args },
          mountedBy(name, args ?? {}),
        )(current)
      }
      throw new Error('Scene kept drawing new Mounts')
    }
    const capture = (simulation: Simulation): Simulation => {
      observations.push(record.take(Result.succeed(ofVNode(simulation.html)), model))
      return simulation
    }
    // An interaction that dispatches nothing is acknowledged, as Scene asks.
    const acting =
      (act: (simulation: Simulation) => Simulation) =>
      (simulation: Simulation): Simulation => {
        const before = record.messages.length
        const next = act(simulation)
        return record.messages.length === before ? Scene.expectIgnored()(next) : next
      }
    const steps = subject.script.flatMap(step => [
      Step.$match(step, {
        Click: ({ target }) => acting(Scene.click(target)),
        Type: ({ target, value }) => acting(Scene.type(target, value)),
        Send: ({ message }) => Scene.Subscription.emit(message),
      }),
      settle,
      capture,
    ])
    Scene.scene(
      {
        update: (current: Model, message: Message) => {
          record.messages.push(message)
          model = program.update(current, message)
          return { model }
        },
        view: program.view,
      },
      Scene.given(program.init),
      settle,
      capture,
      ...steps,
    )
    return observations
  },
}

/** `renderToString`, as static markup, parsed back the way a browser parses a page. */
export const server: StaticDrawer = {
  name: 'server',
  draw: async <Model, Message extends Tagged>(program: Program<Model, Message>, model: Model) => {
    try {
      const rendered = await Effect.runPromise(
        Effect.result(
          renderToString<Model, Message>(
            {
              init: () => ({ model }),
              view: (current, h) => ({ title: 'conformance', body: program.view(current, h) }),
            },
            { isHydratable: false },
          ),
        ),
      )
      return Result.map(
        Result.mapError(rendered, error => error._tag),
        ({ html }) => ofServedMarkup(html),
      )
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message.split('\n')[0]! : String(error))
    }
  },
}

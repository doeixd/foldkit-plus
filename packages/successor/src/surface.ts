import { Context, Effect, Option } from 'effect'
import { Expr } from '@doeixd/metakit'
import {
  build,
  knownEdge,
  modelPath,
  unknownEdge,
  type DependencyGraph,
} from '@doeixd/metakit/graph'
import { covers } from '@doeixd/metakit/graph/match'
import type { Observed } from './block.js'

type Patch<Value> = { readonly set: (anchor: string, value: Value) => void }

export class Text extends Context.Service<Text, Patch<string | number>>()(
  'foldkit/successor/Text',
) {}
export class Checkbox extends Context.Service<Checkbox, Patch<boolean>>()(
  'foldkit/successor/Checkbox',
) {}
export class Action extends Context.Service<Action, Patch<boolean>>()('foldkit/successor/Action') {}
export class TextInput extends Context.Service<TextInput, Patch<string>>()(
  'foldkit/successor/TextInput',
) {}
export class KeyedList extends Context.Service<KeyedList, Patch<ReadonlyArray<string>>>()(
  'foldkit/successor/KeyedList',
) {}

type Mounted<State> = (state: State) => boolean

/** One dynamic binding and the renderer service that owns that slot. */
export interface Slot<State, Renderer> {
  readonly id: string
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  readonly attach: (state: State, adopt: boolean) => Effect.Effect<Mounted<State>, never, Renderer>
}

const slot =
  <Renderer, Value>(service: Context.Key<Renderer, Patch<Value>>) =>
  <State>(id: string, expr: Expr.Expr<State, Value>): Slot<State, Renderer> => ({
    id,
    reads: Expr.reads(expr),
    attach: (state, adopt) =>
      Effect.map(service, renderer => {
        let current = Expr.evaluate(expr, state)
        if (!adopt) renderer.set(id, current)
        return next => {
          const value = Expr.evaluate(expr, next)
          if (Object.is(value, current)) return false
          renderer.set(id, value)
          current = value
          return true
        }
      }),
  })

export const text = slot(Text)
export const checkbox = slot(Checkbox)
export const action = slot(Action)
export const textInput = slot(TextInput)
export const keyedList = slot(KeyedList)

export interface Paint {
  readonly evaluated: ReadonlyArray<string>
  readonly patched: ReadonlyArray<string>
}

export interface MountedSurface<State> {
  readonly paint: (commit: Observed<State>) => Paint
}

export interface Surface<State, Renderer> {
  readonly graph: DependencyGraph
  readonly mount: (
    state: State,
    mode?: 'fresh' | 'resume',
  ) => Effect.Effect<MountedSurface<State>, never, Renderer>
}

export type Requirements<S> = S extends Surface<never, infer R> ? R : never

/** Return bindings and reachable intents whose inputs a resume envelope omits. */
export const uncovered = (
  graph: DependencyGraph,
  provided: ReadonlyArray<ReadonlyArray<string>>,
  reachable: Readonly<Record<string, Option.Option<ReadonlyArray<ReadonlyArray<string>>>>>,
): ReadonlyArray<string> => {
  const includes = (path: ReadonlyArray<string>) => provided.some(held => covers(held, path))
  const bindings = [...graph.readers.values()]
    .filter(reader =>
      reader.reads.some(edge =>
        Option.match(edge.path, {
          onNone: () => !includes([]),
          onSome: path => !includes(path.segments),
        }),
      ),
    )
    .map(reader => reader.id)
  const intents = Object.entries(reachable)
    .filter(([, reads]) =>
      Option.match(reads, {
        onNone: () => !includes([]),
        onSome: paths => !paths.every(includes),
      }),
    )
    .map(([intent]) => intent)
  return [...bindings, ...intents]
}

/** Build the dependency index once per declared surface. */
type SlotRequirements<S> = S extends Slot<never, infer R> ? R : never

export const define =
  <State>() =>
  <const Slots extends ReadonlyArray<Slot<State, unknown>>>(
    declarations: Slots,
  ): Surface<State, SlotRequirements<Slots[number]>> => {
    const slots = declarations as ReadonlyArray<Slot<State, SlotRequirements<Slots[number]>>>
    const graph = build({
      writers: [],
      readers: slots.map(({ id, reads }) => ({
        id,
        kind: 'binding',
        reads: Option.match(reads, {
          onNone: () => [unknownEdge()],
          onSome: paths => paths.map(path => knownEdge(modelPath(path), 'derived')),
        }),
      })),
    })
    return {
      graph,
      mount: (state, mode = 'fresh') =>
        Effect.map(
          Effect.forEach(slots, slot =>
            Effect.map(slot.attach(state, mode === 'resume'), attach => [slot.id, attach] as const),
          ),
          installed => {
            const bindings = new Map(installed)
            return {
              paint: ({ state, writes }) => {
                const dirty = new Set<string>()
                for (const write of writes) {
                  const affected =
                    write.kind === 'keyed-field' ? [...write.path, '*', write.field] : write.path
                  for (const id of graph.readersOf(modelPath(affected))) dirty.add(id)
                }
                const evaluated = [...dirty]
                const patched = evaluated.filter(id => bindings.get(id)!(state))
                return { evaluated, patched }
              },
            }
          },
        ),
    }
  }

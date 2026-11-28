import { Data, Option, Result, Schema } from 'effect'
import { Path, Transition } from '@doeixd/metakit'
import type { Machine } from '@doeixd/metakit/machine'

type Transitions = Readonly<Record<string, unknown>>

export type Block<
  Name extends string,
  Model,
  Arms extends Transitions,
> = (abstract new () => object) & {
  readonly id: Name
  readonly model: Schema.Codec<Model>
  readonly machine: Machine<Model, Arms>
}

/** Give a machine a stable name that a parent can bind through either declaration spelling. */
export const make = <const Name extends string, Model, Arms extends Transitions>(
  id: Name,
  machine: Machine<Model, Arms>,
): Block<Name, Model, Arms> => {
  if (id.length === 0) throw new Error('A Block needs a stable name')
  abstract class Declaration {
    static readonly id = id
    static readonly model = machine.stateSchema
    static readonly machine = machine
  }
  return Declaration
}

export const targetSchema = Schema.Struct({
  owner: Schema.NonEmptyString,
  binding: Schema.NonEmptyString,
  key: Schema.String,
  incarnation: Schema.NonEmptyString,
})
export type Target = typeof targetSchema.Type

export interface Occurrence<Row> {
  readonly incarnation: string
  readonly model: Row
}

export type Children<Row> = Readonly<Record<string, Occurrence<Row>>>

export class StaleTarget extends Data.TaggedError('SuccessorStaleTarget')<{
  readonly target: Target
}> {}

export interface Observed<State> {
  readonly state: State
  readonly writes: ReadonlyArray<Transition.ObservedWrite>
}

export interface ChildStep<Row, Output> extends Observed<Row> {
  readonly emitted: ReadonlyArray<Output>
}

/** Use the canonical segment for a keyed occurrence, including keys such as "*". */
export const keySegment = (key: string): string => JSON.stringify(key)

type Child<Row> = { readonly id: string; readonly model: Schema.Codec<Row> }

export interface Binding<Parent, Row, Contract extends Child<Row>> {
  readonly id: string
  readonly child: Contract
  readonly get: (parent: Parent, key: string) => Option.Option<Occurrence<Row>>
  readonly target: (owner: string, key: string, row: Occurrence<Row>) => Target
  readonly path: (key: string, ...field: ReadonlyArray<string>) => ReadonlyArray<string>
  readonly step: <Input, Output, Failure>(config: {
    readonly owner: string
    readonly parent: Parent
    readonly target: Target
    readonly input: Input
    readonly update: (
      row: Row,
      input: NoInfer<Input>,
    ) => Result.Result<ChildStep<Row, Output>, Failure>
    readonly fold: (candidate: Parent, output: NoInfer<Output>) => Observed<Parent>
  }) => Result.Result<ChildStep<Parent, Output>, StaleTarget | Failure>
}

/** Bind a child collection to the parent field that owns its lifetime. */
export const keyed = <Parent, Row, Contract extends Child<NoInfer<Row>>>(
  id: string,
  at: Path.Path<Parent, Children<Row>>,
  child: Contract,
): Binding<Parent, Row, Contract> => {
  const owned = (key: string) =>
    Path.make<Parent, Occurrence<Row>>([...at.segments, keySegment(key)])
  const get = (parent: Parent, key: string) => Path.get(owned(key), parent)
  const path: Binding<Parent, Row, Contract>['path'] = (key, ...field) => [
    ...owned(key).segments,
    'model',
    ...field,
  ]

  return {
    id,
    child,
    get,
    target: (owner, key, row) => ({ owner, binding: id, key, incarnation: row.incarnation }),
    path,
    step: ({ owner, parent, target, input, update, fold }) => {
      const row = get(parent, target.key)
      if (
        owner !== target.owner ||
        id !== target.binding ||
        Option.isNone(row) ||
        row.value.incarnation !== target.incarnation
      ) {
        return Result.fail(new StaleTarget({ target }))
      }
      const prior = row.value
      return Result.map(update(prior.model, input), child => {
        let state = parent
        if (!Object.is(prior.model, child.state)) {
          state = Path.set(owned(target.key), parent, { ...prior, model: child.state })
        }
        const writes = child.writes.map(write => ({
          ...write,
          path: path(target.key, ...write.path),
        }))
        for (const output of child.emitted) {
          const reaction = fold(state, output)
          state = reaction.state
          writes.push(...reaction.writes)
        }
        return { state, writes, emitted: child.emitted }
      })
    },
  }
}

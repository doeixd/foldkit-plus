/**
 * `Imported.mutation`: a Domain command the author did not declare as a
 * `Write`, as a mutation Remote can send. It carries no `write`, so Remote
 * predicts nothing for it; what it says it touches is its `footprint`.
 */
import type { Schema } from 'effect'
import { Footprint, type AnyEntity, type DeclaredFootprint } from 'foldkit-entity'
import { Mutation, type MutationDescriptor } from 'foldkit-remote'
import type { AnyApi, CommandInputOf, CommandNameOf, CommandOf } from '../adapter/binding.js'
import { inputOf, replyOf } from './schemas.js'

type UnknownFootprint = typeof Footprint.unknown

/** What `Imported.mutation` takes besides the Api and the command's name. */
export interface ImportedConfig<E extends AnyEntity, Refused> {
  /** The Entity whose rows the command changes: the one its View serves. */
  readonly entity: E
  /**
   * What the command reads and writes of that Entity, on whose word:
   * `Footprint.declared({ writes: [Product.fields.note], by })`. Without it
   * the footprint is `Footprint.unknown`, which Remote reads as no word at all.
   */
  readonly footprint?: DeclaredFootprint<E['name']> | UnknownFootprint
  /** What the server may refuse the mutation with; `Schema.Never` when none. */
  readonly refusal?: Schema.Codec<Refused, any>
}

/** The mutation an imported command lands as: its target and input, its reply, its refusals. */
export type ImportedMutation<
  A extends AnyApi,
  Name extends CommandNameOf<A>,
  Refused,
> = MutationDescriptor<
  Name,
  {
    readonly target: CommandOf<A, Name>['target']['Type']
    readonly input: CommandInputOf<CommandOf<A, Name>>
  },
  CommandOf<A, Name>['reply'] extends Schema.Top ? CommandOf<A, Name>['reply']['Type'] : {},
  Refused
>

const fail = (message: string): never => {
  throw new Error(`[foldkit-remote-domain] ${message}`)
}

/**
 * Declares the command `name` of `api` as a mutation named after it, with
 * `{ target, input }` as its input and the command's reply as its output.
 * Throws, naming it, for a command the Api does not serve and for a
 * `Declared` footprint of another Entity or naming a field `entity` lacks.
 * It makes no binding: `DomainRemote.command` takes the mutation to bind it.
 */
export const mutation = <
  A extends AnyApi,
  const Name extends CommandNameOf<A>,
  E extends AnyEntity,
  Refused = never,
>(
  api: A,
  name: Name,
  config: ImportedConfig<E, Refused>,
): ImportedMutation<A, Name, Refused> => {
  const served = api.commands.find(each => each.tag === name)
  if (served === undefined) return fail(`${api.apiName} serves no command named ${name}`)
  const footprint = config.footprint ?? Footprint.unknown
  if (footprint._tag === 'Declared') {
    if (footprint.entity !== config.entity.name)
      fail(`${name}'s footprint is of ${footprint.entity}, but its Entity is ${config.entity.name}`)
    const stranger = [...footprint.reads, ...footprint.writes].find(
      key => !Object.hasOwn(config.entity.fields, key),
    )
    if (stranger !== undefined)
      fail(`${name}'s footprint names ${stranger}, which ${config.entity.name} does not declare`)
  }
  const made = Mutation.make(name, {
    Input: inputOf(served),
    Output: replyOf(served),
    ...(config.refusal === undefined ? {} : { Refusal: config.refusal }),
  })
  return {
    ...made,
    footprint: { entity: config.entity.identity, footprint },
  } as unknown as ImportedMutation<A, Name, Refused>
}

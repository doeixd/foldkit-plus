/**
 * `Imported.describe`: what an Api's bindings import into Remote, as plain
 * data: each command with its schemas, its rejections and its footprint, and
 * each View with the Entity it serves. The format is ours; Domain has no
 * `Api.describe` to follow.
 */
import type * as Domain from '@alchemy.run/domain'
import { Option } from 'effect'
import { Footprint, Write } from 'foldkit-entity'
import type {
  AnyApi,
  AnyMutation,
  CommandBinding,
  CommandNameOf,
  CommandOf,
  RejectionTagOf,
  ViewBinding,
} from '../adapter/binding.js'
import { inputOf, jsonSchemaOf, tagOf, type JsonSchema } from './schemas.js'

/** One rejection a command may answer with, and the form key it shows beside. */
export interface RejectionDescription {
  readonly tag: string
  readonly schema: JsonSchema
  readonly field: Option.Option<string>
}

/** One command, as a mutation Remote sends. */
export interface OperationDescription {
  /** The Api's name and the command's tag: stable across releases. */
  readonly id: string
  readonly kind: 'Command'
  readonly description: Option.Option<string>
  readonly input: JsonSchema
  /** None for a command that answers only its receipt. */
  readonly reply: Option.Option<JsonSchema>
  readonly rejections: ReadonlyArray<RejectionDescription>
  /** The mutation it lands as. */
  readonly mutation: string
  /** Its Entity's members it reads and writes: derived from a Write, declared, or unknown. */
  readonly footprint: Footprint
}

/** One View, as the Entity it serves. */
export interface ReadDescription {
  readonly id: string
  readonly kind: 'View'
  readonly entity: string
  /** The Entity's fields besides its id, which keys the View. */
  readonly fields: ReadonlyArray<string>
  /** The field every event moves. */
  readonly revision: string
}

export interface ImportedDescription {
  readonly api: string
  readonly operations: ReadonlyArray<OperationDescription>
  readonly reads: ReadonlyArray<ReadDescription>
}

/** The form key each Rejection shows beside, by command and Rejection tag. */
export type RejectionFields<A extends AnyApi> = {
  readonly [Command in CommandNameOf<A>]?: {
    readonly [Tag in RejectionTagOf<CommandOf<A, Command>>]?: string
  }
}

export interface DescribeConfig<A extends AnyApi> {
  readonly views: ReadonlyArray<ViewBinding<any, A>>
  readonly commands: ReadonlyArray<CommandBinding<AnyMutation, A>>
  /**
   * The form key a Rejection shows beside, by command and tag: for `Invalid`,
   * the invariant's path. A Rejection named here that its command does not
   * declare throws.
   */
  readonly fields?: RejectionFields<A>
}

const fail = (message: string): never => {
  throw new Error(`[foldkit-remote-domain] ${message}`)
}

const byId = <T extends { readonly id: string }>(items: ReadonlyArray<T>): ReadonlyArray<T> => {
  const seen = new Set<string>()
  for (const { id } of items) {
    if (seen.has(id)) fail(`${id} is described twice`)
    seen.add(id)
  }
  return [...items].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

/** Declared writes derive their footprint; any other mutation names one, or none. */
const footprintOf = (mutation: AnyMutation): Footprint =>
  mutation.write !== undefined
    ? Write.footprint(mutation.write)
    : Option.match(Option.fromUndefinedOr(mutation.footprint), {
        onNone: () => Footprint.unknown,
        onSome: ({ footprint }) => footprint,
      })

/**
 * Describes the Views and commands `api` has bound, sorted by id so a list
 * reordered in the source is no change to the text. Throws, naming it, for a
 * binding of another Api.
 */
export const describe = <A extends AnyApi>(
  api: A,
  config: DescribeConfig<A>,
): ImportedDescription => {
  for (const binding of [...config.views, ...config.commands]) {
    if (binding.api !== api)
      fail(
        `${'view' in binding ? binding.view : binding.command} is bound to ${binding.api.apiName}, not ${api.apiName}`,
      )
  }
  const fields: Readonly<Record<string, Readonly<Record<string, string | undefined>> | undefined>> =
    config.fields ?? {}
  for (const [command, tags] of Object.entries(fields)) {
    const bound = config.commands.find(binding => binding.command === command)
    if (bound === undefined) fail(`fields names ${command}, which no command given is`)
    for (const tag of Object.keys(tags ?? {})) {
      if (!bound!.rejections.some(rejection => tagOf(rejection) === tag))
        fail(`fields names ${tag}, which ${command} does not declare`)
    }
  }
  const operations = config.commands.map((binding): OperationDescription => {
    const served: Domain.Command.Any = api.commands.find(each => each.tag === binding.command)!
    return {
      id: `${api.apiName}/${served.tag}`,
      kind: 'Command',
      description: Option.fromUndefinedOr(served.annotations.description),
      input: jsonSchemaOf(inputOf(served)),
      reply: Option.map(Option.fromUndefinedOr(served.reply), jsonSchemaOf),
      rejections: served.rejects.map(rejection => {
        const tag = tagOf(rejection)
        return {
          tag,
          schema: jsonSchemaOf(rejection),
          field: Option.fromUndefinedOr(fields[served.tag]?.[tag]),
        }
      }),
      mutation: binding.mutation.name,
      footprint: footprintOf(binding.mutation),
    }
  })
  const reads = config.views.map((binding): ReadDescription => ({
    id: `${api.apiName}/${binding.view}`,
    kind: 'View',
    entity: binding.entity.name,
    fields: Object.keys(binding.entity.fields).filter(field => field !== 'id'),
    revision: binding.revision,
  }))
  return { api: api.apiName, operations: byId(operations), reads: byId(reads) }
}

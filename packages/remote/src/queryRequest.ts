/** The wire request a planned query sends. */
import { Result, type Schema } from 'effect'
import type { QueryWindow } from './query.js'
import type { RelationRequirement } from './requirement.js'
import { RemoteQueryError, type QueryRequest } from './wire.js'

/**
 * The wire request of a planned query; a `QueryRef` identity carries the query
 * name and the canonical encoded input. A connection requirement built by hand
 * with another identity cannot be run, and fails as a query would.
 */
export const parsedQueryRequest = (query: {
  readonly identity: string
  readonly window: QueryWindow
  readonly select?: RelationRequirement | undefined
}): Result.Result<Schema.Schema.Type<typeof QueryRequest>, RemoteQueryError> => {
  const separator = query.identity.indexOf('\u0000')
  if (separator < 0) {
    return Result.fail(
      new RemoteQueryError({
        message: `connection "${query.identity}" is not a query's: only a QueryRef identity can be run`,
      }),
    )
  }
  try {
    return Result.succeed({
      query: query.identity.slice(0, separator),
      input: JSON.parse(query.identity.slice(separator + 1)) as unknown,
      window: query.window,
      ...(query.select === undefined ? {} : { select: query.select }),
    })
  } catch {
    return Result.fail(
      new RemoteQueryError({ message: `connection "${query.identity}" carries no encoded input` }),
    )
  }
}

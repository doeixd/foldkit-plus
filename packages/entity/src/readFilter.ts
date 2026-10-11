/**
 * The members a server filters an Entity's rows by under a rule the client
 * does not run, such as an authorization rule. A client that places rows in
 * a list judges membership by the list's body; a change to one of these
 * members can move a row into or out of what the server lists, which only
 * the server can say. Declared by whoever owns the rule (`foldkit-guard`
 * attaches it), read by whoever places (`foldkit-remote`).
 */
import { Metadata } from 'foldkit-metadata'

const key = Metadata.key<ReadonlyArray<string>>('foldkit-entity/read-filter', {
  // Every rule attached filters rows, so their members add up.
  merge: lists => [[...new Set(lists.flat())]],
  summarize: members => members.join(', '),
})

export const ReadFilter = {
  /** Entity metadata: the rows the server lists depend on these members. */
  of: (members: ReadonlyArray<string>): Metadata => key.of(members),

  /** The members an Entity's metadata names, every attachment's together. */
  members: (metadata: Metadata): ReadonlyArray<string> => key.get(metadata)[0] ?? [],
}

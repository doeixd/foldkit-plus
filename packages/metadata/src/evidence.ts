/**
 * `Evidence`: a record that a transition keeps a law, and what showed it
 * (#537). Three packages produce records and a fourth reads them, so they
 * live here, where Entity and Surface both look.
 *
 * A record is plain data, so anyone can type one. What tells a produced
 * record from a typed one is the stamp: each issuer keeps the records it
 * issued, by identity, and a record built by hand or copied with a spread
 * was issued by no one.
 */
import { Data, Option } from 'effect'

/**
 * A transition (`write:Sell`, `durable:CreatedTodo`) keeps a law
 * (`Product.reservedWithinStock`), and how that was shown.
 */
export type Evidence = Data.TaggedEnum<{
  /** `Laws.check` decided the pair by reading the declarations. */
  Enumerated: { readonly transition: string; readonly law: string }
  /** A scenario ran on `runner` (`remote`, `sqlite`, `domain-story`) with no mismatch. */
  Scenario: {
    readonly transition: string
    readonly law: string
    readonly name: string
    readonly runner: string
  }
  /** Every seeded walk from every start passed. It says which seeds, not that no other fails. */
  Walked: {
    readonly transition: string
    readonly law: string
    readonly seeds: number
    readonly steps: number
    readonly starts: ReadonlyArray<string>
  }
  /** Only the writer or the journal refuses it, in production, and `why` nothing earlier covers it. */
  RuntimeOnly: { readonly transition: string; readonly law: string; readonly why: string }
}>

/** What a producer issues records with. */
export interface EvidenceIssuer {
  readonly name: string
  /** A frozen copy of `record`, stamped with this issuer's name. */
  readonly issue: (record: Evidence) => Evidence
}

const issuedBy = new WeakMap<Evidence, string>()
// One issuer per name, so a stamp's name is the producer that took it first.
const taken = new Set<string>()

const issuer = (name: string): EvidenceIssuer => {
  if (name.trim().length === 0)
    throw new Error('[foldkit-metadata] Evidence.issuer: a name is required')
  if (taken.has(name))
    throw new Error(`[foldkit-metadata] Evidence.issuer: ${name} already has an issuer`)
  taken.add(name)
  return {
    name,
    issue: record => {
      const issued = Object.freeze({ ...record })
      issuedBy.set(issued, name)
      return issued
    },
  }
}

const constructors = Data.taggedEnum<Evidence>()
const byHand = issuer('foldkit-metadata/runtimeOnly')

export const Evidence = {
  /** Records for a producer to `issue`; one made here and not issued has no issuer. */
  Enumerated: constructors.Enumerated,
  Scenario: constructors.Scenario,
  Walked: constructors.Walked,
  $is: constructors.$is,
  $match: constructors.$match,
  /**
   * Made once, at module level, by a module that produces evidence; a second
   * issuer of a name throws, so a module loaded after a producer cannot
   * stamp as it. Only the producers call it, which
   * `scripts/evidence-check.mjs` holds in this repository; nothing stops
   * another author taking an unused name, so a stamp says who made a record,
   * not that the record is true.
   */
  issuer,
  /** The producer that issued `record`; none for a record typed by hand or copied. */
  issuedBy: (record: Evidence): Option.Option<string> =>
    Option.fromUndefinedOr(issuedBy.get(record)),
  /**
   * The record for a pair nothing before production covers: the writer or
   * the journal refuses it, and `why` says why no check, walk or scenario
   * can. Throws on an empty reason.
   */
  runtimeOnly: (fields: {
    readonly transition: string
    readonly law: string
    readonly why: string
  }) => {
    if (fields.why.trim().length === 0)
      throw new Error(
        `[foldkit-metadata] Evidence.runtimeOnly: ${fields.transition} x ${fields.law} needs a reason`,
      )
    return byHand.issue(constructors.RuntimeOnly(fields))
  },
}

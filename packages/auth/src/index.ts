/**
 * `foldkit-auth`: what a client and its server share about who is signed in.
 * Nothing here imports Yielded, so a browser bundle may take it.
 */
import { Option } from 'effect'

/**
 * The header a client sends saying who it believes it is: `visitor`, or
 * `subject:` and the subject's id. A server that would answer as anyone else
 * refuses instead, so a sign-out or a switch of account in another tab, or an
 * expiry, never fills the client's cache with someone else's answers.
 */
export const SUBJECT_HEADER = 'x-foldkit-subject'

/** What the client says when it believes it is `subjectId`, or a visitor. */
export const subjectSaid = (subjectId: Option.Option<string>): string =>
  Option.match(subjectId, { onNone: () => 'visitor', onSome: id => `subject:${id}` })

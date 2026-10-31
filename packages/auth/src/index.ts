/**
 * `foldkit-auth`: what a client and its server share about who is signed in.
 * Nothing here imports Yielded, so a browser bundle may take it.
 */
import { Option } from 'effect'

/**
 * The header a client sends saying who it believes it is: `visitor`, or
 * `subject:` and who: the session's subject id, or the principal's key where
 * the resolver is given `key` (`Me`'s `key`). A server that would answer as
 * anyone else refuses instead (`SUBJECT_CHANGED`).
 */
export const SUBJECT_HEADER = 'x-foldkit-subject'

/**
 * What the client says when it believes it is `who`, or a visitor. The id
 * is URI-encoded: a header carries Latin-1 only, and a key that is an email
 * or a name may not be.
 */
export const subjectSaid = (who: Option.Option<string>): string =>
  Option.match(who, {
    onNone: () => 'visitor',
    onSome: id => `subject:${encodeURIComponent(id)}`,
  })

/**
 * The reason a request is refused when its `x-foldkit-subject` names someone
 * other than whom the server would answer as: who is signed in changed (in
 * another tab, say) since the client last heard. What the client holds was
 * read as someone else, so `Remote.forget` is the answer, never a sign-in.
 */
export const SUBJECT_CHANGED = 'Who is signed in changed.'

/** A `fetch` that says who its client believes it is; see `believing`. */
export interface Believing {
  readonly fetch: typeof fetch
  /**
   * Believes no one until the next answer says who. For a change of
   * principal this client made itself, a sign-in or sign-out, before it
   * reads again; another tab's change is found by the refusal it causes.
   */
  readonly forget: () => void
}

/**
 * A `fetch` for `Remote.http` and `httpWithLive` (`foldkit-remote/live`) that repeats, as
 * `x-foldkit-subject`, whom the server last said it answered as (its
 * `AuthServer.answered` header). While it holds a belief, a request the
 * server would answer as someone else is refused with `SUBJECT_CHANGED`
 * instead, so a switch of account in another tab does not fill this
 * client's cache with the new account's answers. Any 401, and `forget`,
 * leave it believing no one until the next answer says who: a request in
 * that gap is answered as whoever the cookie names, so an application that
 * keeps what Remote holds through a 401 (a session that ended, shown with
 * its old rows) forgets it before another tab could sign in. An answer to a
 * request sent before the last 401 or `forget` is not believed: it was for
 * whoever was signed in then. The belief lives here, beside the cookie it
 * describes, never in the Model. `via` defaults to the global `fetch`, read
 * per request.
 */
export const believing = (via?: typeof fetch): Believing => {
  let believed = Option.none<string>()
  // Moves on each 401 and `forget`: an answer to a request sent before is stale.
  let epoch = 0
  return {
    fetch: async (input, init) => {
      const asked = epoch
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}))
      if (Option.isSome(believed) && !headers.has(SUBJECT_HEADER))
        headers.set(SUBJECT_HEADER, believed.value)
      const response = await (via ?? fetch)(input, { ...init, headers })
      const said = response.headers.get(SUBJECT_HEADER)
      if (response.status === 401) {
        believed = Option.none()
        epoch += 1
      } else if (said !== null && asked === epoch) believed = Option.some(said)
      return response
    },
    forget: () => {
      believed = Option.none()
      epoch += 1
    },
  }
}

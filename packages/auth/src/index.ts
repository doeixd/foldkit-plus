/**
 * `foldkit-auth`: what a client and its server share about who is signed in.
 * Nothing here imports Yielded, so a browser bundle may take it.
 */
import { Option } from 'effect'

/**
 * The header a client sends saying who it believes it is: `visitor`, or
 * `subject:` and who: the session's subject id, or the principal's key where
 * the resolver is given `key` (`Me`'s `key`). A server that would answer as anyone else
 * refuses instead, so a sign-out or a switch of account in another tab, or an
 * expiry, never fills the client's cache with someone else's answers.
 */
export const SUBJECT_HEADER = 'x-foldkit-subject'

/** What the client says when it believes it is `who`, or a visitor. */
export const subjectSaid = (who: Option.Option<string>): string =>
  Option.match(who, { onNone: () => 'visitor', onSome: id => `subject:${id}` })

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
 * A `fetch` for `Remote.http` and `Remote.httpWithLive` that repeats, as
 * `x-foldkit-subject`, whom the server last said it answered as (its
 * `AuthServer.answered` header). Once the server would answer as someone
 * else, every request is refused with `SUBJECT_CHANGED` instead, so a switch
 * of account in another tab never fills this client's cache with the new
 * account's answers. Any 401 forgets the belief, so the reads after it,
 * once `Remote.forget` asks them again, learn who is signed in now. The
 * belief lives here, beside the cookie it describes, never in the Model.
 * `via` defaults to the global `fetch`, read per request.
 */
export const believing = (via?: typeof fetch): Believing => {
  let believed = Option.none<string>()
  return {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}))
      if (Option.isSome(believed) && !headers.has(SUBJECT_HEADER))
        headers.set(SUBJECT_HEADER, believed.value)
      const response = await (via ?? fetch)(input, { ...init, headers })
      const said = response.headers.get(SUBJECT_HEADER)
      if (response.status === 401) believed = Option.none()
      else if (said !== null) believed = Option.some(said)
      return response
    },
    forget: () => {
      believed = Option.none()
    },
  }
}

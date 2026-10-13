import type { RemoteJsonAnswer, RemoteUnauthenticated } from 'foldkit-remote'

/** A caller who could not be told, as a 401 body: the twin of `answer`'s 403. */
export const unauthenticatedAnswer = (refusal: RemoteUnauthenticated) =>
  ({
    status: 401,
    body: {
      error: refusal.message,
      unauthenticated: refusal.reason === undefined ? {} : { reason: refusal.reason },
    } satisfies RemoteJsonAnswer,
  }) as const

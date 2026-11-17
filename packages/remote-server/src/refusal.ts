import type { RemoteJsonAnswer, RemoteUnauthenticated } from 'foldkit-remote'

/**
 * A caller who could not be told, as a 401 body: the twin of `answer`'s 403.
 * It says the refusal's `reason`, the words written for the caller, or
 * "Unauthenticated"; a refusal's `message` may be anyone's, and is not sent.
 */
export const unauthenticatedAnswer = (refusal: RemoteUnauthenticated) =>
  ({
    status: 401,
    body: {
      error: refusal.reason ?? 'Unauthenticated',
      unauthenticated: refusal.reason === undefined ? {} : { reason: refusal.reason },
    } satisfies RemoteJsonAnswer,
  }) as const

/**
 * Who may upload: a request bearing the deployment's `UPLOAD_TOKEN` secret, and
 * nobody while it is unset. Its own module, apart from the worker, so a test
 * runs it without a Worker runtime.
 */
import { Effect, Layer } from 'effect'
import { UploadForbidden, UploadPolicy } from 'foldkit-media/server'

// Compared by digest, so the comparison's time says nothing of the token.
const digestOf = async (text: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).join()

export const uploadPolicy = (token: string | undefined): Layer.Layer<UploadPolicy> =>
  Layer.succeed(UploadPolicy, {
    admit: request =>
      Effect.promise(async () => {
        const given = request.headers['authorization'] ?? ''
        // Unset, no request matches: not even one sending `Bearer undefined`.
        return (
          (token ?? '') !== '' && (await digestOf(given)) === (await digestOf(`Bearer ${token}`))
        )
      }).pipe(
        Effect.flatMap(admitted => (admitted ? Effect.void : Effect.fail(new UploadForbidden({})))),
      ),
  })

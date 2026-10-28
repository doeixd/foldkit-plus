/**
 * Yielded's contract: register, sign in, and the session actions every
 * contract has (`signOut` among them). Its own module, which the page names
 * only as a type, so its code ships in the client's auth chunk
 * (`authClient.ts`) and the Worker, not in every page.
 *
 * The claims are empty on purpose: a claim is a snapshot from sign-in, and
 * the principal is read fresh per request instead (`worker.ts`).
 */
import { AuthContract, Password } from '@yielded/auth'
import { Email } from '@yielded/auth/Schema'
import { Schema } from 'effect'

/** What sign-up asks beyond an email and a password. */
export const Registration = Schema.Struct({ name: Schema.NonEmptyString })

/**
 * Yielded has a helper for password sign-in and none for registration, so
 * `register` is declared with the schemas of the strategy's own operation.
 *
 * @internal Its type names modules `@yielded/auth` does not export (TS2742);
 * `stripInternal` leaves it out of this example's declarations.
 */
export const AuthApi = AuthContract.make('reference/Auth', {
  claims: Schema.Struct({}),
  actions: sessions => ({
    signIn: AuthContract.passwordSignIn(sessions),
    register: AuthContract.action({
      payload: Schema.Struct({
        requestId: Password.PasswordCommandId,
        email: Email,
        newPassword: Schema.RedactedFromValue(Schema.String),
        registration: Registration,
      }),
      success: Schema.TaggedStruct('RegistrationAccepted', {}),
      error: Schema.Union([
        Password.NewPasswordRejected,
        Password.PasswordCheckUnavailable,
        Password.PasswordRejected,
        Password.PasswordUnavailable,
        Password.PasswordMethodUnsupported,
        Password.PasswordActionRequired,
      ]),
      mode: 'mutation',
      replay: 'idempotent',
    }),
  }),
})

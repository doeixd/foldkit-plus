/**
 * Yielded's contract: password sign-in, plus the session actions every
 * contract has (`signOut` among them). The claims are empty on purpose: a
 * claim is a snapshot from sign-in, and the principal is read fresh per
 * request instead.
 *
 * Its own module, which the page's entry names only as a type, so the
 * contract's code ships in Yielded's client chunk (`authClient.ts`), not in
 * the chunk every page loads.
 */
import * as AuthContract from '@yielded/auth/AuthContract'
import { Schema } from 'effect'

/**
 * @internal Its type names modules `@yielded/auth` does not export, so a
 * declaration file cannot (TS2742); `stripInternal` leaves it out of this
 * example's declarations, which nothing reads.
 */
export const AuthApi = AuthContract.make('example/Auth', {
  claims: Schema.Struct({}),
  actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
})

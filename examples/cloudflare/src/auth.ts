/**
 * Yielded Auth's definition for this worker, and where it keeps its rows:
 * what `authRoutes.ts` serves over D1. Nothing here imports the Workers
 * runtime, so the tests read the tables from Node.
 *
 * - `accounts` is the application's own table, one row per person.
 *   Yielded's tables (`auth_*`) hold the email, the password and the
 *   sessions; `migrations/0005_auth.sql` creates both.
 * - Sign-up writes the `accounts` row through `Provisioning`, in the same D1
 *   batch as the email and the password, so no account exists half made.
 */
import {
  Auth,
  AuthContract,
  EmailDelivery,
  Operations,
  Password,
  Schema as AuthSchema,
  Sessions,
} from '@yielded/auth'
import { Email } from '@yielded/auth/Schema'
import { AuthPersistence } from '@yielded/auth-persistence-drizzle/D1'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Redacted, Schema } from 'effect'

/** What sign-up asks beyond an email and a password. */
const Registration = Schema.Struct({ displayName: Schema.NonEmptyString })

/**
 * Password sign-in and registration, plus the session actions every contract
 * has (`signOut` among them). Yielded has no helper for `register`, so it is
 * declared with the schemas of the password strategy's own operation.
 */
const AuthApi = AuthContract.make('cloudflare/Auth', {
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

/**
 * @internal Its type names modules `@yielded/auth` does not export (TS2883);
 * `stripInternal` leaves it out of this example's declarations, as `storage`.
 */
export const App = Auth.make(AuthApi, {
  sessions: Sessions.stateful({ idleTimeout: '1 hour', maxAge: '1 day' }),
  strategies: {
    password: Password.make({
      registration: Registration,
      // Yielded takes registration only beside a reset. The contract names no
      // reset action, so none is served and this link is never sent.
      reset: Password.resetLink({ url: 'https://example.invalid/reset' }),
    }),
  },
  defaultStrategy: 'password',
})

/** The application's own row per person: what `/me` answers from. */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  securityRevision: text('security_revision').notNull(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
})

/** What a sign-in must show: one password, given within the minute. */
const requirement = Sessions.AuthenticationRequirement.make({
  alternatives: [
    {
      factors: ['knowledge'],
      minimumCredentials: 1,
      userVerified: false,
      phishingResistant: false,
    },
  ],
  maximumAgeMillis: 60_000,
})

const Persistence = AuthPersistence.make(App)

/**
 * Yielded's tables, named `auth_<role>`, beside `accounts`.
 *
 * @internal As `App`.
 */
export const storage = Persistence.managed({
  subjects: {
    table: accounts,
    id: 'id',
    status: 'status',
    activeValue: 'active',
    securityRevision: 'securityRevision',
    idCodec: AuthSchema.SubjectId,
    requirements: () => Effect.succeed(requirement),
  },
  prefix: 'auth',
})

/** The new account's row, inserted by Yielded in the batch that binds its email. */
const Provisioning = Layer.succeed(Persistence.Provisioning, {
  password: {
    values: ({ identifier, registration }) =>
      Effect.sync(() => ({
        id: crypto.randomUUID(),
        status: 'active',
        securityRevision: crypto.randomUUID(),
        email: identifier.value,
        displayName: registration.displayName,
      })),
  },
})

/** Passwords no one may choose. A deployment asks Pwned Passwords' range API too. */
const common = new Set(['password password', 'correct horse battery staple'])

/**
 * Sign-up screens each new password; the contract has no change or reset,
 * so the services those would ask refuse.
 */
const PasswordOnly = Layer.mergeAll(
  Layer.succeed(Password.CompromisedPasswords, {
    check: password =>
      Effect.succeed(
        common.has(Redacted.value(password))
          ? { _tag: 'Rejected', reason: 'common' }
          : { _tag: 'Allowed' },
      ),
  }),
  Layer.succeed(Password.PasswordActionEvidence, {
    verify: () => Effect.fail(Password.PasswordActionRequired.make({})),
  }),
  Layer.succeed(EmailDelivery.EmailDelivery, {
    send: () => Effect.fail(EmailDelivery.EmailNotAccepted.make({})),
  }),
)

/**
 * `App` with everything but the platform: Workers' crypto and hashing
 * (`WorkerdServices`) and the D1 client, which `authRoutes.ts` gives it. The
 * Worker's clock and D1's differ, so a session's issue time may read as a
 * moment ahead; the strict default would refuse a correct password for it.
 *
 * @internal As `App`.
 */
export const AppServices = App.layer.pipe(
  Layer.provide(PasswordOnly),
  Layer.provide(
    Layer.succeed(App.strategies.password.SessionClaims, { resolve: () => Effect.succeed({}) }),
  ),
  Layer.provideMerge(Persistence.layer.pipe(Layer.provide(Provisioning))),
  Layer.provide(Persistence.Config.layer(storage)),
  Layer.provideMerge(Operations.AuthenticationClock.layer({ futureToleranceMillis: 1000 })),
)

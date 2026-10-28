/**
 * Yielded Auth's definition, and where it keeps its rows: `accounts`, the
 * application's own row per member, beside Yielded's tables (`auth_*`).
 * Sign-up writes the account row in the D1 batch that binds the email and
 * the password, so no account exists half made. Nothing here imports the
 * Workers runtime (`WorkerdServices` is `worker.ts`'s), so the tests read
 * the tables from Node.
 */
import {
  Auth,
  EmailDelivery,
  Operations,
  Password,
  Schema as AuthSchema,
  Sessions,
} from '@yielded/auth'
import { AuthPersistence } from '@yielded/auth-persistence-drizzle/D1'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Redacted } from 'effect'
import { AuthApi, Registration } from './authApi.js'

/**
 * @internal As `AuthApi`.
 */
export const App = Auth.make(AuthApi, {
  sessions: Sessions.stateful({ idleTimeout: '1 day', maxAge: '30 days' }),
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

/**
 * A member's account: Yielded's subject row, and the `Member` the notes
 * name as author (`server.ts` binds `id` and `name`).
 */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  securityRevision: text('security_revision').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
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

/** The new member's row, inserted by Yielded in the batch that binds its email. */
const Provisioning = Layer.succeed(Persistence.Provisioning, {
  password: {
    values: ({ identifier, registration }) =>
      Effect.sync(() => ({
        id: crypto.randomUUID(),
        status: 'active',
        securityRevision: crypto.randomUUID(),
        email: identifier.value,
        name: registration.name,
      })),
  },
})

/** Passwords no one may choose. A deployment asks Pwned Passwords' range API too. */
const common = new Set(['password password password', 'correct horse battery staple'])

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
 * `App` with everything but the platform: Workers' crypto and hashing and
 * the D1 client, which `worker.ts` gives it. The Worker's clock and D1's
 * differ, so a session's issue time may read as a moment ahead; the strict
 * default would refuse a correct password for it.
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

/**
 * The visitor as an Entity: one row, `me`, answered for whoever asks. What a
 * client knows about itself (signed in, as whom, what it may open) is read
 * through Remote like any row, `may` included, so no rule runs on the client.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Attaching, type Attach } from './attach.js'
import { May } from './may.js'

/** The one row's id. */
export const ME = 'me'

const MeFields = Entity.define(
  'Me',
  Schema.Struct({
    id: Schema.String,
    /** Whether the server answered as someone. */
    signedIn: Schema.Boolean,
    /** Who the server answered as: `declare`'s `key` of the principal. */
    key: Schema.OptionFromNullOr(Schema.String),
  }),
)

/** `Me`'s Entity, with `may`. */
export type MeEntity = ReturnType<typeof May.member<typeof MeFields>>

/**
 * `Me` for guard set `G`: everyone reads their own row, no one writes it, and
 * each interaction is answered in `may` as `G`'s bodies decide it for the
 * asker (`May.can(me.may, OpenAdmin.key)`).
 *
 * ```ts
 * const OpenAdmin = Interaction.make('OpenAdmin')
 * export const Me = Guards.me(G, { interactions: { [OpenAdmin.key]: [G.isAdmin] } })
 * ```
 */
export const me = <Name extends string, User>(
  G: {
    readonly name: Name
    readonly schema: Schema.Codec<User, unknown>
    readonly unguarded: 'allow' | 'deny'
  },
  options: {
    readonly interactions?: Attach<NoInfer<User>, NoInfer<Name>, typeof MeFields>['interactions']
  } = {},
): MeEntity =>
  MeFields.pipe(
    Attaching.attach(G, {
      row: { Read: [Attaching.anyone], Write: [] },
      ...(options.interactions === undefined ? {} : { interactions: options.interactions }),
    }),
    May.member,
  )

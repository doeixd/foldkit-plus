/**
 * Who may change what in the registry: a guard set, read by the journal's
 * checks of every edit. Server-only, since a body is the server's. Here every
 * device may edit and price; these rules are where a registry with roles
 * would say otherwise, and the journal enforces whatever they say.
 */
import { Option, Schema } from 'effect'
import { Guards } from 'foldkit-guard'
import { GuardSync } from 'foldkit-guard/sync'
import { Product, editedColumns } from './domain.js'

/** Who is editing: the actor an exchange is from. */
export const Editor = Schema.Struct({ actorId: Schema.String })

export const G = Guards.declare(
  'Registry',
  Editor,
  guard => ({ isEditor: guard.principal(), isPricer: guard.principal() }),
  { key: editor => editor.actorId },
)

export const Policy = G.implement({ isEditor: Option.isSome, isPricer: Option.isSome })

/** The product, with who may change it and its price. */
export const GuardedProduct = Product.pipe(
  Guards.attach(G, {
    row: { Update: [G.isEditor] },
    members: {
      cents: {
        Update: Guards.on([G.isPricer], Guards.explain('Only a pricer may change a price.')),
      },
    },
  }),
)

/** The edits' document: anyone may read a product, so it names no readers. */
export const ProductDocument = GuardSync.document<typeof Editor.Type>(
  { entity: GuardedProduct, members: editedColumns },
  { readers: [] },
)

/**
 * The SQLite authority: `ReserveStock` registered over `examples/writes`'
 * tables, through a guarded writer pinned to the revision and keeping a ledger
 * of the operations it lands, scoped to who asked.
 */
import { Option } from 'effect'
import { Product, type User } from 'foldkit-example-writes/domain'
import { ledger, Policy, products } from 'foldkit-example-writes/server'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { bind, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { ReserveStock } from './domain.js'

const Db = bind(
  { Product },
  { Product: { table: products, visible: GuardDrizzle.visible(Policy, [Product]).Product } },
)

const ledgered = GuardServer.writer(
  Product,
  Policy,
  writer<Option.Option<User>>(Db.Product, {
    ledger: {
      table: ledger,
      scope: principal => Option.match(principal, { onNone: () => '', onSome: user => user.id }),
    },
  }),
  { revision: 'revision' },
)

export const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [source(Db.Product, { filter: GuardServer.filter(Product, Policy) })],
  mutations: [RemoteServer.write(ReserveStock, ledgered)],
})

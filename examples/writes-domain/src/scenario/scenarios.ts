/** The scenarios the demo prints and the tests run: one per decision ReserveStock can reach. */
import { Option } from 'effect'
import { Product, reservedWithinStock } from 'foldkit-example-writes/domain'
import { ReserveStock } from '../domain.js'
import type { User } from 'foldkit-example-writes/domain'
import { Scenario } from 'foldkit-remote/testing'

const bolt = {
  id: 'p1',
  ownerId: 'ada',
  name: 'Bolt',
  status: 'published',
  stock: 10,
  reserved: 2,
  revision: 1,
}
const rivet = { ...bolt, id: 'p2', name: 'Rivet', status: 'draft', stock: 5, reserved: 0 }
const given = [
  { entity: Product, row: bolt },
  { entity: Product, row: rivet },
]
const ada = Option.some({ id: 'ada' })

const reserve = (
  name: string,
  when: { id: string; revision: number; quantity: number },
  options: { principal?: typeof ada; expect: Parameters<typeof Scenario.write>[0]['expect'] },
) =>
  Scenario.write<User>({
    name,
    given,
    principal: options.principal ?? ada,
    now: Date.parse('2026-03-01T00:00:00Z'),
    when: [ReserveStock, when],
    operation: 'op-1',
    expect: options.expect,
  })

export const accepted = reserve(
  'the owner reserves 3 at the revision read',
  { id: 'p1', revision: 1, quantity: 3 },
  { expect: Scenario.accepted({ reserved: 5, revision: 2 }) },
)

export const invalid = reserve(
  'reserving more than the stock is Invalid, naming reservedWithinStock',
  { id: 'p1', revision: 1, quantity: 9 },
  { expect: Scenario.refused(reservedWithinStock) },
)

export const scenarios = [
  accepted,
  invalid,
  reserve(
    'up to the stock exactly is accepted',
    { id: 'p1', revision: 1, quantity: 8 },
    { expect: Scenario.accepted({ reserved: 10, revision: 2 }) },
  ),
  reserve(
    'a stale revision is a conflict',
    { id: 'p1', revision: 0, quantity: 3 },
    { expect: Scenario.refused('Conflict') },
  ),
  reserve(
    'a draft is unmet',
    { id: 'p2', revision: 1, quantity: 1 },
    { expect: Scenario.refused('Unmet') },
  ),
  reserve(
    'anyone but the owner is forbidden',
    { id: 'p1', revision: 1, quantity: 3 },
    { principal: Option.some({ id: 'grace' }), expect: Scenario.forbidden },
  ),
  reserve(
    'a visitor is asked to sign in',
    { id: 'p1', revision: 1, quantity: 3 },
    { principal: Option.none(), expect: Scenario.unauthenticated },
  ),
]

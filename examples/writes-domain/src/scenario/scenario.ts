/**
 * The shop's scenarios are `Scenario` of `foldkit-remote/testing`, typed by the
 * shop's user. What stays here is what a runner needs of one that the shared
 * module does not offer: whether the write lands, and the row it was seeded with.
 */
import { Match } from 'effect'
import type { Row } from 'foldkit-entity'
import type { User } from 'foldkit-example-writes/domain'
import type { ScenarioRunner as Runner, WriteScenario as Write } from 'foldkit-remote/testing'

export type WriteScenario = Write<User>
export type ScenarioRunner = Runner<User>

/** Whether the scenario says the write lands. */
export const lands = ({ expect }: WriteScenario): boolean =>
  Match.valueTags(expect, {
    Accepted: () => true,
    Refused: () => false,
    Forbidden: () => false,
    Unauthenticated: () => false,
  })

/** The row the scenario seeded for the write's own Entity and `id`. */
export const seededRow = (scenario: WriteScenario, id: string): Row => {
  const entity = scenario.when[0].write.input.entity.name
  return (
    scenario.given.find(each => each.entity.name === entity && String(each.row['id']) === id)
      ?.row ?? {}
  )
}

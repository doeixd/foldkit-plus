/**
 * One reservation scenario per decision, each run from the same values on
 * SQLite, in memory and on the Domain model, printing what each backend said
 * at each step it owns. A backend that disagrees with the scenario shows as a
 * mismatch, naming the backend and the step.
 */
import { Effect } from 'effect'
import { Scenario, type ScenarioStep } from 'foldkit-remote/testing'
import { domainRunner, memoryRunner, sqliteRunner } from './scenario/index.js'
import { scenarios } from './scenario/scenarios.js'

const runners = [sqliteRunner, memoryRunner, domainRunner]

/** The keys a step's outcome shows: what was decided, and what the write changed. */
const shown = ['_tag', 'refusal', 'reserved', 'revision', 'operation']

/** Each backend's steps on one line, in the order it owns them. */
const lines = (steps: ReadonlyArray<ScenarioStep>) =>
  runners.map(({ name }) => {
    const said = steps
      .filter(({ backend }) => backend === name)
      .map(({ step, actual }) => `${step} ${JSON.stringify(actual, shown)}`)
    return `  ${name}: ${said.join('; ')}`
  })

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const out: Array<string> = []
  for (const scenario of scenarios) {
    const report = await Effect.runPromise(Scenario.run(scenario, runners))
    out.push(`${scenario.name}`, ...lines(report.steps))
    out.push(
      report.mismatches.length === 0
        ? '  the three agree with the scenario'
        : `  disagrees: ${report.mismatches.map(Scenario.describeMismatch).join(' | ')}`,
    )
  }
  return out
}

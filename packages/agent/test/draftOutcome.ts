/**
 * Outcome checks shared by the headless save run and the browser save run.
 */
import { Option } from 'effect'
import { expect } from 'vitest'
import { Agent } from '../src/index.js'
import { operationOf, type Model, type SaveResult } from './draftApp.js'

export const stagesOf = (
  events: ReadonlyArray<{ readonly requestId: string; readonly tag: string }>,
  requestId: string,
): string[] => events.filter(event => event.requestId === requestId).map(event => event.tag)

export const expectStages = (
  events: ReadonlyArray<{ readonly requestId: string; readonly tag: string }>,
  requestId: string,
  stages: readonly string[],
): void => {
  expect(stagesOf(events, requestId)).toEqual(stages)
}

export const expectCorrelated = (
  result: Agent.DispatchResult,
  requestId: string,
  status: 'completed' | 'failed',
): void => {
  const completion = result.completion
  expect(completion?.status).toBe(status)
  const message = completion?.message
  expect(message !== undefined && 'requestId' in message ? message.requestId : undefined).toBe(
    requestId,
  )
}

export const expectNoToken = (value: unknown): void => {
  expect(JSON.stringify(value)).not.toContain('sekret-token')
}

/** Two Search mounts are ambiguous, and the match for one row shows only its fields. */
export const expectSearchIdentity = (
  byLabel: Agent.UiDiscovery,
  oneRow: Agent.UiDiscovery,
): void => {
  expect(byLabel._tag).toBe('Ambiguous')
  if (byLabel._tag !== 'Ambiguous') return
  expect(byLabel.matches.map(match => Option.getOrThrow(match.occurrence))).toEqual([
    'first',
    'second',
  ])
  expectNoToken(byLabel)
  expect(JSON.stringify(byLabel)).not.toContain('draft-secret')
  expect(oneRow._tag).toBe('Match')
  if (oneRow._tag !== 'Match') return
  expect(Option.getOrThrow(oneRow.occurrence)).toBe('first')
  expect(oneRow.projection).toEqual({ query: 'q-value' })
  expectNoToken(oneRow)
  expect(JSON.stringify(oneRow.projection)).not.toContain('draft-secret')
}

export interface OperationDriver {
  readonly events: ReadonlyArray<{ readonly requestId: string; readonly tag: string }>
  readonly model: () => Model
  readonly refuse: () => void
  readonly allow: () => void
  readonly untilPending: (requestId: string) => Promise<void>
  readonly settle: (requestId: string, result: SaveResult) => void
  readonly attempt: (
    id: string,
    input: unknown,
  ) => Promise<{ readonly _tag: string; readonly failure?: { readonly _tag: string } }>
  readonly start: (id: string, input: unknown) => Promise<Agent.DispatchResult>
}

/** Refusal, a correlated failure, and two overlapping saves. */
export const exerciseOperations = async (driver: OperationDriver): Promise<void> => {
  driver.refuse()
  const refused = await driver.attempt('draft.save', { requestId: 'refused', title: 'no' })
  expect(refused._tag).toBe('Failure')
  expect(refused.failure?._tag).toBe('AgentAuthorizationError')
  expectStages(driver.events, 'refused', [])
  expectNoToken(refused)
  expect(operationOf(driver.model(), 'refused')).toBeUndefined()

  driver.allow()
  const failing = driver.start('draft.save', { requestId: 'bad', title: 'bad-title' })
  await driver.untilPending('bad')
  expectStages(driver.events, 'bad', ['Requested', 'Accepted', 'Pending'])
  driver.settle('bad', { ok: false, reason: 'nope' })
  const failed = await failing
  expect(failed.message._tag).toBe('RequestedSave')
  expectCorrelated(failed, 'bad', 'failed')
  expectStages(driver.events, 'bad', ['Requested', 'Accepted', 'Pending', 'Failed'])
  expect(operationOf(driver.model(), 'bad')?._tag).toBe('Failed')

  const left = driver.start('draft.save', { requestId: 'left', title: 'left-title' })
  const right = driver.start('draft.save', { requestId: 'right', title: 'right-title' })
  await driver.untilPending('left')
  await driver.untilPending('right')
  driver.settle('right', { ok: false, reason: 'right-no' })
  driver.settle('left', { ok: true, title: 'left-title' })
  const [leftResult, rightResult] = await Promise.all([left, right])
  expect(leftResult.message._tag).toBe('RequestedSave')
  expect(rightResult.message._tag).toBe('RequestedSave')
  expectCorrelated(leftResult, 'left', 'completed')
  expectCorrelated(rightResult, 'right', 'failed')
  expect(operationOf(driver.model(), 'left')?._tag).toBe('Succeeded')
  expect(operationOf(driver.model(), 'right')?._tag).toBe('Failed')
}

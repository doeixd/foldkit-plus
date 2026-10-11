/**
 * `ReadFilter`: the members a server filters an Entity's rows by under a rule
 * the client does not run, gathered across every annotation.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, ReadFilter } from '../src/index.js'

const Task = Entity.define(
  'Task',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, teamId: Schema.String }),
)

describe('ReadFilter', () => {
  it('reads nothing from an Entity no rule filters', () => {
    expect(ReadFilter.members(Task.metadata)).toEqual([])
  })

  it('gathers every annotation’s members, each once', () => {
    const ruled = Task.pipe(
      Entity.annotate(ReadFilter.of(['ownerId'])),
      Entity.annotate(ReadFilter.of(['teamId', 'ownerId'])),
    )
    expect(ReadFilter.members(ruled.metadata)).toEqual(['ownerId', 'teamId'])
  })
})

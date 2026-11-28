import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Num, Verdict } from 'metakit'
import * as Conformance from 'metakit/conformance'
import * as Sql from 'metakit/sql'
import {
  RolloutLanguage,
  flagActiveFor,
  highestRulePriority,
  listMaxPriority,
  maxPriority,
  rolloutImpl,
  rolloutPgSql,
  rolloutSqliteSql,
} from '../src/flags/index.js'

describe('Example 5: Feature-Flag & Rollout Custom Language', () => {
  it('passes algebraic Conformance.checkOperation for maxPriority claims', () => {
    const report = Conformance.checkOperation(maxPriority, rolloutImpl)
    expect(report.ok).toBe(true)
    expect(report.failures).toEqual([])
  })

  it('evaluates, partially evaluates, and judges custom ops with { foreign }', () => {
    const flag = {
      key: 'new-checkout',
      salt: 'v1',
      percent: 50,
      minAppVersion: '2.1.0',
      env: 'prod' as const,
    }

    // Wrong app version fails immediately
    expect(
      Expr.holds(
        flagActiveFor,
        { row: flag, ctx: { userId: 'u1', appVersion: '1.9.5', env: 'prod' } },
        { foreign: rolloutImpl },
      ),
    ).toBe(false)

    // Partial evaluation with known env mismatch decides False without knowing userId
    // because `bucket` and `semverGte` declare `claims: { total: true }` over `Text.schema`.
    expect(
      Verdict.isFalse(
        Expr.judge(
          flagActiveFor,
          { row: { env: 'staging' }, ctx: { env: 'prod', appVersion: '2.5.0' } },
          { foreign: rolloutImpl },
        ),
      ),
    ).toBe(true)

    const residual = Expr.residualize(
      flagActiveFor,
      { row: flag, ctx: { env: 'prod', appVersion: '2.5.0' } },
      { foreign: rolloutImpl },
    )
    // Only the bucket check remains in the residual
    expect(Expr.show(residual)).toContain('rollout.bucket')
    expect(Expr.show(residual)).not.toContain('rollout.semverGte')

    // Arr.reduce with custom commutative monoid maxPriority
    expect(
      Expr.eval(
        listMaxPriority,
        {
          rules: [
            { id: '1', flagKey: 'f', enabled: true, priority: 20 },
            { id: '2', flagKey: 'f', enabled: false, priority: 95 },
            { id: '3', flagKey: 'f', enabled: true, priority: 60 },
          ],
        },
        { foreign: rolloutImpl },
      ),
    ).toBe(60)
    expect(Expr.eval(listMaxPriority, { rules: [] }, { foreign: rolloutImpl })).toBe(0)
  })

  it('lowers custom scalar ops and Arr.reduce aggregates to both Postgres and SQLite SQL', () => {
    const pg = Result.getOrThrow(
      Sql.toWhere(flagActiveFor, {
        dialect: 'postgres',
        foreign: rolloutPgSql,
        env: { ctx: { userId: 'u42', appVersion: '2.2.0', env: 'prod' } },
      }),
    )
    expect(pg.text).toContain('hashtext')

    const sqlite = Result.getOrThrow(
      Sql.toWhere(flagActiveFor, {
        dialect: 'sqlite',
        foreign: rolloutSqliteSql,
        env: { ctx: { userId: 'u42', appVersion: '2.2.0', env: 'prod' } },
      }),
    )
    expect(sqlite.text).toContain('unicode')

    const aggPg = Result.getOrThrow(
      Sql.toWhere(Num.gte(highestRulePriority, 50), {
        dialect: 'postgres',
        table: 'flags',
        relations: { 'FlagRule.flagKey': { table: 'flag_rules', foreignKey: 'flagKey' } },
        foreign: rolloutPgSql,
      }),
    )
    expect(aggPg.text).toContain('COALESCE(MAX(')

    // Language metadata for agent/server handshakes
    const desc = RolloutLanguage.describe()
    expect(desc.map(d => d.id)).toEqual([
      'rollout.bucket',
      'rollout.semverGte',
      'rollout.maxPriority',
    ])
  })
})

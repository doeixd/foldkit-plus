import { PGlite } from '@electric-sql/pglite'
import { Option, Result } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Abstract, Expr, Node, Ord, Path, Transition, Verdict } from 'metakit'
import * as Conformance from 'metakit/conformance'
import * as Operation from 'metakit/operation'
import * as Sql from 'metakit/sql'
import * as Temporal from 'metakit/temporal'
import {
  effectivePermissions,
  Flags,
  flagsAndNot,
  flagsClamp,
  flagsOr,
  flagsXor,
  Grant,
  pageImplementations,
  PermissionsMachine,
  PermissionState,
  relatedEffectivePermissions,
  Revoke,
  serverLowerings,
  Toggle,
} from '../src/permissions.js'

describe('examples/metakit permissions (checked custom algebras)', () => {
  it('checks all 4 operations in memory and discharges every reachable obligation', () => {
    const reg = Temporal.makeRegistry()
    const scope = { owner: 'permissions', where: 'examples/metakit/test/permissions.test.ts:1' }
    const owed = Conformance.lawObligations(PermissionsMachine, [pageImplementations])
    reg.declare(scope, owed)
    expect(reg.report().ok).toBe(false)

    for (const op of [flagsOr, flagsXor, flagsAndNot, flagsClamp]) {
      const report = Conformance.checkOperation(op, pageImplementations)
      expect(report.failures).toEqual([])
      expect(report.ok).toBe(true)
      for (const discharge of report.discharges) reg.record(scope, discharge)
    }

    expect(reg.report().ok).toBe(true)
    expect(reg.report().open).toEqual([])
  })

  it('proves SQLite and PGlite parity against memory for flagsOr, flagsXor, flagsAndNot, and flagsClamp', async () => {
    const sqlite = new DatabaseSync(':memory:')
    const pg = new PGlite()
    try {
      const sqliteRunner: Conformance.ParityRunner = {
        dialect: 'sqlite',
        evaluate: (op, calls) =>
          calls.map(args => {
            if (args.some(v => v === null)) return null
            const rendered = serverLowerings.renderCall(
              'sqlite',
              op,
              args.map((_, i) => `?${i + 1}`),
              parts => parts.join(''),
            )
            if (Result.isFailure(rendered)) throw new Error(rendered.failure.reason)
            const row = sqlite
              .prepare(`SELECT ${rendered.success} AS ans`)
              .get(...(args as Array<number>)) as { readonly ans: number }
            return row.ans
          }),
      }

      for (const op of [flagsOr, flagsXor, flagsAndNot, flagsClamp]) {
        const report = Conformance.checkOperation(op, pageImplementations, {
          sql: [sqliteRunner],
        })
        expect(report.failures).toEqual([])
        expect(report.ok).toBe(true)
        expect(
          report.discharges.some(
            d => d.obligation === `law:${Node.foreignName(op.descriptor)}/parity/sqlite`,
          ),
        ).toBe(true)
      }

      // Run Relation.reduce (bit_or) against real PGlite.
      await pg.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY);
        CREATE TABLE roles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, active BOOLEAN NOT NULL, bits INTEGER);
        INSERT INTO users (id) VALUES ('u1'), ('u2');
        INSERT INTO roles (id, user_id, active, bits) VALUES
          ('r1', 'u1', true, 1),
          ('r2', 'u1', true, 4),
          ('r3', 'u1', false, 8),
          ('r4', 'u1', true, NULL);
      `)

      const pgWhere = Sql.toWhere(Ord.gte(relatedEffectivePermissions, 5), {
        dialect: 'postgres',
        table: 'users',
        relations: { 'Role.userId': { table: 'roles', foreignKey: 'user_id' } },
        foreign: serverLowerings,
      })
      expect(Result.isSuccess(pgWhere)).toBe(true)
      if (Result.isSuccess(pgWhere)) {
        const found = await pg.query<{ readonly id: string }>(
          `SELECT id FROM users WHERE ${pgWhere.success.text}`,
          [...pgWhere.success.params],
        )
        expect(found.rows.map(r => r.id)).toEqual(['u1'])
      }

      // SQLite has no bit_or aggregate lowering: fails with an actionable error.
      const sqliteWhere = Sql.toWhere(Ord.gte(relatedEffectivePermissions, 5), {
        dialect: 'sqlite',
        table: 'users',
        relations: { 'Role.userId': { table: 'roles', foreignKey: 'user_id' } },
        foreign: serverLowerings,
      })
      expect(Result.isFailure(sqliteWhere)).toBe(true)
    } finally {
      sqlite.close()
      await pg.close()
    }
  }, 30_000)

  it('acts on claims across partial eval, abstract checker, Arr.reduce, Transition.combine, and describe/compare', () => {
    const $ = Path.forSchema(PermissionState)

    // Partial eval & judge: identity and absorbing rewrites.
    expect(
      Node.$is('Path')(
        Expr.residualize(flagsOr($.granted, 0), {}, { foreign: pageImplementations }).node,
      ),
    ).toBe(true)
    expect(
      Node.$is('Lit')(
        Expr.residualize(flagsOr($.granted, 0x7fff_ffff), {}, { foreign: pageImplementations })
          .node,
      ),
    ).toBe(true)

    // Abstract checker: monotone clamp is Unknown without implementations, True with them.
    const clamped = Ord.lte(flagsClamp($.granted, 0, 10), 10)
    expect(Verdict.isUnknown(Abstract.checkInvariant(PermissionState, clamped))).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(PermissionState, clamped, { foreign: pageImplementations }),
      ),
    ).toBe(true)

    // Transition.combine commutes / idempotent verdicts.
    expect(Verdict.isTrue(Transition.commutes(Grant, Grant))).toBe(true)
    expect(Verdict.isTrue(Transition.idempotent(Grant))).toBe(true)
    expect(Verdict.isTrue(Transition.commutes(Toggle, Toggle))).toBe(true)
    expect(Verdict.isUnknown(Transition.idempotent(Toggle))).toBe(true)
    expect(Verdict.isUnknown(Transition.commutes(Revoke, Revoke))).toBe(true)

    // Arr.reduce in memory matches Postgres bit_or.
    expect(
      Expr.eval(
        effectivePermissions,
        {
          id: 'u1',
          roles: [
            { id: 'r1', userId: 'u1', active: true, bits: 1 },
            { id: 'r2', userId: 'u1', active: true, bits: 4 },
            { id: 'r3', userId: 'u1', active: false, bits: 8 },
            { id: 'r4', userId: 'u1', active: true, bits: null },
          ],
        },
        { foreign: pageImplementations },
      ),
    ).toBe(5)

    // describe / compare detects claim drift between page and server.
    const drifted = Operation.define({
      id: 'flags.or',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { commutative: true, associative: true },
    })
    expect(
      Option.isSome(Operation.compare(Operation.describe(flagsOr), Operation.describe(drifted))),
    ).toBe(true)
  })
})

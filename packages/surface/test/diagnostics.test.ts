import { Effect, Logger } from 'effect'
import { describe, expect, it } from 'vitest'
import { Diagnostics, type Diagnostic } from '../src/index.js'

const warning: Diagnostic = {
  _tag: 'Probe',
  source: 'foldkit-test',
  level: 'warning',
  message: 'a probe was met',
}
const error: Diagnostic = { ...warning, level: 'error', message: 'a probe broke' }

/** Runs `effect` with a logger that keeps each line's level and text. */
const logged = (effect: Effect.Effect<void>) => {
  const lines: Array<{ readonly level: string; readonly text: string }> = []
  const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
    lines.push({ level: logLevel, text: [message].flat().map(String).join(' ') })
  })
  Effect.runSync(effect.pipe(Effect.provide(Logger.layer([logger]))))
  return lines
}

describe('Diagnostics', () => {
  it('logs by default, at the level the diagnostic gives, naming its package', () => {
    expect(logged(Effect.andThen(Diagnostics.report(warning), Diagnostics.report(error)))).toEqual([
      { level: 'Warn', text: '[foldkit-test] a probe was met' },
      { level: 'Error', text: '[foldkit-test] a probe broke' },
    ])
  })

  it('reports to the reporter in the context instead', () => {
    const collected = Diagnostics.collect()
    const lines = logged(
      Diagnostics.report(warning).pipe(
        Effect.provideService(Diagnostics.Reporter, collected.report),
      ),
    )
    expect(collected.reported).toEqual([warning])
    expect(lines).toEqual([])
  })

  it('logs a reporter that breaks, with what it was given, and does not fail', () => {
    const lines = logged(
      Diagnostics.report(warning).pipe(
        Effect.provideService(Diagnostics.Reporter, () => Effect.die(new Error('sink down'))),
      ),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]!.level).toBe('Error')
    expect(lines[0]!.text).toContain('[foldkit-test] a probe was met')
    expect(lines[0]!.text).toContain('sink down')
  })
})

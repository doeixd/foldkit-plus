import { Effect, Logger } from 'effect'
import { describe, expect, it, vi } from 'vitest'
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

  describe("through Effect's default logger", () => {
    /** Runs `effect` with no logger of its own, and returns what reached each console method. */
    const consoled = (effect: Effect.Effect<void>) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        Effect.runSync(effect)
        const text = (spy: typeof error) => spy.mock.calls.map(call => call.map(String).join(' '))
        return { error: text(error), log: text(log) }
      } finally {
        error.mockRestore()
        log.mockRestore()
      }
    }

    it('writes an error with console.error and a warning with console.log', () => {
      const { error: errors, log: logs } = consoled(
        Effect.andThen(Diagnostics.report(warning), Diagnostics.report(error)),
      )
      expect(errors).toEqual([expect.stringMatching(/ERROR.*\[foldkit-test\] a probe broke$/)])
      expect(logs).toEqual([expect.stringMatching(/WARN.*\[foldkit-test\] a probe was met$/)])
    })

    it('writes a reporter that broke with console.error', () => {
      const { error: errors, log: logs } = consoled(
        Diagnostics.report(warning).pipe(
          Effect.provideService(Diagnostics.Reporter, () => Effect.die(new Error('sink down'))),
        ),
      )
      expect(errors).toEqual([expect.stringContaining('sink down')])
      expect(logs).toEqual([])
    })
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

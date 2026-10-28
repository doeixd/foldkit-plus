/**
 * A page's script for `playwright.test.ts`: it reports a warning and an error
 * through the default reporter when Report is pressed.
 */
import { Effect } from 'effect'
import { Diagnostics } from 'foldkit-surface'

const report = (level: 'warning' | 'error', message: string) =>
  Diagnostics.report({ _tag: 'Probe', source: 'foldkit-test', level, message })

document.getElementById('report')!.addEventListener('click', () => {
  Effect.runFork(
    Effect.andThen(report('warning', 'a probe was met'), report('error', 'a probe broke')),
  )
})

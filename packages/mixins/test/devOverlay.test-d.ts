/**
 * Compile-time contract of the Mount-side diagnostics route and the
 * development overlay. Type-checked, not executed.
 */
import { Effect, type Layer } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'
import { DevOverlay } from '../src/index.js'

declare const h: HtmlBuilder<{ readonly _tag: 'Clicked' }>
declare const diagnostic: Diagnostic

const overlay = DevOverlay.make()
// The overlay's reporter is a reporter, and its layer needs nothing.
const resources: Layer.Layer<never> = Diagnostics.layer(overlay.report)
// It sends no Message, so it goes on an element of any application.
h.div([h.OnMount(overlay.mount)], [])
DevOverlay.make({ next: Diagnostics.quiet })

const quiet: ReportDiagnostic = Diagnostics.quiet
Effect.runFork(Diagnostics.dispatch(document.body, diagnostic))

// @ts-expect-error A reporter returns an Effect.
Diagnostics.layer((_: Diagnostic) => undefined)
// @ts-expect-error A Mount reports from its element, not a selector.
Diagnostics.dispatch('#app', diagnostic)
// @ts-expect-error A diagnostic names its level.
Diagnostics.dispatch(document.body, { _tag: 'Probe', source: 'x', message: 'm' })
// @ts-expect-error `next` is a reporter.
DevOverlay.make({ next: (_: Diagnostic) => 'logged' })

export { quiet, resources }

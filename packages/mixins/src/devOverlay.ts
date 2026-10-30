/**
 * A panel of what the application's diagnostics reporter heard, for
 * development: `overlay.report` keeps each diagnostic, and `overlay.mount`
 * draws them on the page. Foldkit's devtools take no panel from another
 * package, so it is a Mount the application draws behind its own development
 * flag. It sends no Message, so it is never drawn unless asked for.
 */
import { Effect, Stream } from 'effect'
import type { MountAction } from 'foldkit/mount'
import { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'

export interface DevOverlay {
  /** Keeps `diagnostic` for the panel (the newest 50), then reports it to `next`. */
  readonly report: ReportDiagnostic
  /** Draws the panel into its element's shadow root while mounted; nothing while there is nothing to show. */
  readonly mount: MountAction<never>
}

/** Kept apart from the application's sheet by the shadow root, and readable on whatever theme the page installs. */
const css = `
  :host { all: initial; }
  section {
    position: fixed; inset: auto 1rem 1rem auto; z-index: 2147483647;
    max-inline-size: min(40rem, calc(100vw - 2rem)); max-block-size: 60vh; overflow: auto;
    color-scheme: light dark; background: Canvas; color: CanvasText;
    border: 1px solid; border-radius: 6px; padding: 0.5rem 0.75rem;
    font: 12px/1.4 ui-monospace, monospace;
  }
  summary { cursor: pointer; font-weight: bold; }
  ol { margin: 0.5rem 0; padding-inline-start: 1.25rem; }
  li + li { margin-block-start: 0.5rem; }
  pre { margin: 0.25rem 0 0; white-space: pre-wrap; }
`

/** One diagnostic: who reported what, at which level, and its message. */
const entry = (diagnostic: Diagnostic): HTMLLIElement => {
  const item = document.createElement('li')
  const heading = document.createElement('strong')
  heading.textContent = `${diagnostic.level} ${diagnostic._tag} [${diagnostic.source}]`
  const message = document.createElement('pre')
  message.textContent = diagnostic.message
  item.append(heading, message)
  return item
}

/** Builds the panel in `root` once, and returns what redraws its list. */
const panel = (root: ShadowRoot, clear: () => void) => {
  const style = document.createElement('style')
  style.textContent = css
  const section = document.createElement('section')
  section.setAttribute('aria-label', 'Diagnostics')
  const details = document.createElement('details')
  details.open = true
  const summary = document.createElement('summary')
  const list = document.createElement('ol')
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Clear'
  button.addEventListener('click', clear)
  details.append(summary, list, button)
  section.append(details)
  root.replaceChildren(style, section)
  return (shown: ReadonlyArray<Diagnostic>) => {
    section.hidden = shown.length === 0
    summary.textContent = `${shown.length} ${shown.length === 1 ? 'diagnostic' : 'diagnostics'}`
    list.replaceChildren(...shown.map(entry))
  }
}

const kept = 50

/**
 * An overlay with its own list: `Diagnostics.layer(overlay.report)` in the
 * runtime's resources, and `h.div([h.OnMount(overlay.mount)], [])` in the
 * view, both in development only. `next` is where each diagnostic goes after,
 * `Diagnostics.log` by default.
 */
export const make = (options: { readonly next?: ReportDiagnostic } = {}): DevOverlay => {
  const next = options.next ?? Diagnostics.log
  let shown: ReadonlyArray<Diagnostic> = []
  const listeners = new Set<() => void>()
  const show = (diagnostics: ReadonlyArray<Diagnostic>) => {
    shown = diagnostics
    for (const listener of listeners) listener()
  }
  return {
    report: diagnostic =>
      Effect.andThen(
        Effect.sync(() => show([...shown, diagnostic].slice(-kept))),
        next(diagnostic),
      ),
    mount: {
      name: 'DevOverlay',
      f: element =>
        Stream.callback<never>(() =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
              const redraw = panel(root, () => show([]))
              const listener = () => redraw(shown)
              listeners.add(listener)
              listener()
              return { root, listener }
            }),
            ({ root, listener }) =>
              Effect.sync(() => {
                listeners.delete(listener)
                root.replaceChildren()
              }),
          ),
        ),
    },
  }
}

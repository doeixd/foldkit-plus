/**
 * Rule 6 of the resumable design, as a harness: a resumed page reaches the
 * Model the eager page reaches for the same events. One sequence of DOM actions
 * runs twice in one document, first on the application embedded and booted
 * from the Model the browser resumes, then on the served page hydrated to start
 * on its first interaction, and the harness returns both final Models.
 *
 * The eager run goes first because an embedded program can be disposed and a
 * hydrated one cannot. Both record the Model by wrapping `update`, which leaves
 * the application untouched. The first action of a sequence is the one that
 * boots the resumed page, so the boot is inside every run.
 */
import { Effect, Result } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import {
  FOLDKIT_APP_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  SSR,
  type ResumableConfig,
  type ResumePlan,
} from 'foldkit-ssr'

export type Action =
  | { readonly kind: 'click'; readonly id: string }
  /** An `input` event per character, all in one task, as a paste or an input method might send them. */
  | { readonly kind: 'type'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'key'
      readonly id: string
      readonly key: string
      readonly modifiers?: Partial<KeyboardModifiers>
    }
  | { readonly kind: 'submit'; readonly id: string }
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'blur'; readonly id: string }
  | { readonly kind: 'pointerdown'; readonly id: string }

export const Action = {
  click: (id: string): Action => ({ kind: 'click', id }),
  type: (id: string, text: string): Action => ({ kind: 'type', id, text }),
  key: (id: string, key: string, modifiers: Partial<KeyboardModifiers> = {}): Action => ({
    kind: 'key',
    id,
    key,
    modifiers,
  }),
  submit: (id: string): Action => ({ kind: 'submit', id }),
  focus: (id: string): Action => ({ kind: 'focus', id }),
  blur: (id: string): Action => ({ kind: 'blur', id }),
  pointerdown: (id: string): Action => ({ kind: 'pointerdown', id }),
}

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`equivalence: the page has no #${id}`)
  return element
}

const perform = (action: Action): void => {
  const element = byId(action.id)
  switch (action.kind) {
    case 'click':
      element.click()
      return
    case 'type': {
      if (!(element instanceof HTMLInputElement)) throw new Error(`#${action.id} is no input`)
      for (let end = 1; end <= action.text.length; end++) {
        element.value = action.text.slice(0, end)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return
    }
    case 'key':
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: action.key, bubbles: true, ...action.modifiers }),
      )
      return
    case 'submit':
      element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      return
    case 'focus':
      element.focus()
      return
    case 'blur':
      element.blur()
      return
    case 'pointerdown':
      element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      return
  }
}

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * How the actions arrive. `paced` waits between them, as a person would, so
 * each reaches a page that has settled. `burst` dispatches them in one task,
 * so every action after the first lands while the resumed page is booting.
 */
export type Pace = 'paced' | 'burst'

const play = async (actions: ReadonlyArray<Action>, pace: Pace): Promise<void> => {
  for (const action of actions) {
    perform(action)
    if (pace === 'paced') await settle()
  }
  // Long enough for a replay, a lazy bundle's load and every Command to land.
  await settle(150)
}

type AnyConfig = ResumableConfig<any> & {
  readonly subscriptions?: unknown
  readonly lazy?: ReadonlyArray<unknown>
}

/** A config whose `update` also reports each Model it returns. */
const recording = <Config extends AnyConfig>(config: Config, seen: (model: unknown) => void) => ({
  ...config,
  update: (model: unknown, message: unknown) => {
    const next = config.update(model, message)
    seen(next.model)
    return next
  },
})

export interface Run {
  /** The application, the served page's and the eager run's. */
  readonly config: AnyConfig
  readonly plan: ResumePlan<any, any>
  /**
   * The application the resumed run hydrates, when it must be another
   * instance: a lazy bundle loads once, so the eager run's is loaded and the
   * browser's must not be. Defaults to `config`.
   */
  readonly browser?: AnyConfig | undefined
  readonly template: string
  readonly actions: ReadonlyArray<Action>
  readonly pace?: Pace | undefined
}

/** Runs the actions on the eager page, then on the resumed page, and returns both final Models. */
export const equivalence = async (
  run: Run,
): Promise<{ readonly eager: unknown; readonly resumed: unknown }> => {
  const pace = run.pace ?? 'paced'
  const served = SSR.page(
    run.template,
    await Effect.runPromise(SSR.render(run.config, run.plan, { buildId: 'b' })),
  )
  const load = () => {
    const parsed = new DOMParser().parseFromString(served, 'text/html')
    document.documentElement.innerHTML = parsed.documentElement.innerHTML
  }

  // The Model the browser resumes, read from the page as `SSR.hydrate` reads it.
  load()
  const start = SSR.resume(run.plan, document)
  if (Result.isFailure(start)) throw new Error(`equivalence: ${start.failure.message}`)
  const commands = (run.plan.boot?.(start.success) as ReadonlyArray<unknown> | undefined) ?? []

  // The eager page: booted from that Model before the first action.
  document.body.innerHTML = '<div id="eager-root"></div>'
  const container = byId('eager-root')
  let eager: unknown = start.success
  const { lazy: _lazy, ...application } = recording(run.config, model => (eager = model))
  const handle = Runtime.embed(
    Runtime.makeApplication({
      ...application,
      init: () => ({ model: start.success, commands }),
      container,
    } as never),
  )
  await settle()
  await play(run.actions, pace)
  handle.dispose()
  container.remove()

  // The resumed page: the served markup, hydrated to boot on its first event.
  load()
  let resumed: unknown = start.success
  SSR.hydrate(
    recording(run.browser ?? run.config, model => (resumed = model)),
    run.plan,
    { buildId: 'b' },
  )
  await settle()
  await play(run.actions, pace)
  return { eager, resumed }
}

/**
 * The Model a page resumes from after posting `fields` to `SSR.handle`, as a
 * browser with scripts off posts a form: the answer's envelope, decoded as the
 * browser would decode it.
 */
export const posted = async (
  config: AnyConfig,
  plan: ResumePlan<any, any>,
  fields: Readonly<Record<string, string>>,
): Promise<unknown> => {
  const request = new Request('https://example.test/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })
  const { envelope } = await Effect.runPromise(SSR.handle(request, config, plan, { buildId: 'b' }))
  const page = new DOMParser().parseFromString('<body></body>', 'text/html')
  const root = page.createElement('div')
  root.setAttribute(FOLDKIT_APP_ATTRIBUTE, 'app')
  root.setAttribute(RESUME_ATTRIBUTE, envelope)
  page.body.append(root)
  const model = SSR.resume(plan, page)
  if (Result.isFailure(model)) throw new Error(`posted: ${model.failure.message}`)
  return model.success
}

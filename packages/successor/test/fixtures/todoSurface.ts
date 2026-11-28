import { Effect, Option, Result, Schema } from 'effect'
import { Expr, Ord, Path } from '@doeixd/metakit'
import { renderer } from 'foldkit-successor/dom'
import {
  action,
  checkbox,
  define,
  keyedList,
  text,
  textInput,
  uncovered,
  type Paint,
} from 'foldkit-successor/surface'
import { Model, model, remove, rows, target } from './todos.js'
import type { CheckedPlan } from './todoProof.js'

const View = Schema.Struct({ ...Model.fields, draft: Schema.String })
type View = typeof View.Type
const view = Path.forSchema(View)
const decodeKey = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.String))
const listKeys = (state: Model): ReadonlyArray<string> =>
  Object.keys(state.rows).map(segment => decodeKey(segment))
const rowSlot = (key: string): string => `todo:${key}:done`
const removeSlot = (key: string): string => `todo:${key}:remove`

export const todoSurface = (keys: ReadonlyArray<string>) =>
  define<View>()([
    text<View>('remaining', view.remaining),
    action<View>('clear', Ord.lt(view.remaining, keys.length)),
    textInput<View>('draft', view.draft),
    keyedList<View>('todos', Expr.lit(keys)),
    ...keys.flatMap(key => [
      checkbox<View>(rowSlot(key), Path.make(rows.path(key, 'done'))),
      action<View>(removeSlot(key), Expr.lit(true)),
    ]),
  ])

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

export const html = (state: View): string => {
  const keys = listKeys(state)
  const items = keys
    .map(key => {
      const { model } = Option.getOrThrow(rows.get(state, key))
      return `<li data-key="${escape(key)}"><label><input type="checkbox" data-slot="${escape(rowSlot(key))}"${model.done ? ' checked' : ''}>${escape(model.label)}</label><button type="button" data-slot="${escape(removeSlot(key))}" aria-label="Remove ${escape(model.label)}">Remove</button></li>`
    })
    .join('')
  return `<section aria-label="Todos"><label>New todo <input type="text" data-slot="draft" value="${escape(state.draft)}"></label><ul data-slot="todos">${items}</ul><output data-slot="remaining">${state.remaining}</output><button type="button" data-slot="clear"${state.remaining < keys.length ? '' : ' disabled'}>Clear completed</button></section>`
}

const Envelope = Schema.Struct({
  version: Schema.Literal('todos/1'),
  state: View,
})

export const envelope = (state: View): string =>
  Schema.encodeSync(Schema.fromJsonString(Envelope))({ version: 'todos/1', state })

export const reachability = (state: View) => {
  const keys = listKeys(state)
  const reads = Option.some([model.owner.segments, model.remaining.segments, model.rows.segments])
  return {
    ClearCompleted: reads,
    ...Object.fromEntries(
      keys.flatMap(key => [
        [`ToggleTodo(${key})`, reads],
        [`RemoveTodo(${key})`, reads],
      ]),
    ),
  }
}

export const install = (
  root: HTMLElement,
  options: {
    readonly start: View | string
    readonly machine: CheckedPlan
    readonly adjust?: (next: Model) => Model
  },
) => {
  const resume = typeof options.start === 'string'
  let state =
    typeof options.start === 'string'
      ? Schema.decodeUnknownSync(Schema.fromJsonString(Envelope))(options.start).state
      : options.start
  const keys = listKeys(state)
  let plan = todoSurface(keys)
  const missing = uncovered(
    plan.graph,
    [model.owner.segments, model.rows.segments, model.remaining.segments, view.draft.segments],
    reachability(state),
  )
  if (missing.length > 0) throw new Error(`Incomplete resume state at ${missing.join(', ')}`)

  const mount = (mode: 'fresh' | 'resume') =>
    Effect.runPromise(Effect.provide(plan.mount(state, mode), renderer(root)))
  let mounted = resume ? Option.none<ReturnType<typeof mount>>() : Option.some(mount('fresh'))
  const attached = () => {
    if (Option.isSome(mounted)) return mounted.value
    const surface = mount('resume')
    mounted = Option.some(surface)
    return surface
  }
  const paints: Array<Paint> = []
  const routed: Array<ReturnType<typeof target>> = []
  let queue: Promise<void> = Promise.resolve()
  const toggle = (key: string, control: HTMLInputElement) => {
    const surface = attached()
    queue = queue.then(async () => {
      await surface
      if (!Option.isSome(rows.get(state, key))) return
      routed.push(target(state, key))
      const result = Result.getOrThrow(options.machine.toggle(state, key))
      const next = options.adjust === undefined ? result.state : options.adjust(result.state)
      state = { ...next, draft: state.draft }
      paints.push((await attached()).paint({ state, writes: result.writes }))
      const checked = Option.getOrThrow(rows.get(state, key)).model.done
      if (control.checked !== checked) control.checked = checked
    })
  }
  const controls = new Map<HTMLInputElement, string>()
  const rowElements = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[data-key]')).map(element => [
      element.getAttribute('data-key')!,
      element,
    ]),
  )
  const removeButtons = new Map<HTMLButtonElement, string>()
  const keysBySlot = new Map(keys.map(key => [rowSlot(key), key]))
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-slot]')) {
    const key = keysBySlot.get(input.getAttribute('data-slot')!)
    if (key !== undefined) controls.set(input, key)
  }
  const clearButton = root.querySelector<HTMLButtonElement>('[data-slot="clear"]')!
  const remaining = root.querySelector<HTMLOutputElement>('[data-slot="remaining"]')!
  for (const key of keys) {
    const button = rowElements.get(key)?.querySelector<HTMLButtonElement>('button')
    if (button !== undefined && button !== null) removeButtons.set(button, key)
  }
  const removeKeys = (selected: ReadonlyArray<string>) => {
    for (const key of selected) {
      const element = rowElements.get(key)
      if (element === undefined) continue
      controls.delete(element.querySelector<HTMLInputElement>('input')!)
      removeButtons.delete(element.querySelector<HTMLButtonElement>('button')!)
      rowElements.delete(key)
      element.remove()
      state = { ...remove(state, target(state, key)), draft: state.draft }
    }
    if (selected.length === 0) return
    const next = listKeys(state)
    plan = todoSurface(next)
    remaining.value = String(state.remaining)
    clearButton.disabled = state.remaining === next.length
    mounted = Option.some(mount('resume'))
  }
  const listener = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return
    const key = controls.get(event.target)
    if (key !== undefined) toggle(key, event.target)
  }
  const click = (event: Event) => {
    if (!(event.target instanceof HTMLButtonElement)) return
    const button = event.target
    queue = queue.then(() => {
      if (button === clearButton) {
        removeKeys(
          listKeys(state).filter(key => Option.exists(rows.get(state, key), row => row.model.done)),
        )
        return
      }
      const key = removeButtons.get(button)
      if (key !== undefined) removeKeys([key])
    })
  }
  root.addEventListener('change', listener)
  root.addEventListener('click', click)
  return {
    settled: () => queue,
    read: () => state,
    paints,
    routed,
    close: () => {
      root.removeEventListener('change', listener)
      root.removeEventListener('click', click)
    },
  }
}

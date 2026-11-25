// @vitest-environment jsdom
import { Schema } from 'effect'
import { Bool, Path, Transition } from 'metakit'
import { describe, expect, it, vi } from 'vitest'
import {
  ANCHOR_ATTRIBUTE,
  Binding,
  Binder,
  BINDER_KEY_ATTRIBUTE,
  BINDER_MESSAGE_ATTRIBUTE,
  BINDER_PAYLOAD_ATTRIBUTE,
  BINDER_TOUCHED_ATTRIBUTE,
} from '../src/binder.js'
import { claimBinder } from '../src/handoff.js'

const Item = Schema.Struct({ id: Schema.String, label: Schema.String })
const Model = Schema.Struct({
  count: Schema.Int,
  open: Schema.Boolean,
  badge: Schema.String,
  secret: Schema.String,
  items: Schema.Array(Item),
})
type Model = typeof Model.Type

const Increment = Transition.make({
  state: Model,
  input: Schema.Struct({ by: Schema.Int }),
  when: () => true,
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
})

const ToggleOpen = Transition.make({
  state: Model,
  input: Schema.Struct({}),
  when: () => true,
  apply: ({ state }) => [Transition.set(state.open, Bool.not(state.open))],
})

const SetBadge = Transition.make({
  state: Model,
  input: Schema.Struct({ text: Schema.String }),
  when: () => true,
  apply: ({ state, input }) => [Transition.set(state.badge, input.text)],
})

const MoveFirst = Transition.make({
  state: Model,
  input: Schema.Struct({ id: Schema.String }),
  when: () => true,
  apply: ({ state, input }) => [Transition.move(state.items, input.id, 0)],
})

const WriteUnbound = Transition.make({
  state: Model,
  input: Schema.Struct({ value: Schema.String }),
  when: () => true,
  apply: ({ state, input }) => [Transition.set(state.secret, input.value)],
})

const EmitCommand = Transition.make({
  state: Model,
  input: Schema.Struct({ by: Schema.Int }),
  when: () => true,
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
  emits: ({ input }) => [Transition.emit('SyncCount', { by: input.by })],
})

const P = Path.from(Model)
const bindings = Binding.define<Model>({
  count: Binding.text(P.count),
  badge: Binding.attribute('data-badge', P.badge),
  panel: Binding.shown(P.open),
  list: Binding.order(P.items, 'id'),
})

const makeDom = () => {
  const root = document.createElement('div')
  root.setAttribute('data-foldkit-app', '')
  root.innerHTML = `
    <span ${ANCHOR_ATTRIBUTE}="count">0</span>
    <span ${ANCHOR_ATTRIBUTE}="badge" data-badge="init"></span>
    <div ${ANCHOR_ATTRIBUTE}="panel" hidden>Panel</div>
    <ul ${ANCHOR_ATTRIBUTE}="list">
      <li ${BINDER_KEY_ATTRIBUTE}="a">A</li>
      <li ${BINDER_KEY_ATTRIBUTE}="b">B</li>
    </ul>
    <button id="inc" ${BINDER_MESSAGE_ATTRIBUTE}="Increment" ${BINDER_PAYLOAD_ATTRIBUTE}='{"by":2}'>+2</button>
    <button id="bad" ${BINDER_MESSAGE_ATTRIBUTE}="Increment" ${BINDER_PAYLOAD_ATTRIBUTE}='{"by":"not-an-int"}'>Bad</button>
    <button id="bad-json" ${BINDER_MESSAGE_ATTRIBUTE}="Increment" ${BINDER_PAYLOAD_ATTRIBUTE}='{bad'>BadJson</button>
    <button id="toggle" ${BINDER_MESSAGE_ATTRIBUTE}="ToggleOpen">Toggle</button>
    <button id="xss" ${BINDER_MESSAGE_ATTRIBUTE}="SetBadge" ${BINDER_PAYLOAD_ATTRIBUTE}='{"text":"<img src=x onerror=alert(1)>"}'>XSS</button>
    <button id="move" ${BINDER_MESSAGE_ATTRIBUTE}="MoveFirst" ${BINDER_PAYLOAD_ATTRIBUTE}='{"id":"b"}'>Move B</button>
    <button id="unbound" ${BINDER_MESSAGE_ATTRIBUTE}="WriteUnbound" ${BINDER_PAYLOAD_ATTRIBUTE}='{"value":"hi"}'>Unbound</button>
    <button id="emit" ${BINDER_MESSAGE_ATTRIBUTE}="EmitCommand" ${BINDER_PAYLOAD_ATTRIBUTE}='{"by":1}'>Emit</button>
    <button id="unknown" ${BINDER_MESSAGE_ATTRIBUTE}="UnknownTag">Unknown</button>
  `
  document.body.replaceChildren(root)
  return root
}

const initialModel: Model = {
  count: 0,
  open: false,
  badge: 'init',
  secret: '',
  items: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
}

const makeManifest = () => ({
  bindings,
  transitions: {
    Increment: {
      tag: 'Increment' as const,
      schema: Schema.Struct({ by: Schema.Int }),
      transition: Increment,
    },
    ToggleOpen: {
      tag: 'ToggleOpen' as const,
      schema: Schema.Struct({}),
      transition: ToggleOpen,
    },
    SetBadge: {
      tag: 'SetBadge' as const,
      schema: Schema.Struct({ text: Schema.String }),
      transition: SetBadge,
    },
    MoveFirst: {
      tag: 'MoveFirst' as const,
      schema: Schema.Struct({ id: Schema.String }),
      transition: MoveFirst,
    },
    WriteUnbound: {
      tag: 'WriteUnbound' as const,
      schema: Schema.Struct({ value: Schema.String }),
      transition: WriteUnbound,
    },
    EmitCommand: {
      tag: 'EmitCommand' as const,
      schema: Schema.Struct({ by: Schema.Int }),
      transition: EmitCommand,
    },
  },
})

describe('foldkit-ssr/binder (Phase 6, Bouts 6.5–6.7)', () => {
  it('answers declared presses locally and updates Text, Attribute, Shown, and Order anchors without waking', () => {
    const root = makeDom()
    const wake = vi.fn(() => Promise.resolve())
    const handle = Binder.start({
      manifest: makeManifest(),
      envelope: { model: initialModel, root },
      wake,
    })

    // Text anchor
    root.querySelector<HTMLButtonElement>('#inc')!.click()
    expect(handle.model().count).toBe(2)
    expect(root.querySelector(`[${ANCHOR_ATTRIBUTE}="count"]`)!.textContent).toBe('2')
    expect(wake).not.toHaveBeenCalled()

    // Shown anchor
    root.querySelector<HTMLButtonElement>('#toggle')!.click()
    expect(handle.model().open).toBe(true)
    expect(root.querySelector(`[${ANCHOR_ATTRIBUTE}="panel"]`)!.hasAttribute('hidden')).toBe(false)

    // Attribute anchor (and binder-touched marker)
    root.querySelector<HTMLButtonElement>('#xss')!.click()
    const badgeEl = root.querySelector(`[${ANCHOR_ATTRIBUTE}="badge"]`)!
    expect(badgeEl.getAttribute('data-badge')).toBe('<img src=x onerror=alert(1)>')
    expect(badgeEl.hasAttribute(BINDER_TOUCHED_ATTRIBUTE)).toBe(true)
    expect(badgeEl.innerHTML).toBe('')

    // Order anchor preserves existing DOM nodes
    const itemA = root.querySelector(`[${BINDER_KEY_ATTRIBUTE}="a"]`)!
    const itemB = root.querySelector(`[${BINDER_KEY_ATTRIBUTE}="b"]`)!
    root.querySelector<HTMLButtonElement>('#move')!.click()
    const listChildren = Array.from(root.querySelector(`[${ANCHOR_ATTRIBUTE}="list"]`)!.children)
    expect(listChildren).toEqual([itemB, itemA])
    expect(wake).not.toHaveBeenCalled()

    handle.stop()
  })

  it('drops invalid payloads with the exact diagnostic message and never mutates state or wakes', () => {
    const root = makeDom()
    const wake = vi.fn(() => Promise.resolve())
    const warnings: Array<string> = []
    const handle = Binder.start({
      manifest: makeManifest(),
      envelope: { model: initialModel, root },
      wake,
      onInvalidPayload: msg => warnings.push(msg),
    })

    root.querySelector<HTMLButtonElement>('#bad')!.click()
    root.querySelector<HTMLButtonElement>('#bad-json')!.click()

    expect(handle.model().count).toBe(0)
    expect(wake).not.toHaveBeenCalled()
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatch(
      /^\[foldkit-ssr\/binder\] the element's "Increment" payload did not decode: [\s\S]+; nothing was sent\.$/,
    )
    expect(warnings[1]).toMatch(
      /^\[foldkit-ssr\/binder\] the element's "Increment" payload did not decode: [\s\S]+; nothing was sent\.$/,
    )

    handle.stop()
  })

  it('wakes and queues when a transition emits a Command or writes an unbound path, and hands over once', () => {
    const root = makeDom()
    const wake = vi.fn(() => Promise.resolve())
    const handle = Binder.start({
      manifest: makeManifest(),
      envelope: { model: initialModel, root },
      wake,
    })

    // First: local press updates Model
    root.querySelector<HTMLButtonElement>('#inc')!.click()
    expect(handle.model().count).toBe(2)
    expect(wake).not.toHaveBeenCalled()

    // Second: transition with emits wakes and queues
    root.querySelector<HTMLButtonElement>('#emit')!.click()
    expect(wake).toHaveBeenCalledTimes(1)
    expect(handle.queued()).toEqual([{ _tag: 'EmitCommand', by: 1 }])

    // Third: another press while waking is also queued (never dropped)
    root.querySelector<HTMLButtonElement>('#inc')!.click()
    expect(handle.queued()).toEqual([
      { _tag: 'EmitCommand', by: 1 },
      { _tag: 'Increment', by: 2 },
    ])

    // Hand-over claims binder once, stops listeners, and hands over updated Model + queued Messages
    const handoff = claimBinder()
    expect(handoff).toBeDefined()
    const snapshot = handoff!.take()
    expect(snapshot.mutated).toBe(true)
    expect((snapshot.model as Model).count).toBe(2)
    expect(snapshot.queued).toEqual([
      { _tag: 'EmitCommand', by: 1 },
      { _tag: 'Increment', by: 2 },
    ])
    // Second claim returns undefined
    expect(claimBinder()).toBeUndefined()
  })

  it('wakes when a transition writes an unbound path', () => {
    const root = makeDom()
    const wake = vi.fn(() => Promise.resolve())
    const handle = Binder.start({
      manifest: makeManifest(),
      envelope: { model: initialModel, root },
      wake,
    })

    root.querySelector<HTMLButtonElement>('#unbound')!.click()
    expect(wake).toHaveBeenCalledTimes(1)
    expect(handle.model().secret).toBe('')
    expect(handle.queued()).toEqual([{ _tag: 'WriteUnbound', value: 'hi' }])
    handle.stop()
  })

  it('writes textContent only (never innerHTML) even when Text expression produces HTML markup', () => {
    const TextModel = Schema.Struct({ html: Schema.String })
    const SetHtml = Transition.make({
      state: TextModel,
      input: Schema.Struct({ html: Schema.String }),
      when: () => true,
      apply: ({ state, input }) => [Transition.set(state.html, input.html)],
    })
    const textBindings = Binding.define<typeof TextModel.Type>({
      body: Binding.text(Path.from(TextModel).html),
    })
    const root = document.createElement('div')
    root.innerHTML = `
      <div ${ANCHOR_ATTRIBUTE}="body"></div>
      <button id="go" ${BINDER_MESSAGE_ATTRIBUTE}="SetHtml" ${BINDER_PAYLOAD_ATTRIBUTE}='{"html":"<b>bold</b>"}'>Go</button>
    `
    document.body.replaceChildren(root)
    const handle = Binder.start({
      manifest: {
        bindings: textBindings,
        transitions: {
          SetHtml: {
            tag: 'SetHtml',
            schema: Schema.Struct({ html: Schema.String }),
            transition: SetHtml,
          },
        },
      },
      envelope: { model: { html: '' }, root },
      wake: () => Promise.resolve(),
    })

    root.querySelector<HTMLButtonElement>('#go')!.click()
    const body = root.querySelector(`[${ANCHOR_ATTRIBUTE}="body"]`)!
    expect(body.textContent).toBe('<b>bold</b>')
    expect(body.querySelector('b')).toBeNull()
    handle.stop()
  })

  it('refuses unsafe event-handler attributes in Attribute bindings', () => {
    const root = document.createElement('div')
    root.innerHTML = `<div ${ANCHOR_ATTRIBUTE}="bad"></div>`
    Binder.applyAnchors(root, {
      bad: { _tag: 'Attribute', name: 'onclick', value: 'alert(1)' },
    })
    expect(root.querySelector(`[${ANCHOR_ATTRIBUTE}="bad"]`)!.getAttribute('onclick')).toBeNull()
  })
})

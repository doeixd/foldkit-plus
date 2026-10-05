/**
 * The published demo: two devices side by side, Device A and Device B, each a
 * page of its own in a frame, with its own replica and runtime, both talking
 * to one server that runs in the browser (`host.ts`, in a SharedWorker).
 * Every tab of the sandbox meets the same server.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { registryDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import { Sync } from 'foldkit-sync'
import { startDevice } from '../device.js'
import { connectSandbox } from './connection.js'
import { DeviceStatus } from './protocol.js'

const devices = [
  { id: 'device-a', name: 'Device A' },
  { id: 'device-b', name: 'Device B' },
] as const

/** An element with its style and its children: the outer page is plain DOM, outside both runtimes. */
const element = (
  tag: string,
  style: string,
  children: ReadonlyArray<Node | string> = [],
): HTMLElement => {
  const node = document.createElement(tag)
  node.style.cssText = style
  node.append(...children)
  return node
}

/**
 * The outer page's colours, each for a light page and a dark one: it follows
 * the reader's preference, as the devices' themes inside it do.
 */
const c = {
  ink: 'light-dark(#18181b, #f4f4f5)',
  muted: 'light-dark(#52525b, #a1a1aa)',
  faint: 'light-dark(#71717a, #8e8e96)',
  page: 'light-dark(#fafafa, #111113)',
  card: 'light-dark(#fff, #18181b)',
  bar: 'light-dark(#fafafa, #1f1f23)',
  line: 'light-dark(#e4e4e7, #2e2e33)',
  chip: 'light-dark(#f4f4f5, #27272a)',
  warnChip: 'light-dark(#fef3c7, #3b2a0a)',
  warnInk: 'light-dark(#92400e, #fcd34d)',
}

const font = `font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: ${c.ink}`

const intro = (): HTMLElement =>
  element(
    'header',
    'display: grid; gap: .375rem; max-width: 96rem; margin: 0 auto; padding: 2.25rem 1.5rem 1.5rem',
    [
      element('p', `margin: 0; font-size: .8125rem; font-weight: 500; color: ${c.faint}`, [
        'Remote, Sync and Durable',
      ]),
      element(
        'h1',
        'margin: 0; font-size: 1.5rem; font-weight: 600; line-height: 1.25; letter-spacing: -.015em',
        ['Two devices, one registry'],
      ),
      element('p', `margin: 0; max-width: 44rem; color: ${c.muted}; font-size: .9375rem`, [
        '10,000 products on a server that runs in this browser. Each device keeps its own replica, so its edits wait while it is offline and reach the other when it is back.',
      ]),
    ],
  )

/**
 * The guide every demo offers, in the corner: the same view the applications
 * draw, run by a runtime of its own, since this page is plain DOM. It sends no
 * Messages and keeps no state.
 */
const guide = (): HTMLElement => {
  const container = element('div', '')
  container.id = 'demo-guide'
  const Guide = demoGuide<never>()
  queueMicrotask(() =>
    Runtime.run(
      Runtime.makeElement({
        Model: Schema.Struct({}),
        container,
        init: () => ({ model: {} }),
        update: (model: {}) => ({ model }),
        view: (_: {}, h: HtmlBuilder<never>) => Guide({ demo: registryDemo }, h),
      }),
    ),
  )
  return container
}

/** A device's card: its name and status above its page, a frame of its own. */
const card = (id: string, name: string): HTMLElement => {
  const dot = element(
    'span',
    'width: .5rem; height: .5rem; border-radius: 50%; background: #22c55e',
  )
  const badge = element(
    'span',
    `margin-inline-start: auto; padding: .125rem .625rem; border-radius: 999px; background: ${c.chip}; color: ${c.muted}; font-size: .75rem; font-weight: 500`,
    ['Synced'],
  )
  badge.setAttribute('role', 'status')
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return
    Option.match(decodeStatus(event.data), {
      onNone: () => {},
      onSome: status => {
        if (status.device === id) showStatus(dot, badge, status)
      },
    })
  })
  const frame = document.createElement('iframe')
  frame.src = `?pane=${id}`
  frame.title = name
  frame.style.cssText = 'display: block; width: 100%; height: 80vh; min-height: 34rem; border: 0'
  return element(
    'section',
    `background: ${c.card}; border: 1px solid ${c.line}; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgb(0 0 0 / .05)`,
    [
      element(
        'div',
        `display: flex; align-items: center; gap: .5rem; padding: .625rem 1rem; border-bottom: 1px solid ${c.line}; background: ${c.bar}; font-size: .875rem; font-weight: 600`,
        [dot, name, badge],
      ),
      frame,
    ],
  )
}

/**
 * The sandbox's page: without `?pane=`, the introduction and a card for each
 * device; with it, that device. Each device is a page of its own, as two
 * devices would be, so nothing of one's document (a grid's ids, its focus)
 * meets the other's; every frame meets the one server.
 */
export const startSandbox = async (container: HTMLElement): Promise<void> => {
  const pane = devices.find(({ id }) => id === new URLSearchParams(location.search).get('pane'))
  if (pane !== undefined) return startPane(container, pane)
  // Where a browser has no SharedWorker, this page runs the host, and both
  // device frames send their conversations here, so they meet one server.
  connectSandbox()
  document.documentElement.style.colorScheme = 'light dark'
  document.body.style.cssText = `margin: 0; background: ${c.page}; ${font}`
  container.append(
    intro(),
    element(
      'div',
      'display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 36rem), 1fr)); max-width: 96rem; margin: 0 auto; padding: 0 1.5rem 2.5rem',
      devices.map(({ id, name }) => card(id, name)),
    ),
    guide(),
  )
}

const startPane = async (
  container: HTMLElement,
  { id, name }: (typeof devices)[number],
): Promise<void> => {
  // The card around the frame names the device. An application draws in
  // place of its container, which needs an id.
  document.documentElement.style.colorScheme = 'light dark'
  document.body.style.cssText = `margin: 0; background: ${c.card}; ${font}`
  const app = document.createElement('div')
  app.id = id
  container.append(app)
  const connection = connectSandbox()
  const mounted = await startDevice({
    container: app,
    key: `foldkit-registry/sandbox/${id}`,
    name: () => name,
    resources: connection.remote,
    transport: device => Sync.transport.socket({ makeSocket: () => connection.socket(device) }),
  })
  // Where the edits stand, for the card around the frame, said when it changes.
  let told: string | undefined
  const tell = () => {
    const model = mounted.model()
    const status = encodeStatus(
      DeviceStatus.make({
        device: id,
        offline: model.offline,
        waiting: model.exchange.pending,
        unreachable: Option.isSome(model.exchange.error),
      }),
    )
    const key = JSON.stringify(status)
    if (key === told) return
    told = key
    window.parent.postMessage(status, location.origin)
  }
  mounted.subscribe(tell)
  tell()
}

const encodeStatus = Schema.encodeSync(DeviceStatus)
const decodeStatus = Schema.decodeUnknownOption(DeviceStatus)

/** A card's dot and badge for a device's status: green when all is sent, amber while edits wait. */
const showStatus = (dot: HTMLElement, badge: HTMLElement, status: DeviceStatus) => {
  const { label, waiting } = statusOf(status)
  dot.style.background = waiting ? '#f59e0b' : '#22c55e'
  badge.textContent = label
  badge.style.background = waiting ? c.warnChip : c.chip
  badge.style.color = waiting ? c.warnInk : c.muted
}

const statusOf = ({ offline, waiting, unreachable }: DeviceStatus) => {
  const edits = `${waiting} ${waiting === 1 ? 'edit' : 'edits'}`
  if (offline)
    return { label: waiting === 0 ? 'Offline' : `Offline · ${edits} waiting`, waiting: true }
  if (unreachable) return { label: `No server · ${edits} waiting`, waiting: true }
  if (waiting > 0) return { label: `Sending ${edits}…`, waiting: true }
  return { label: 'Synced', waiting: false }
}

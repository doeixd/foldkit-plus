/**
 * The published demo: two devices side by side, Device A and Device B, each a
 * page of its own in a frame, with its own replica and runtime, both talking
 * to one server that runs in the browser (`host.ts`, in a SharedWorker).
 * Every tab of the sandbox meets the same server.
 */
import { Remote } from 'foldkit-remote'
import { Sync } from 'foldkit-sync'
import { startDevice } from '../device.js'
import { connectSandbox } from './connection.js'

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

const font = 'font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #18181b'

const intro = (): HTMLElement => {
  const steps = [
    { title: 'Edit', text: 'Change a price in Device A. It shows in Device B a moment later.' },
    {
      title: 'Conflict',
      text: 'Tick “Work offline” in Device B, edit the same price in both, then untick it. The later edit wins, and the device that lost says so.',
    },
    {
      title: 'Reload',
      text: 'Reload Device B while it is offline. Its edits are still waiting, and go when it is back.',
    },
  ].map(({ title, text }, index) =>
    element(
      'li',
      'display: grid; gap: .25rem; padding: .875rem 1rem; background: #fff; border: 1px solid #e4e4e7; border-radius: 10px',
      [
        element(
          'span',
          'font-size: .75rem; font-weight: 600; color: #71717a; letter-spacing: .02em',
          [`${index + 1} · ${title}`],
        ),
        element('span', 'font-size: .875rem', [text]),
      ],
    ),
  )
  return element(
    'header',
    'display: grid; gap: .75rem; max-width: 96rem; margin: 0 auto; padding: 2rem 1.5rem 1.25rem',
    [
      element('p', 'margin: 0; font-size: .8125rem; font-weight: 600; color: #4f46e5', [
        'Foldkit Plus · Remote, Sync and Durable',
      ]),
      element('h1', 'margin: 0; font-size: 1.75rem; line-height: 1.2; letter-spacing: -.01em', [
        'Two devices, one registry',
      ]),
      element('p', 'margin: 0; max-width: 46rem; color: #52525b', [
        '10,000 products on a server that runs in this browser. Each device keeps its own replica, so its edits wait on the device while it is offline and reach the other when it is back.',
      ]),
      element(
        'ol',
        'list-style: none; margin: .5rem 0 0; padding: 0; display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))',
        steps,
      ),
    ],
  )
}

/** A device's card: its name above its page, a frame of its own. */
const card = (id: string, name: string): HTMLElement => {
  const frame = document.createElement('iframe')
  frame.src = `?pane=${id}`
  frame.title = name
  frame.style.cssText = 'display: block; width: 100%; height: 80vh; min-height: 34rem; border: 0'
  return element(
    'section',
    'background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgb(0 0 0 / .05)',
    [
      element(
        'div',
        'display: flex; align-items: center; gap: .5rem; padding: .625rem 1rem; border-bottom: 1px solid #e4e4e7; background: #fafafa; font-size: .875rem; font-weight: 600',
        [
          element('span', 'width: .5rem; height: .5rem; border-radius: 50%; background: #22c55e'),
          name,
        ],
      ),
      frame,
    ],
  )
}

/**
 * The sandbox's page: without `?pane=`, the introduction and a card for each
 * device; with it, that device. Each device is a page of its own, as two
 * devices would be, so nothing of one's document (a grid's ids, its focus)
 * meets the other's; every frame meets the one server through the worker.
 */
export const startSandbox = async (container: HTMLElement): Promise<void> => {
  const pane = devices.find(({ id }) => id === new URLSearchParams(location.search).get('pane'))
  if (pane !== undefined) return startPane(container, pane)
  document.body.style.cssText = `margin: 0; background: #f4f4f5; ${font}`
  const source = element('a', 'color: inherit', ['the source'])
  source.setAttribute('href', 'https://github.com/doeixd/foldkit-plus/tree/main/examples/registry')
  container.append(
    intro(),
    element(
      'div',
      'display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 36rem), 1fr)); max-width: 96rem; margin: 0 auto; padding: 0 1.5rem',
      devices.map(({ id, name }) => card(id, name)),
    ),
    element(
      'footer',
      'max-width: 96rem; margin: 0 auto; padding: 1.25rem 1.5rem 2rem; font-size: .8125rem; color: #71717a',
      [
        'The server, its SQLite and the journal all run in this tab; nothing is sent anywhere. Read ',
        source,
        '.',
      ],
    ),
  )
}

const startPane = async (
  container: HTMLElement,
  { id, name }: (typeof devices)[number],
): Promise<void> => {
  // The card around the frame names the device. An application draws in
  // place of its container, which needs an id.
  document.body.style.cssText = 'margin: 0; background: #fff'
  const app = document.createElement('div')
  app.id = id
  container.append(app)
  const connection = connectSandbox()
  await startDevice({
    container: app,
    key: `foldkit-registry/sandbox/${id}`,
    name: () => name,
    resources: Remote.clientLayer(connection.remote),
    transport: device =>
      Sync.transport.socket({ url: 'sandbox', makeSocket: () => connection.socket(device) }),
  })
}

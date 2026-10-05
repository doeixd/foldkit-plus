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

const intro = (): HTMLElement => {
  const box = document.createElement('section')
  box.setAttribute('aria-label', 'What this is')
  box.style.cssText =
    'font: 15px/1.5 system-ui, sans-serif; max-width: 72rem; margin: 1rem auto 0; padding: 0 1rem'
  const title = document.createElement('h1')
  title.textContent = 'Two devices, one registry'
  title.style.cssText = 'font-size: 1.4rem; margin: 0 0 .25rem'
  const lead = document.createElement('p')
  lead.textContent =
    '10,000 products on a server that runs in this browser. Each pane is a device with a replica of its own.'
  lead.style.margin = '0 0 .5rem'
  const steps = document.createElement('ol')
  for (const step of [
    'Edit a price in Device A: it shows in Device B.',
    'Tick “Work offline” in Device B, edit the same price in both, then untick it: the later edit wins, and the pane that lost says so.',
    'Reload with Device B offline: its edits are still waiting.',
  ]) {
    const item = document.createElement('li')
    item.textContent = step
    steps.append(item)
  }
  box.append(title, lead, steps)
  return box
}

/**
 * The sandbox's page: without `?pane=`, the introduction and a frame for each
 * device; with it, that device. Each device is a page of its own, as two
 * devices would be, so nothing of one's document (a grid's ids, its focus)
 * meets the other's; every frame meets the one server through the worker.
 */
export const startSandbox = async (container: HTMLElement): Promise<void> => {
  const pane = devices.find(({ id }) => id === new URLSearchParams(location.search).get('pane'))
  if (pane !== undefined) return startPane(container, pane)
  const panes = document.createElement('div')
  panes.style.cssText =
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr)); gap: 1rem; padding: 0 1rem 1rem'
  for (const { id, name } of devices) {
    const frame = document.createElement('iframe')
    frame.src = `?pane=${id}`
    frame.title = name
    frame.style.cssText = 'width: 100%; height: 85vh; border: 1px solid #d4d4d8; border-radius: 6px'
    panes.append(frame)
  }
  container.append(intro(), panes)
}

const startPane = async (
  container: HTMLElement,
  { id, name }: (typeof devices)[number],
): Promise<void> => {
  const heading = document.createElement('h2')
  heading.textContent = name
  heading.style.cssText = 'font: 600 1.1rem system-ui, sans-serif; margin: 1rem 0 0 1.5rem'
  // An application draws in place of its container, which needs an id.
  const app = document.createElement('div')
  app.id = id
  container.append(heading, app)
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

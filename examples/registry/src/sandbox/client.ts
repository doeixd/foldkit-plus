/**
 * The published demo: two devices side by side, Device A and Device B, each a
 * page of its own in a frame, with its own replica and runtime, both talking
 * to one server that runs in the browser (`host.ts`, in a SharedWorker).
 * Every tab of the sandbox meets the same server.
 */
import { Option, Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { SlotView } from 'foldkit-mixins'
import { AppShell, Badge, Card } from 'foldkit-mixins-ui'
import { registryDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import { Sync } from 'foldkit-sync'
import { startDevice } from '../device.js'
import { DeviceBadgeStyle, DeviceCardStyle, Sandbox, ShellStyle } from '../style.js'
import { connectSandbox } from './connection.js'
import { DeviceStatus } from './protocol.js'

const devices = [
  { id: 'device-a', name: 'Device A' },
  { id: 'device-b', name: 'Device B' },
] as const

/** What each device's frame last said of its edits; a device yet to say is absent. */
const Model = Schema.Struct({ statuses: Schema.Array(DeviceStatus) })
type Model = typeof Model.Type

const Message = defineMessageUnion({ GotStatus: { status: DeviceStatus } })
type Message = typeof Message.Type

const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    GotStatus: ({ status }) => ({
      model: {
        statuses: [...model.statuses.filter(({ device }) => device !== status.device), status],
      },
    }),
  })

const decodeStatus = Schema.decodeUnknownOption(DeviceStatus)

/**
 * The frames' statuses, from this page's own origin and naming one of its
 * devices: anything else posted to the window is not a device speaking.
 */
const subscriptions = Subscription.make<Model, Message>()(() => ({
  statuses: Subscription.persistentEntry(
    Stream.fromEventListener<MessageEvent>(window, 'message').pipe(
      Stream.filter(event => event.origin === location.origin),
      Stream.map(event => decodeStatus(event.data)),
      Stream.filter(Option.isSome),
      Stream.map(({ value }) => value),
      Stream.filter(({ device }) => devices.some(({ id }) => id === device)),
      Stream.map(status => Message.GotStatus({ status })),
    ),
  ),
}))

/** A card's badge for a device's status: settled once all is sent, waiting while edits are kept. */
const statusOf = (status: Option.Option<DeviceStatus>) =>
  Option.match(status, {
    onNone: () => ({ text: 'Starting…', tone: 'waiting' }),
    onSome: ({ offline, waiting, unreachable }) => {
      const edits = `${waiting} ${waiting === 1 ? 'edit' : 'edits'}`
      if (offline)
        return { text: waiting === 0 ? 'Offline' : `Offline · ${edits} waiting`, tone: 'waiting' }
      if (unreachable) return { text: `No server · ${edits} waiting`, tone: 'waiting' }
      if (waiting > 0) return { text: `Sending ${edits}…`, tone: 'waiting' }
      return { text: 'Synced', tone: 'synced' }
    },
  })

const Guide = demoGuide<Message>()

const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(Sandbox.slots, [Sandbox.style.mixin], { input: undefined, h })
  return h.div(
    [],
    [
      AppShell.view(
        { title: 'Product registry', style: ShellStyle },
        [
          h.div(slots.content.attrs(), [
            h.header(slots.intro.attrs(), [
              h.p(slots.eyebrow.attrs(), ['Remote, Sync and Durable']),
              h.h1(slots.heading.attrs(), ['Two devices, one registry']),
              h.p(slots.lede.attrs(), [
                '10,000 products on a server that runs in this browser. Each device keeps its own replica, so its edits wait while it is offline and reach the other when it is back.',
              ]),
            ]),
            h.div(
              slots.devices.attrs(),
              devices.map(({ id, name }) => {
                const { text, tone } = statusOf(
                  Option.fromUndefinedOr(model.statuses.find(({ device }) => device === id)),
                )
                // A region per device, named for it, holding its frame: its page of its own.
                return h.section(
                  [h.Key(id), h.AriaLabel(name)],
                  [
                    Card.view(
                      {
                        title: name,
                        action: h.span(
                          [h.Role('status')],
                          [Badge.view({ text, tone, style: DeviceBadgeStyle }, h)],
                        ),
                        content: h.iframe(
                          slots.frame.attrs([h.Src(`?pane=${id}`), h.Title(name)]),
                          [],
                        ),
                        style: DeviceCardStyle,
                      },
                      h,
                    ),
                  ],
                )
              }),
            ),
          ]),
        ],
        h,
      ),
      Guide({ demo: registryDemo }, h),
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
  Runtime.run(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { statuses: [] } }),
      update,
      view,
      subscriptions,
    }),
  )
}

const startPane = async (
  container: HTMLElement,
  { id, name }: (typeof devices)[number],
): Promise<void> => {
  // The card around the frame names the device. An application draws in
  // place of its container, which needs an id.
  const app = document.createElement('div')
  app.id = id
  container.append(app)
  const connection = connectSandbox()
  const mounted = await startDevice({
    container: app,
    store: `foldkit-registry/sandbox/${id}`,
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

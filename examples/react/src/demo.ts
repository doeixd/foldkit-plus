/**
 * Three ways Foldkit and React meet, each printed as a transcript:
 *
 * 1. A React component as an island in a Foldkit view (ReactComponent).
 * 2. A Foldkit program inside a React app (FoldkitComponent).
 * 3. A Foldkit view compiled to React TSX (foldkit-react-codegen).
 */
import { Effect, Schema, Stream } from 'effect'
import { modifyFields } from 'foldkit/struct'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Port from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { FoldkitComponent, ReactComponent } from 'foldkit-react'
import { formatDiagnostic, transformSourceFile } from 'foldkit-react-codegen'
import { createElement, lazy, useState, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'

const settle = () => new Promise(resolve => setTimeout(resolve, 10))

const waitFor = async (description: string, check: () => boolean) => {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (check()) return
    await settle()
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()

const mountPoint = (id: string) => {
  const element = document.createElement('div')
  // A Foldkit runtime renders into its container by id.
  element.id = id
  document.body.appendChild(element)
  return element
}

// --- 1. React inside Foldkit ------------------------------------------------

interface StarRatingProps {
  readonly value: number
  readonly label: string
  readonly onRate?: (stars: number) => void
}

/** An ordinary React component with state of its own: how many times it was previewed. */
const StarRating = ({ value, label, onRate }: StarRatingProps) => {
  const [previews, setPreviews] = useState(0)
  return createElement(
    'div',
    { className: 'rating' },
    createElement('span', { className: 'label' }, label),
    ...[1, 2, 3, 4, 5].map(stars =>
      createElement(
        'button',
        { key: stars, className: `star-${stars}`, onClick: () => onRate?.(stars) },
        stars <= value ? '★' : '☆',
      ),
    ),
    createElement(
      'button',
      { className: 'preview', onClick: () => setPreviews(count => count + 1) },
      `previews: ${previews}`,
    ),
  )
}

let resolveDetails!: (module: { default: ComponentType<{ readonly stars: number }> }) => void
const Details = lazy(
  () =>
    new Promise<{ default: ComponentType<{ readonly stars: number }> }>(resolve => {
      resolveDetails = resolve
    }),
)

const ReactStarRating = ReactComponent.define(StarRating, { events: ['onRate'] })
const ReactDetails = ReactComponent.define(Details)

const ReviewModel = Schema.Struct({ title: Schema.String, stars: Schema.Number })
type ReviewModel = typeof ReviewModel.Type
const ReviewMessage = defineMessageUnion({
  Rated: { stars: Schema.Number },
  Renamed: {},
})
type ReviewMessage = typeof ReviewMessage.Type

const reviewView = (model: ReviewModel, h: HtmlBuilder<ReviewMessage>): Html =>
  h.section(
    [],
    [
      h.p([h.Class('model')], [`Model: ${model.title}, ${model.stars} stars`]),
      h.button([h.Class('rename'), h.OnClick(ReviewMessage.Renamed())], ['rename']),
      ReactStarRating.view(
        {
          props: { value: model.stars, label: model.title },
          messages: { onRate: stars => ReviewMessage.Rated({ stars }) },
        },
        h,
      ),
      ReactDetails.view(
        {
          props: { stars: model.stars },
          suspenseFallback: createElement('em', { className: 'details' }, 'loading details…'),
        },
        h,
      ),
    ],
  )

const reactInsideFoldkit = async (lines: Array<string>) => {
  lines.push('== React component inside a Foldkit view ==')
  const program = Runtime.makeElement({
    Model: ReviewModel,
    container: mountPoint('review'),
    init: () => ({ model: { title: 'Dune', stars: 3 } }),
    update: (model: ReviewModel, message: ReviewMessage) => {
      switch (message._tag) {
        case 'Rated':
          return { model: modifyFields(model, { stars: () => message.stars }) }
        case 'Renamed':
          return { model: modifyFields(model, { title: () => `${model.title} (2021)` }) }
      }
    },
    view: reviewView,
  })
  const handle = Runtime.embed(program)
  try {
    await waitFor('the island', () => text('.label') === 'Dune')
    lines.push(`island host: <${document.querySelector('.rating')!.parentElement!.localName}>`)
    lines.push(`rendered: ${text('.label')} ${stars()}`)
    await waitFor('the Suspense fallback', () => text('.details') !== '')
    lines.push(`suspense: ${text('.details')}`)

    click('.star-5')
    // Both renders: the Foldkit model text and the React island catching up.
    await waitFor('the rating', () => text('.model').includes('5 stars') && stars() === '★★★★★')
    lines.push(`React onRate(5) -> Message Rated -> ${text('.model')}; island shows ${stars()}`)

    click('.preview')
    click('.preview')
    await waitFor('previews', () => text('.preview') === 'previews: 2')
    click('.rename')
    await waitFor('the new title', () => text('.label') === 'Dune (2021)')
    lines.push(`Foldkit renamed the title; React state kept: ${text('.preview')}`)

    resolveDetails({
      default: ({ stars }) =>
        createElement('em', { className: 'details' }, `details for ${stars} stars`),
    })
    await waitFor('details', () => text('.details').startsWith('details for'))
    lines.push(`suspense resolved: ${text('.details')}`)
  } finally {
    handle.dispose()
  }
}

const stars = () =>
  Array.from(document.querySelectorAll('.rating button[class^=star]'))
    .map(button => button.textContent)
    .join('')

// --- 2. Foldkit inside React ------------------------------------------------

const counterPorts = {
  inbound: { stepChanged: Port.inbound(Schema.Number) },
  outbound: { countChanged: Port.outbound(Schema.Number) },
}
const CounterModel = Schema.Struct({ count: Schema.Number, step: Schema.Number })
type CounterModel = typeof CounterModel.Type
const CounterMessage = defineMessageUnion({
  Incremented: {},
  ChangedStep: { step: Schema.Number },
  Reported: {},
})
type CounterMessage = typeof CounterMessage.Type

let runtimeStopped = false

const makeCounter = (container: HTMLElement, start: number) =>
  Runtime.makeElement({
    Model: CounterModel,
    container,
    ports: counterPorts,
    init: () => ({ model: { count: start, step: 1 } }),
    update: (model: CounterModel, message: CounterMessage) => {
      switch (message._tag) {
        case 'ChangedStep':
          return { model: modifyFields(model, { step: () => message.step }) }
        case 'Reported':
          return { model }
        case 'Incremented': {
          const count = model.count + model.step
          const report: { name: string; effect: Effect.Effect<CounterMessage> } = {
            name: 'ReportCount',
            effect: Port.emit(counterPorts.outbound.countChanged, count).pipe(
              Effect.as(CounterMessage.Reported()),
            ),
          }
          return { model: modifyFields(model, { count: () => count }), commands: [report] }
        }
      }
    },
    subscriptions: Subscription.make<CounterModel, CounterMessage>()(entry => ({
      step: Port.subscription(counterPorts.inbound.stepChanged, step =>
        CounterMessage.ChangedStep({ step }),
      ),
      // Only runs while the runtime is alive, so its finalizer shows disposal.
      lifetime: entry(
        { alive: Schema.Boolean },
        {
          modelToDependencies: () => ({ alive: true }),
          dependenciesToStream: () =>
            Stream.never.pipe(Stream.ensuring(Effect.sync(() => void (runtimeStopped = true)))),
        },
      ),
    })),
    view: (model: CounterModel, h: HtmlBuilder<CounterMessage>) =>
      h.button(
        [h.Class('increment'), h.OnClick(CounterMessage.Incremented())],
        [`count ${model.count} (+${model.step})`],
      ),
  })

interface CounterProps {
  readonly start: number
  readonly step: number
  readonly onCount: (count: number) => void
}

const Counter = FoldkitComponent.define({
  make: (container, props: CounterProps) => makeCounter(container, props.start),
  inbound: { stepChanged: props => props.step },
  outbound: { countChanged: (count, props) => props.onCount(count) },
})

const foldkitInsideReact = async (lines: Array<string>) => {
  lines.push('== Foldkit program inside a React app ==')
  const reported: Array<string> = []
  const root = createRoot(mountPoint('react-app'))
  const render = (step: number, listener: string) =>
    root.render(
      createElement(Counter, {
        start: 10,
        step,
        onCount: count => reported.push(`${listener}:${count}`),
      }),
    )

  render(2, 'first')
  await waitFor('the counter', () => text('.increment') === 'count 10 (+2)')
  lines.push(`rendered with step prop 2: ${text('.increment')}`)
  click('.increment')
  await waitFor('a report', () => reported.length === 1)
  lines.push(`outbound Port -> onCount: ${reported.join(', ')}`)

  render(5, 'second')
  await waitFor('the new step', () => text('.increment') === 'count 12 (+5)')
  click('.increment')
  await waitFor('a second report', () => reported.length === 2)
  lines.push(
    `new props (step 5, new callback): ${text('.increment')}; reports ${reported.join(', ')}`,
  )

  root.unmount()
  await waitFor('disposal', () => runtimeStopped)
  lines.push(
    `unmounted: runtime disposed = ${runtimeStopped}, counter in DOM = ${document.querySelector('.increment') !== null}`,
  )
}

// --- 3. Compile a Foldkit view to React TSX ---------------------------------

const cardSource = `import type { Html, HtmlBuilder } from 'foldkit/html'
import { Message, type Model } from './message'

export const card = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.article([h.Class('card')], [
    h.h2([], [model.title]),
    h.button([h.OnClick(Message.Rated({ stars: 5 })), h.AriaLabel('Rate five')], ['★★★★★']),
  ])
`

const codegen = (lines: Array<string>) => {
  lines.push('== foldkit-react-codegen ==')
  const result = transformSourceFile('src/card.ts', cardSource)
  if (!result.ok) throw new Error(result.diagnostics.map(formatDiagnostic).join('\n'))
  lines.push(...result.code.trimEnd().split('\n'))

  const refused = transformSourceFile(
    'src/chart.ts',
    `import type { HtmlBuilder } from 'foldkit/html'\nexport const chart = (h: HtmlBuilder<Message>) =>\n  h.canvas([h.OnMount(drawChart)], [])\n`,
  )
  lines.push(...refused.diagnostics.map(formatDiagnostic))
}

export const runDemo = async () => {
  const lines: Array<string> = []
  await reactInsideFoldkit(lines)
  await foldkitInsideReact(lines)
  codegen(lines)
  return lines
}

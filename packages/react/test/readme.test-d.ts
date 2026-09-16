/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Port from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import { createElement, useEffect, type ReactNode } from 'react'
import { FoldkitComponent, ReactComponent, useFoldkitElement } from '../src/index.js'

// --- React inside Foldkit ---

declare const DatePicker: (props: {
  readonly value: Date
  readonly onChange?: (date: Date) => void
  readonly renderDay?: (date: Date) => ReactNode
}) => ReactNode
declare const Editor: (props: { readonly document: string }) => ReactNode
declare const Counter: (props: { readonly id: string }) => ReactNode
declare const Spinner: () => ReactNode

const Model = Schema.Struct({ dueDate: Schema.Date, document: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ChangedDueDate: { date: Schema.Date },
  EditorCrashed: { reason: Schema.String },
})
type Message = typeof Message.Type
const { ChangedDueDate, EditorCrashed } = Message

const ReactDatePicker = ReactComponent.define(DatePicker, { events: ['onChange'] })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.h2([], ['Due date']),
      ReactDatePicker.view(
        {
          props: { value: model.dueDate },
          messages: { onChange: date => ChangedDueDate({ date }) },
        },
        h,
      ),
    ],
  )

const ReactEditor = ReactComponent.define(Editor)
const ReactCounter = ReactComponent.define(Counter)

export const editor = (model: Model, h: HtmlBuilder<Message>) =>
  ReactEditor.view(
    {
      props: { document: model.document },
      suspenseFallback: createElement(Spinner),
      errorBoundary: {
        fallback: () => createElement('p', null, 'The editor crashed.'),
        toMessage: error => EditorCrashed({ reason: String(error) }),
      },
    },
    h,
  )

export const row = (row: { readonly id: string }, h: HtmlBuilder<Message>) =>
  ReactCounter.view({ props: { id: row.id }, hostAttributes: [h.Key(row.id), h.Class('row')] }, h)

// --- Foldkit inside React ---

const ports = {
  inbound: {
    stepChanged: Port.inbound(Schema.Number),
    filtersChanged: Port.inbound(Schema.Array(Schema.String)),
  },
  outbound: { countChanged: Port.outbound(Schema.Number) },
}
declare const makeCounter: (
  container: HTMLElement,
  initialCount: number,
) => Runtime.MakeRuntimeReturn<typeof ports, void, never, 'Element'>
declare const makeDashboard: (
  container: HTMLElement,
  userId: string,
) => Runtime.MakeRuntimeReturn<typeof ports, void, never, 'Element'>
declare const shallowEqual: <A>(a: A, b: A) => boolean

interface CounterProps {
  readonly initialCount: number
  readonly step: number
  readonly onCountChange?: (count: number) => void
}
interface DashboardProps {
  readonly userId: string
  readonly filters: ReadonlyArray<string>
}

export const CounterComponent = FoldkitComponent.define({
  make: (container, props: CounterProps) => makeCounter(container, props.initialCount),
  inbound: { stepChanged: props => props.step },
  outbound: { countChanged: (count, props) => props.onCountChange?.(count) },
})
createElement(CounterComponent, { initialCount: 10, step: 2, onCountChange: () => {} })

export const Dashboard = FoldkitComponent.define({
  make: (container, props: DashboardProps) => makeDashboard(container, props.userId),
  inbound: { filtersChanged: { select: props => props.filters, equals: shallowEqual } },
  restartKey: props => props.userId,
})

export const HookCounter = ({ step }: { readonly step: number }) => {
  const { ref, handle } = useFoldkitElement({
    make: container => makeCounter(container, 0),
  })
  useEffect(() => {
    handle?.ports.stepChanged.send(step)
  }, [handle, step])
  return createElement('div', { ref })
}

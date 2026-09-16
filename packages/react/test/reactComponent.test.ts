// @vitest-environment jsdom
/**
 * React islands inside a real Foldkit runtime: props follow the Model without
 * remounting, events become exactly one Message, and removal unmounts React.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { createElement, useEffect, useState, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { ReactComponent } from '../src/index.js'
import { click, mount, settle, text } from './foldkit.js'

const Model = Schema.Struct({
  label: Schema.String,
  shown: Schema.Boolean,
  log: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Relabeled: {},
  Toggled: {},
  Picked: { value: Schema.String },
})
type Message = typeof Message.Type

const mounts: Array<string> = []
const unmounts: Array<string> = []

interface PickerProps {
  readonly label: string
  readonly onPick?: (value: string) => void
  readonly renderExtra?: (count: number) => ReactNode
}

const Picker = ({ label, onPick, renderExtra }: PickerProps) => {
  const [count, setCount] = useState(0)
  useEffect(() => {
    mounts.push(label)
    return () => void unmounts.push(label)
  }, [])
  return createElement(
    'div',
    null,
    createElement('span', { className: 'label' }, label),
    createElement(
      'button',
      { className: 'local', onClick: () => setCount(c => c + 1) },
      String(count),
    ),
    createElement(
      'button',
      { className: 'pick', onClick: () => onPick?.(`picked-${count}`) },
      'pick',
    ),
    renderExtra?.(count),
  )
}

const ReactPicker = ReactComponent.define(Picker, { events: ['onPick'] })

const update = (model: Model, message: Message): Model => {
  switch (message._tag) {
    case 'Relabeled':
      return { ...model, label: `${model.label}!` }
    case 'Toggled':
      return { ...model, shown: !model.shown }
    case 'Picked':
      return { ...model, log: [...model.log, message.value] }
  }
}

it('follows the Model without remounting and turns events into one Message each', async () => {
  mounts.length = 0
  unmounts.length = 0
  const handle = mount<Model, Message>({
    Model,
    init: { label: 'a', shown: true, log: [] },
    update,
    view: (model, h) =>
      h.div(
        [],
        [
          h.button([h.Class('relabel'), h.OnClick(Message.Relabeled())], []),
          h.button([h.Class('toggle'), h.OnClick(Message.Toggled())], []),
          h.p([h.Class('log')], [model.log.join(',')]),
          model.shown
            ? ReactPicker.view(
                {
                  props: {
                    label: model.label,
                    renderExtra: count => createElement('i', { className: 'extra' }, `x${count}`),
                  },
                  messages: { onPick: value => Message.Picked({ value }) },
                  hostAttributes: [h.Class('island')],
                },
                h,
              )
            : h.span([], []),
        ],
      ),
  })
  try {
    await vi.waitFor(() => expect(text('.label')).toBe('a'))
    expect(document.querySelector('.island')?.tagName).toBe('FOLDKIT-REACT-HOST')

    click('.local')
    await vi.waitFor(() => expect(text('.local')).toBe('1'))
    // A render prop stays a plain prop: it renders rather than dispatching.
    expect(text('.extra')).toBe('x1')

    click('.relabel')
    await vi.waitFor(() => expect(text('.label')).toBe('a!'))
    expect(text('.local')).toBe('1')
    expect(mounts).toEqual(['a'])

    click('.pick')
    await vi.waitFor(() => expect(text('.log')).toBe('picked-1'))
    await settle()
    expect(text('.log')).toBe('picked-1')

    click('.toggle')
    await vi.waitFor(() => expect(unmounts).toEqual(['a']))
  } finally {
    handle.dispose()
  }
})

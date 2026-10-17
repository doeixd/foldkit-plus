/// <reference types="@vitest/browser-playwright" />
/**
 * A trace on a real runtime, its openness in the Model: open while it runs,
 * a press shuts it to nothing and keeps the focus on the trigger, Enter
 * opens it again; a step's detail opens and shuts the same way. And the
 * look: the summary shimmers only while running, each marker draws its
 * state on the title's first line, the running one turning for a travel's
 * time and held under reduced motion, and a line runs from each marker to
 * the next but the last's.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { toggled } from '../src/accordion.js'
import { ThinkingStepsSlots, view as trace, type ThinkingStep } from '../src/thinkingSteps.js'
import { ThinkingSteps } from '../src/recipes/thinkingSteps.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ThinkingStepsSlots)(ThinkingSteps({}))
const bare = Style.forSlots(ThinkingStepsSlots)(ThinkingSteps({ connector: 'none' }))
const Model = Schema.Struct({
  open: Schema.Option(Schema.Boolean),
  openSteps: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Toggled: { open: Schema.Boolean },
  ToggledStep: { id: Schema.String },
})
type Message = typeof Message.Type

const running: ReadonlyArray<ThinkingStep> = [
  {
    id: 'search',
    title: 'Searched the web',
    state: 'done',
    duration: 1200,
    detail: 'Four sources.',
  },
  { id: 'read', title: 'Reading sources', state: 'running' },
  { id: 'write', title: 'Write the answer', state: 'pending' },
]
const ended: ReadonlyArray<ThinkingStep> = [
  { id: 'search', title: 'Searched', state: 'done' },
  { id: 'fetch', title: 'Fetched', state: 'failed' },
]

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** A trace held open, which a press asks to keep open. */
const still = (
  id: string,
  steps: ReadonlyArray<ThinkingStep>,
  look: typeof style,
  h: HtmlBuilder<Message>,
) =>
  trace(
    {
      id,
      steps,
      open: Option.some(true),
      onToggle: open => Message.Toggled({ open }),
      style: look,
    },
    h,
  )

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    bare.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'thinking-steps'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ display: 'grid', gap: '2rem', inlineSize: '24rem', padding: '16px' })],
      [
        // No travel, so a size is read where it ends rather than mid-flight.
        h.div(
          [h.Id('live'), h.Attribute('style', '--fk-knob-travel: 0')],
          [
            trace(
              {
                id: 'live',
                steps: running,
                open: model.open,
                onToggle: open => Message.Toggled({ open }),
                openSteps: model.openSteps,
                onToggleStep: id => Message.ToggledStep({ id }),
                style,
              },
              h,
            ),
          ],
        ),
        h.div([h.Id('turning')], [still('turning', running, style, h)]),
        h.div([h.Id('ended')], [still('ended', ended, style, h)]),
        h.div([h.Id('bare')], [still('bare', ended, bare, h)]),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { open: Option.none(), openSteps: [] } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Toggled: ({ open }) => ({
            model: modifyFields(model, { open: () => Option.some(open) }),
          }),
          ToggledStep: ({ id }) => ({
            model: modifyFields(model, {
              openSteps: openSteps => toggled(openSteps, id, { multiple: true }),
            }),
          }),
        }),
      view,
    }),
  )
}

const inside = (id: string, selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`#${id} ${selector}`))
const trigger = (id: string) => inside(id, 'button')[0]!
const controlled = (button: HTMLElement) =>
  document.getElementById(button.getAttribute('aria-controls')!)!
const height = (element: HTMLElement) => element.getBoundingClientRect().height
const markers = (id: string) => inside(id, 'li > :first-child > [aria-hidden="true"]')

test('open while it runs; a press shuts it, the focus stays, Enter opens it', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(inside('live', 'li')).toHaveLength(3))
    const panel = controlled(trigger('live'))
    const chevron = () => getComputedStyle(trigger('live').lastElementChild!).rotate
    expect(height(panel)).toBeGreaterThan(40)
    expect(chevron()).toBe('45deg')
    await userEvent.click(trigger('live'))
    await vi.waitFor(() => expect(height(panel)).toBe(0))
    expect(document.activeElement).toBe(trigger('live'))
    expect(trigger('live').getAttribute('aria-expanded')).toBe('false')
    expect(chevron()).toBe('-45deg')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(height(panel)).toBeGreaterThan(40))
    expect(document.activeElement).toBe(trigger('live'))
  } finally {
    handle.dispose()
  }
})

test('a step’s detail opens and shuts under its row', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(inside('live', 'li')).toHaveLength(3))
    const head = inside('live', 'li > button')[0]!
    const body = controlled(head)
    expect(height(body)).toBe(0)
    await userEvent.click(head)
    await vi.waitFor(() => expect(height(body)).toBeGreaterThan(10))
    expect(body.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      head.getBoundingClientRect().bottom - 1,
    )
    await userEvent.click(head)
    await vi.waitFor(() => expect(height(body)).toBe(0))
  } finally {
    handle.dispose()
  }
})

test('the summary shimmers while running alone', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(inside('ended', 'li')).toHaveLength(2))
    const summary = (id: string) => getComputedStyle(trigger(id).firstElementChild!)
    expect(summary('live').color).toBe('rgba(0, 0, 0, 0)')
    expect(summary('live').backgroundClip).toBe('text')
    expect(summary('ended').color).not.toBe('rgba(0, 0, 0, 0)')
    expect(summary('ended').animationName).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('each marker draws its state on its title’s first line', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(inside('ended', 'li')).toHaveLength(2))
    const [done, runningMarker, pending] = markers('live')
    const [, failed] = markers('ended')
    expect(getComputedStyle(done!, '::after').content).toBe('""')
    expect(getComputedStyle(done!, '::after').rotate).toBe('45deg')
    expect(getComputedStyle(failed!, '::before').content).toBe('""')
    expect(getComputedStyle(failed!, '::after').rotate).toBe('-45deg')
    expect(getComputedStyle(pending!).borderTopWidth).toBe('1px')
    expect(getComputedStyle(runningMarker!).borderTopColor).not.toBe(
      getComputedStyle(runningMarker!).borderBottomColor,
    )
    // The marker reads its state's color, and no two states share one.
    const colors = [done, runningMarker, pending, failed].map(
      marker => getComputedStyle(marker!).color,
    )
    expect(new Set(colors).size).toBe(4)
    // The state's words are said, not shown.
    const words = done!.parentElement!.querySelector('span:nth-of-type(3)')!
    expect(words.textContent).toBe('done')
    expect(words.getBoundingClientRect().width).toBeLessThanOrEqual(1)
    const title = done!.nextElementSibling!.getBoundingClientRect()
    const mark = done!.getBoundingClientRect()
    const line = parseFloat(getComputedStyle(done!.nextElementSibling!).lineHeight)
    expect(Math.abs(mark.top + mark.height / 2 - (title.top + line / 2))).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})

test('a running marker turns for a travel’s time, none with no travel, held under reduced motion', async () => {
  let handle = mount()
  try {
    await vi.waitFor(() => expect(markers('turning')).toHaveLength(3))
    const seconds = (marker: HTMLElement) => parseFloat(getComputedStyle(marker).animationDuration)
    expect(seconds(markers('turning')[1]!)).toBeGreaterThan(0.3)
    expect(seconds(markers('live')[1]!)).toBe(0)
    expect(getComputedStyle(markers('turning')[0]!).animationName).toBe('none')
    handle.dispose()
    document.body.replaceChildren()
    await reduce('reduce')
    handle = mount()
    await vi.waitFor(() => expect(markers('turning')).toHaveLength(3))
    expect(getComputedStyle(markers('turning')[1]!).animationName).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('a line runs from each marker to the next, but the last’s; none without a connector', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(inside('bare', 'li')).toHaveLength(2))
    const [first, last] = inside('ended', 'li')
    const line = getComputedStyle(first!, '::before')
    expect(line.content).toBe('""')
    const [top, next] = markers('ended').map(marker => marker.getBoundingClientRect())
    const lineTop = first!.getBoundingClientRect().top + parseFloat(line.top)
    const lineBottom = first!.getBoundingClientRect().bottom - parseFloat(line.bottom)
    expect(lineTop).toBeGreaterThanOrEqual(top!.bottom)
    expect(lineBottom).toBeLessThanOrEqual(next!.top)
    expect(lineBottom - lineTop).toBeGreaterThan(0)
    expect(getComputedStyle(last!, '::before').content).toBe('none')
    expect(getComputedStyle(inside('bare', 'li')[0]!, '::before').content).toBe('none')
  } finally {
    handle.dispose()
  }
})

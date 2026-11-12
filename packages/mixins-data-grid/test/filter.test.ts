// @vitest-environment jsdom
/**
 * The filter form on the real runtime: a filtering column's header draws a
 * button that opens its form, the form's fields report the column's filter,
 * the application filters its rows by it, and the header says it is filtered.
 * The grid's keys leave the form's fields alone, and a filter the
 * application wrote while the form was open is where the next key starts.
 * The clipboard is the browser test's: a real clipboard event carries data.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { buttonOf, form, grid, headerOf, mountTasks, shownRows } from './filterGrid.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const mount = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  return mountTasks()
}
const click = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const type = (input: HTMLInputElement, text: string) => {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const field = (id: string) => document.getElementById(`tasks:${id}`) as HTMLInputElement
const keyOn = (target: Element, key: string, modifiers: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  )

test('a filtering header draws its button and names itself, and filters only once given one', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't1', 't2']))
    const button = buttonOf('title')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Filter Title')
    expect(button.getAttribute('tabindex')).toBe('-1')
    expect(headerOf('title').getAttribute('aria-label')).toBe('Title')
    expect(headerOf('title').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowDown')
    expect(headerOf('title').hasAttribute('data-filtered')).toBe(false)
    expect(headerOf('title').hasAttribute('aria-description')).toBe(false)

    click(button)
    await vi.waitFor(() => expect(form()).not.toBeNull())
    expect(form()!.getAttribute('aria-label')).toBe('Filter Title')
    expect(buttonOf('title').getAttribute('aria-expanded')).toBe('true')
    // Nothing to clear yet.
    expect(form()!.querySelector('button')).toBeNull()

    type(field('title:filter:text'), 'BOLT')
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't2']))
    expect(mounted.latest().log).toEqual(['title={"_tag":"Contains","text":"BOLT"}'])
    expect(headerOf('title').getAttribute('data-filtered')).toBe('true')
    expect(headerOf('title').getAttribute('aria-description')).toBe('Filtered')
    expect(buttonOf('title').getAttribute('data-filtered')).toBe('true')

    // Clear empties the form and reports no filter.
    click(form()!.querySelector('button')!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't1', 't2']))
    expect(field('title:filter:text').value).toBe('')
    expect(mounted.latest().log.at(-1)).toBe('title=-')
  } finally {
    mounted.dispose()
  }
})

test('a bound that is no number is marked and unreported, and crossed bounds are said', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    click(buttonOf('hours'))
    await vi.waitFor(() => expect(form()).not.toBeNull())
    type(field('hours:filter:min'), '2')
    await vi.waitFor(() => expect(shownRows()).toEqual(['t1', 't2']))
    type(field('hours:filter:min'), '2x')
    await vi.waitFor(() =>
      expect(field('hours:filter:min').getAttribute('aria-invalid')).toBe('true'),
    )
    const error = document.getElementById(
      field('hours:filter:min').getAttribute('aria-describedby')!,
    )
    expect(error?.textContent).toBe('Not a number')
    // Still filtered by the last bound that held.
    expect(shownRows()).toEqual(['t1', 't2'])
    type(field('hours:filter:min'), '3')
    type(field('hours:filter:max'), '1')
    await vi.waitFor(() => expect(shownRows()).toEqual([]))
    expect(field('hours:filter:max').getAttribute('aria-invalid')).toBe('true')
    expect(field('hours:filter:min').getAttribute('aria-invalid')).toBe('false')
    expect(mounted.latest().log).toEqual([
      'hours={"_tag":"Range","min":2,"max":null}',
      'hours={"_tag":"Range","min":3,"max":null}',
      'hours={"_tag":"Range","min":3,"max":1}',
    ])
  } finally {
    mounted.dispose()
  }
})

test('a choice ticks its literals, and a checkbox column picks any, checked or not', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    click(buttonOf('status'))
    await vi.waitFor(() => expect(form()).not.toBeNull())
    const group = form()!.querySelector('[role="group"]')!
    const boxes = [...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.map(box => box.parentElement!.textContent)).toEqual(['Open', 'Doing', 'Done'])
    click(boxes[2]!)
    click(boxes[0]!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't1']))

    click(buttonOf('done'))
    await vi.waitFor(() => expect(form()!.querySelector('[role="radiogroup"]')).not.toBeNull())
    // The status form closed as this one opened, from its own button.
    expect(document.querySelectorAll('#tasks [role="dialog"]')).toHaveLength(1)
    const radios = [...form()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios.map(radio => radio.checked)).toEqual([true, false, false])
    click(radios[2]!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0']))
    expect(mounted.latest().log).toEqual([
      'status={"_tag":"OneOf","options":["Done"]}',
      'status={"_tag":"OneOf","options":["Open","Done"]}',
      'done={"_tag":"Is","checked":false}',
    ])
  } finally {
    mounted.dispose()
  }
})

test('Escape in the form closes it, and Alt+ArrowDown on a header opens it again', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    click(buttonOf('title'))
    await vi.waitFor(() => expect(form()).not.toBeNull())
    keyOn(field('title:filter:text'), 'Escape')
    await vi.waitFor(() => expect(form()).toBeNull())
    // The header the form was opened from is the one focused.
    expect(grid().getAttribute('aria-activedescendant')).toBe(headerOf('title').id)
    keyOn(grid(), 'ArrowDown', { altKey: true })
    await vi.waitFor(() => expect(form()).not.toBeNull())
    // An Escape the grid still has, before the field took focus, closes it first.
    keyOn(grid(), 'Escape')
    await vi.waitFor(() => expect(form()).toBeNull())
    expect(grid().getAttribute('aria-activedescendant')).toBe(headerOf('title').id)
  } finally {
    mounted.dispose()
  }
})

test('a filter written from outside while the form is open is where the next key starts', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    click(buttonOf('title'))
    await vi.waitFor(() => expect(form()).not.toBeNull())
    type(field('title:filter:text'), 'bolt')
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't2']))
    // A synthetic press moves no focus: the form stays open as the application writes.
    click(document.getElementById('write')!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t1']))
    // The form shows what was written, and the key typed next adds to it.
    await vi.waitFor(() => expect(field('title:filter:text').value).toBe('paint'))
    type(field('title:filter:text'), 'paint!')
    await vi.waitFor(() =>
      expect(mounted.latest().log.at(-1)).toBe('title={"_tag":"Contains","text":"paint!"}'),
    )
    expect(field('title:filter:text').value).toBe('paint!')
  } finally {
    mounted.dispose()
  }
})

test('Clear empties a filter written from outside while the form is open', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    click(buttonOf('title'))
    await vi.waitFor(() => expect(form()).not.toBeNull())
    // Nothing typed here: the only filter is the one the application writes.
    click(document.getElementById('write')!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t1']))
    click(form()!.querySelector('button')!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't1', 't2']))
    expect(mounted.latest().log).toEqual(['title=-'])
  } finally {
    mounted.dispose()
  }
})

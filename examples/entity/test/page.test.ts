// @vitest-environment jsdom
/**
 * The drawn page on the real Foldkit runtime, over the in-process server and its
 * SQLite database: Remote's own Subscriptions fetch the lists and the open post,
 * DOM events drive the form, and a save reaches the row.
 */
import { Layer } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterEach, expect, it, vi } from 'vitest'
import { Model, initial, placements, update } from '../src/app.js'
import { openServer } from '../src/server.js'
import { view } from '../src/view.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const element = <E extends HTMLElement>(selector: string): E =>
  document.querySelector(selector) as E
const cells = (): ReadonlyArray<ReadonlyArray<string>> =>
  Array.from(document.querySelectorAll('#posts tbody tr'), row =>
    Array.from(row.querySelectorAll('td'), cell => cell.textContent ?? ''),
  )
const type = (selector: string, value: string) => {
  const input = element<HTMLInputElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const choose = (selector: string, value: string) => {
  const select = element<HTMLSelectElement>(selector)
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

it('lists posts, edits one through the drawn form, and shows the save in the list', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'entity-page'
  document.body.appendChild(container)

  const backend = openServer()
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => ({ model: initial() }),
        update,
        view,
        subscriptions: placements.subscriptions(),
        // In process: the server's handlers are the client's transport.
        resources: Remote.clientLayer(RemoteServer.handlers(backend.server, null)).pipe(
          Layer.provide(backend.layer),
        ),
      }),
    ),
  )
  try {
    // Nothing asked for the list; being on screen made it a requirement.
    await vi.waitFor(() =>
      expect(cells()).toEqual([
        ['p1', 'Notes on the Engine', 'yes'],
        ['p2', 'Compilers', 'no'],
      ]),
    )
    expect(Array.from(document.querySelectorAll('#posts th'), th => th.textContent)).toEqual([
      'id',
      'Title',
      'Published',
    ])

    element('#posts tbody tr:nth-child(2)').click()
    // The form fills from the row's post, and its picker from the author list.
    await vi.waitFor(() =>
      expect(element<HTMLInputElement>('#EditPost-title')?.value).toBe('Compilers'),
    )
    expect(element<HTMLSelectElement>('#EditPost-editorId').value).toBe('a2')
    expect(
      Array.from(element('#EditPost-editorId').querySelectorAll('option'), o => o.textContent),
    ).toEqual(['', 'Ada', 'Grace'])

    type('#EditPost-title', '')
    element('#EditPost-title').dispatchEvent(new Event('blur'))
    await vi.waitFor(() => expect(element('#EditPost-title-error')?.textContent).toBe('Required'))
    expect(element<HTMLButtonElement>('#editor form button').disabled).toBe(true)

    type('#EditPost-title', 'Compilers, revised')
    element('#EditPost-published').click()
    choose('#EditPost-editorId', 'a1')
    await vi.waitFor(() =>
      expect(element<HTMLButtonElement>('#editor form button').disabled).toBe(false),
    )
    element('#editor form').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(element('#status').textContent).toBe('Saved.'))
    expect(backend.row('p2')).toMatchObject({
      headline: 'Compilers, revised',
      published: 1,
      editor_id: 'a1',
    })
    // The list row is the same normalized post, so it changed with no refetch.
    expect(cells()[1]).toEqual(['p2', 'Compilers, revised', 'yes'])

    // Delete asks first, and a no deletes nothing.
    element('#delete').click()
    await vi.waitFor(() => expect(element('#confirm')?.textContent).toBe('Delete p2?'))
    element('#no').click()
    await vi.waitFor(() => expect(element('#delete')).not.toBeNull())
    expect(backend.count('posts')).toBe(2)

    element('#delete').click()
    await vi.waitFor(() => expect(element('#yes')).not.toBeNull())
    element('#yes').click()
    // The server named no list; the row left it, and the editor reads that its post is gone.
    await vi.waitFor(() => expect(cells()).toEqual([['p1', 'Notes on the Engine', 'yes']]))
    expect(backend.count('posts')).toBe(1)
    await vi.waitFor(() => expect(element('#status').textContent).toBe('That post does not exist.'))

    element('#close').click()
    await vi.waitFor(() => expect(element('#editor')).toBeNull())
  } finally {
    handle.dispose()
    backend.close()
  }
})

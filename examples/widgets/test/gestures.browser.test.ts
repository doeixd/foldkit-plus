/**
 * The showcase gestures in a real browser. jsdom lays nothing out and a
 * dispatched click is not a hover, so alignment and the hover-then-click
 * sequence live here.
 */
import { expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

const boxOf = (name: string, role: 'button' | 'menu' = 'button') => {
  const node = page.getByRole(role, { name }).query()
  if (node === null) throw new Error(`no ${role} named ${name}`)
  return node.getBoundingClientRect()
}

test('hover, keys, and a reopened menu behave on the page', async () => {
  const showcase = document.createElement('main')
  showcase.id = 'showcase'
  document.body.append(showcase)
  await import('../src/entry.js')

  const resources = page.getByRole('button', { name: 'Resources' })
  await vi.waitFor(() => expect(resources.query()).not.toBeNull(), { timeout: 10_000 })

  // Hover opens the section. The click that follows must leave it open,
  // under that trigger rather than the first one.
  await resources.hover()
  await vi.waitFor(() =>
    expect(page.getByRole('menu', { name: 'Resources' }).query()).not.toBeNull(),
  )
  await resources.click()
  await vi.waitFor(() => {
    const menu = boxOf('Resources', 'menu')
    const trigger = boxOf('Resources')
    expect(Math.abs(menu.left - trigger.left)).toBeLessThan(8)
    expect(menu.top).toBeGreaterThan(trigger.bottom - 2)
    expect(menu.left).toBeGreaterThan(boxOf('Products').left + 40)
  })
  await page.getByRole('button', { name: 'Docs' }).hover()
  expect(page.getByRole('menu', { name: 'Resources' }).query()).not.toBeNull()

  const commands = page.getByRole('button', { name: 'Commands' })
  await commands.click()
  const search = page.getByRole('searchbox', { name: 'Search commands' })
  await vi.waitFor(() => expect(search.query()).not.toBeNull())
  await search.click()
  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.body.textContent).toContain('Ran: New file.'))

  const edit = page.getByRole('button', { name: 'Edit' })
  await edit.click()
  await page.getByRole('button', { name: 'Copy' }).click()
  await edit.click()
  await vi.waitFor(() =>
    expect(page.getByRole('button', { name: 'Copy' }).query()?.getAttribute('aria-selected')).toBe(
      'true',
    ),
  )
  const editMenu = boxOf('Edit', 'menu')
  const editTrigger = boxOf('Edit')
  expect(Math.abs(editMenu.left - editTrigger.left)).toBeLessThan(8)
  expect(editMenu.left).toBeGreaterThan(boxOf('File').left + 40)

  const ada = page.getByRole('button', { name: 'ada' })
  await ada.hover()
  const about = page.getByRole('dialog', { name: 'About ada' })
  await vi.waitFor(() => expect(about.query()).not.toBeNull())
  await about.hover()
  expect(about.query()).not.toBeNull()

  const notes = page.getByRole('list', { name: 'Files' }).getByText('notes.txt', { exact: true })
  const row = notes.query()?.getBoundingClientRect()
  if (row === undefined) throw new Error('no notes.txt row')
  await notes.click({ button: 'right' })
  await vi.waitFor(() =>
    expect(page.getByRole('menu', { name: 'Actions for notes.txt' }).query()).not.toBeNull(),
  )
  const fileMenu = boxOf('Actions for notes.txt', 'menu')
  const clickX = row.left + row.width / 2
  const clickY = row.top + row.height / 2
  expect(Math.abs(fileMenu.left - clickX)).toBeLessThan(12)
  expect(Math.abs(fileMenu.top - clickY)).toBeLessThan(12)
  expect(Math.abs(fileMenu.left - clickX)).toBeLessThan(Math.abs(fileMenu.left - row.left))
})

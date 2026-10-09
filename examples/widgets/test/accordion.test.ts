import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, SECTIONS, contentId, initial, update } from '../src/accordion/app.js'
import { Accordion, runDemo } from '../src/accordion/view.js'

const panel = (root: ReturnType<typeof Inert.draw>, id: string) => {
  const node = Inert.byTag(root, 'div').find(each => Inert.value(each, 'id') === contentId(id))
  if (node === undefined) throw new Error(`no panel ${id}`)
  return node
}

describe('update flows', () => {
  it('starts shut', () => {
    expect(initial.open).toEqual(Option.none())
  })

  it('opens one section and closes it again', () => {
    const open = update(initial, Message.ToggledSection({ id: 'team' })).model
    expect(open.open).toEqual(Option.some('team'))
    expect(update(open, Message.ToggledSection({ id: 'team' })).model.open).toEqual(Option.none())
  })

  it('opening another replaces the open one', () => {
    const open = update(initial, Message.ToggledSection({ id: 'team' })).model
    expect(update(open, Message.ToggledSection({ id: 'keys' })).model.open).toEqual(
      Option.some('keys'),
    )
  })
})

describe('view structure', () => {
  it('names each content from its trigger and hides the shut bodies', () => {
    const shut = Inert.draw(Accordion, initial)
    expect(Inert.byTag(shut, 'button')).toHaveLength(SECTIONS.length)
    expect(Inert.value(panel(shut, 'team'), 'hidden')).toBe(true)
    const open = Inert.draw(
      Accordion,
      update(initial, Message.ToggledSection({ id: 'team' })).model,
    )
    const trigger = Inert.byLabel(open, 'Team')[0]
    expect(Inert.value(trigger, 'aria-expanded')).toBe('true')
    expect(Inert.value(trigger, 'aria-controls')).toBe(contentId('team'))
    expect(Inert.value(panel(open, 'team'), 'hidden')).toBe(false)
    expect(Inert.value(panel(open, 'billing'), 'hidden')).toBe(true)
    expect(Inert.text(panel(open, 'team'))).toContain('Invite, remove')
    expect(Inert.value(Inert.byLabel(open, 'Billing')[0], 'aria-expanded')).toBe('false')
  })
})

describe('demo', () => {
  it('traces open and close', () => {
    expect(runDemo()).toEqual([
      'start: open=none',
      'opened team: open=team',
      'closed team: open=none',
    ])
  })
})

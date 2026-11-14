/**
 * A view is data. The search field's description is printed into the README by
 * this test, which fails when the two drift (`AUTHORING_WRITE=1` rewrites the
 * block), and the conflict fixture names both contributors of a clash.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { Option } from 'effect'
import { Behavior, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { initialOf, type Message, type Model } from '../src/search/app.js'
import { SearchSlots } from '../src/search/slots.js'
import { SearchField } from '../src/search/view.js'

const README = new URL('../README.md', import.meta.url)
const START = '<!-- authoring:describe-search:start -->'
const END = '<!-- authoring:describe-search:end -->'

/** A class token is a hash of the rules it carries, so a token rename would move every one. */
const printed = (): string =>
  SlotView.toMarkdown(SlotView.describe(SearchField)).replace(/style-[a-z0-9]+/g, 'style-…')

const block = (text: string) => {
  const from = text.indexOf(START)
  const to = text.indexOf(END)
  if (from === -1 || to === -1 || to < from) throw new Error('README.md lacks the describe markers')
  return { from: from + START.length, to }
}

describe('SlotView.describe', () => {
  it("is the README's block of the search field, in order, each attachment by name", () => {
    const text = readFileSync(README, 'utf8')
    const { from, to } = block(text)
    const expected = `\n\n\`\`\`markdown\n${printed()}\n\`\`\`\n\n`
    if (process.env['AUTHORING_WRITE'] === '1')
      writeFileSync(README, text.slice(0, from) + expected + text.slice(to))
    else
      expect(text.slice(from, to), 'run with AUTHORING_WRITE=1 to rewrite the block').toBe(expected)
    expect(SlotView.describe(SearchField).attachments.map(attachment => attachment.name)).toEqual([
      'SearchKeys',
      'Pointing',
      'Collection',
      'FocusRecovery',
      'SearchStyle',
    ])
  })

  it('is plain data: a JSON round trip gives it back, and it needs no input', () => {
    const description = SlotView.describe(SearchField)
    expect(JSON.parse(JSON.stringify(description))).toEqual(description)
  })
})

describe('a second owner of keydown', () => {
  const Stray = Behavior.forSlots(SearchSlots)<Model, Message>(
    {
      input: Behavior.slot({
        attributes: ({ h }) => [h.OnKeyDownPreventDefault(() => Option.none())],
      }),
    },
    { name: 'Stray' },
  )
  const clashing = SearchField.pipe(Behavior.attach(Stray))

  it('is reported by resolution as a finding that names both attachments, where resolving would throw', () => {
    const resolution = SlotView.resolution(clashing, initialOf('s').model)
    const clash = resolution.findings.find(finding => finding.code === 'mixins:event-conflict')
    expect(clash).toMatchObject({ slot: 'input' })
    expect(clash?.details?.['contributors']).toEqual(['SearchKeys', 'Stray'])
    expect(SlotView.describe(clashing).attachments.map(attachment => attachment.name)).toContain(
      'Stray',
    )
  })
})

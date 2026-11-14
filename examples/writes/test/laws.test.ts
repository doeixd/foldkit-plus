// @vitest-environment node
/**
 * The laws of every write the domain declares, checked by enumeration and
 * kept as text in `LAWS.md` with what the Module graph says keeps each: a
 * write added to `domain.ts` changes that file, with no other edit, and this
 * test fails until the change is looked at (`vitest -u` writes it).
 */
import { Laws } from 'foldkit-entity'
import { Module } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { report } from '../src/laws.js'
import { Shop, enumerated, reverted, walked } from './shop.js'

describe('the laws of the declared writes', () => {
  it('are kept as text in LAWS.md, with the evidence for each', async () => {
    const markdown = Module.toMarkdown(Shop, {
      evidence: [...enumerated, ...(await walked()), reverted],
    })
    // Every pair is witnessed: the graph has nothing to report.
    expect(markdown).not.toContain('## Findings')
    const table = markdown.slice(markdown.indexOf('| Law |')).split('\n\n')[0]!
    await expect(
      [
        '# Laws',
        '',
        'What `Laws.check` says of every write `src/domain.ts` declares, written by',
        '`test/laws.test.ts`: run it with `-u` after changing a write, and read the',
        'difference.',
        '',
        '```text',
        Laws.show(report),
        '```',
        '',
        '## Evidence',
        '',
        'What keeps each law against each write that can break it, as `Module.toMarkdown`',
        "says with the evidence `test/shop.ts` gathers: the check's records, the walk of",
        '`Sell` and `Restock` through the server, and one line for the refused revert.',
        '',
        table,
        '',
      ].join('\n'),
    ).toMatchFileSnapshot('../LAWS.md')
  }, 60_000)

  it('prove a publish leaves a draft published, find a revert from published refused, and a sale held InStock where it commits', () => {
    expect(report.findings.map(finding => ({ ...finding }))).toEqual([
      { _tag: 'Holds', entity: 'Product', write: 'Publish', from: 'Draft', to: 'Published' },
      {
        _tag: 'Refused',
        entity: 'Product',
        write: 'Revert',
        from: 'Published',
        to: 'Draft',
        invariant: 'publishedStaysPublished',
      },
      { _tag: 'Undeclared', entity: 'Product', write: 'Revert', from: 'Archived', to: 'Draft' },
      { _tag: 'Enforced', entity: 'Product', write: 'Sell', to: 'InStock' },
      { _tag: 'Unreached', entity: 'Product', state: 'Archived' },
    ])
  })
})

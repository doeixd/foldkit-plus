/**
 * The laws of every write the domain declares, checked by enumeration and
 * kept as text in `LAWS.md`: a write added to `domain.ts` changes that file,
 * with no other edit, and this test fails until the change is looked at
 * (`vitest -u` writes it).
 */
import { Laws, type WriteEntry } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import * as Domain from '../src/domain.js'

/** Every declared write the domain exports, whatever it is named. */
const writes = Object.values(Domain).filter(
  (value): value is WriteEntry & typeof value =>
    typeof value === 'object' && value !== null && 'write' in value && value.write !== undefined,
)

describe('the laws of the declared writes', () => {
  const report = Laws.check({ writes })

  it('are kept as text in LAWS.md', async () => {
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
      ].join('\n'),
    ).toMatchFileSnapshot('../LAWS.md')
  })

  it('prove a publish leaves a draft published, and find a revert from published refused', () => {
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
      { _tag: 'Unreached', entity: 'Product', state: 'Archived' },
    ])
  })
})

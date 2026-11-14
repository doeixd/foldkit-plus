/** `Imported.show`: a description as Markdown, for a file kept beside the Api and compared by a test. */
import { Option } from 'effect'
import { Footprint } from 'foldkit-entity'
import type { ImportedDescription, OperationDescription } from './describe.js'

const code = (words: ReadonlyArray<string>): string =>
  words.length === 0 ? 'nothing' : words.map(word => `\`${word}\``).join(', ')

const json = (value: unknown): string =>
  ['```json', JSON.stringify(value, null, 2), '```'].join('\n')

const footprintLine = (operation: OperationDescription): string =>
  Footprint.$match(operation.footprint, {
    Derived: ({ reads, writes }) =>
      `Footprint: derived from its declared write. Reads ${code(reads)}; writes ${code(writes)}.`,
    Declared: ({ entity, reads, writes, by }) =>
      `Footprint: declared by ${by}, of ${entity}. Reads ${code(reads)}; writes ${code(writes)}.`,
    Unknown: () =>
      'Footprint: unknown. It may write any member of its Entity, so no list is judged unaffected by it.',
  })

const operation = (each: OperationDescription): string =>
  [
    `### ${each.id}`,
    '',
    `Command, sent as the mutation \`${each.mutation}\`.`,
    ...Option.match(each.description, {
      onNone: () => [],
      onSome: said => ['', said],
    }),
    '',
    footprintLine(each),
    '',
    'Input:',
    '',
    json(each.input),
    '',
    ...Option.match(each.reply, {
      onNone: () => ['Reply: none, only the receipt.'],
      onSome: reply => ['Reply:', '', json(reply)],
    }),
    ...(each.rejections.length === 0
      ? []
      : [
          '',
          'Rejections:',
          '',
          ...each.rejections.flatMap(rejection => [
            `- \`${rejection.tag}\`${Option.match(rejection.field, {
              onNone: () => '',
              onSome: field => `, shown beside \`${field}\``,
            })}`,
            '',
            json(rejection.schema)
              .split('\n')
              .map(line => `  ${line}`)
              .join('\n'),
            '',
          ]),
        ]),
    '',
  ].join('\n')

/**
 * The Markdown of `description`: one section per command and one line per
 * View. It holds no time and no path, so the same Api writes the same text.
 */
export const show = (description: ImportedDescription): string =>
  [
    `# ${description.api}`,
    '',
    'What `Imported.describe` says of the Domain Api bound into Remote: its commands as',
    'mutations, and its Views as the Entities they serve.',
    '',
    '## Commands',
    '',
    ...description.operations.map(operation),
    '## Views',
    '',
    ...description.reads.map(
      read =>
        `- ${read.id}: serves \`${read.entity}\` (${code(read.fields)}), ordered by \`${read.revision}\`.`,
    ),
    '',
  ].join('\n')

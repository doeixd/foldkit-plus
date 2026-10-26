/**
 * The money, decimal and percent recipes, broken in turn:
 * `pnpm mutate packages/form-recipes/test/amounts.mutations.ts`.
 */
const index = '../src/index.ts'
const number = '../src/number.ts'
const tests = ['packages/form-recipes/test/money.test.ts']

export default [
  {
    name: 'an amount of money is shown as String(value)',
    edits: [
      {
        file: index,
        find: "      onSome: amount => writeAmount(amount, data.locale ?? 'en', currencyOf(data)),\n    }),\n  unparsed: 'Enter an amount',",
        replace: "      onSome: () => String(value),\n    }),\n  unparsed: 'Enter an amount',",
      },
    ],
    tests,
  },
  {
    name: 'a typed amount is not scaled to minor units',
    edits: [
      {
        file: index,
        find: '${sign}${digits.whole}${digits.fraction}',
        replace: '${sign}${digits.whole}',
      },
    ],
    tests,
  },
  {
    name: 'a money draft is read in English whatever its locale',
    edits: [
      {
        file: index,
        find: "        readDigits(\n          draft,\n          data.locale ?? 'en',\n          currencyOf(data),",
        replace:
          "        readDigits(\n          draft,\n          'en',\n          currencyOf(data),",
      },
    ],
    tests,
  },
  {
    name: 'grouping is taken however it falls',
    edits: [
      {
        file: number,
        find: 'if (digits !== whole && symbols.grouped.format(BigInt(digits)) !== whole) return Option.none()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'more decimals than the scale are taken',
    edits: [{ file: number, find: 'fraction.length > scale', replace: 'false' }],
    tests,
  },
  {
    name: 'a minus is taken where an amount may not be negative',
    edits: [{ file: number, find: 'if (signed && !negative) return Option.none()', replace: '' }],
    tests,
  },
  {
    name: 'an amount past what an integer holds exactly is taken',
    edits: [
      {
        file: index,
        find: 'return Number.isSafeInteger(minor) ? Option.some<unknown>(minor) : Option.none()',
        replace: 'return Option.some<unknown>(minor)',
      },
    ],
    tests,
  },
  {
    name: 'the separators come from a format that may show no decimal',
    edits: [
      {
        file: number,
        find: 'separators.find(part => part.type === type)?.value',
        replace: 'parts.find(part => part.type === type)?.value',
      },
    ],
    tests,
  },
  {
    name: 'a share is stored as its points',
    edits: [
      {
        file: index,
        find: "Match.when('fraction', () => shifted(points, 2)),",
        replace: "Match.when('fraction', () => points),",
      },
    ],
    tests,
  },
  {
    name: 'a decimal that would round is shown rounded',
    edits: [
      {
        file: index,
        find: 'return Number(text) === value ? Option.some(text) : Option.none()',
        replace: 'return Option.some(text)',
      },
    ],
    tests,
  },
  {
    name: 'a negative amount gets a keypad with no minus',
    edits: [
      { file: '../src/html.ts', find: "negative === true ? 'text'", replace: "false ? 'text'" },
    ],
    tests,
  },
]

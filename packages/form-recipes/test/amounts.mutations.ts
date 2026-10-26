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
        find: 'if (digits !== whole && symbols.grouped(digits) !== whole) return Option.none()',
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
    name: 'the separators come from a plain number, not the field’s format',
    edits: [
      {
        file: number,
        find: 'const of = (type: Intl.NumberFormatPartTypes) => parts.find(part => part.type === type)?.value',
        replace:
          "const of = (type: Intl.NumberFormatPartTypes) => new Intl.NumberFormat(locale, { numberingSystem: 'latn', minimumFractionDigits: 1 }).formatToParts(1234567.5).find(part => part.type === type)?.value",
      },
    ],
    tests,
  },
  {
    name: 'a share is stored as its points',
    edits: [
      {
        file: index,
        find: 'exact(decimalText(shifted(points, 2)), (data.scale ?? 2) + 2),',
        replace: 'exact(decimalText(points), data.scale ?? 2),',
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
  {
    name: 'bidi marks are read as part of the amount',
    edits: [{ file: number, find: ".replace(invisible, '')", replace: '' }],
    tests,
  },
  {
    name: 'a percentage is grouped as its format scales it',
    edits: [
      {
        file: number,
        find: "...(options.style === 'percent' ? { style: 'decimal' } : {}),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a space inside an amount is dropped where none groups',
    edits: [
      {
        file: number,
        find: 'else if (spaces.test(text)) return Option.none()',
        replace: "else text = text.replace(allSpaces, '')",
      },
    ],
    tests,
  },
  {
    name: 'a symbol is taken anywhere in the amount',
    edits: [
      {
        file: number,
        find: 'if (text.startsWith(affix)) {',
        replace:
          "if (text.includes(affix)) { text = text.split(affix).join('') }\n      if (text.startsWith(affix)) {",
      },
    ],
    tests,
  },
  {
    name: 'the keyboard’s apostrophe is not the Swiss group',
    edits: [
      {
        file: number,
        find: 'text = text.replace(apostrophes, symbols.group)',
        replace: 'text = text',
      },
    ],
    tests,
  },
  {
    name: 'a decimal is taken however a double rounds it',
    edits: [
      {
        file: index,
        find: 'return Option.contains(fixed(value, scale), text) ? Option.some(value) : Option.none()',
        replace: 'return Option.some(value)',
      },
    ],
    tests,
  },
  {
    name: 'a scale is not checked when the recipe is made',
    edits: [
      {
        file: index,
        find: 'if (!Number.isInteger(scale) || scale < 0 || scale > most)',
        replace: 'if (false)',
      },
    ],
    tests: ['packages/form-recipes/test/text.test.ts'],
  },
]

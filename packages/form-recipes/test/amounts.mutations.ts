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
        find: '? Option.map(digitsOf(plainOf(value), scale), decimalText)',
        replace: '? Option.some(value.toFixed(scale))',
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
    edits: [{ file: number, find: ".replace(bidi, '')", replace: '' }],
    tests,
  },
  {
    name: 'a percentage is grouped as its format scales it',
    edits: [{ file: number, find: "(options.style === 'percent'", replace: '(false' }],
    tests,
  },
  {
    name: 'a percentage is grouped as a plain number',
    edits: [
      { file: number, find: "(options.style === 'percent'", replace: '(false' },
      {
        file: number,
        find: 'useGrouping: true,',
        replace: "useGrouping: true, ...(options.style === 'percent' ? { style: 'decimal' } : {}),",
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
        find: 'const affix = symbols.affixes.find(',
        replace:
          "for (const held of symbols.affixes) text = text.split(held).join('')\n  const affix = symbols.affixes.find(",
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
  {
    name: 'the whole draft is folded, superscripts to digits',
    edits: [
      {
        file: number,
        find: ".replace(fullWidth, form => form.normalize('NFKC'))",
        replace: ".normalize('NFKC')",
      },
    ],
    tests,
  },
  {
    name: 'a symbol is taken at both ends',
    edits: [
      {
        file: number,
        find: 'text = (text.startsWith(affix) ? text.slice(affix.length) : text.slice(0, -affix.length)).trim()',
        replace: "text = text.split(affix).join('').trim()",
      },
    ],
    tests,
  },
  {
    name: 'a currency must be one Intl lists as current',
    edits: [
      {
        file: index,
        find: 'if (!/^[A-Z]{3}$/.test(options.currency))',
        replace: "if (!Intl.supportedValuesOf('currency').includes(options.currency))",
      },
    ],
    tests,
  },
]

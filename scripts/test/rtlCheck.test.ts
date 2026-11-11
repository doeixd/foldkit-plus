// @vitest-environment node
/**
 * The check for physical directions in styles. The refused lines are the
 * shapes this repository's styles once held; the kept ones are the logical
 * spellings and marked physical ones it holds today.
 */
import { expect, test } from 'vitest'
import { physicalFindings } from '../rtl-check.mjs'

const style = (body: string) => `import { Style } from 'foldkit-mixins'; Style.self({})\n${body}\n`

test.each([
  ["marginLeft: '1rem',", 'physical margin, padding or border side'],
  ["Style.media(NARROW, { marginRight: '-12px' }),", 'physical margin, padding or border side'],
  ['paddingLeft: t.space.lg,', 'physical margin, padding or border side'],
  ["borderRight: '1px solid red',", 'physical margin, padding or border side'],
  ["borderBottomLeftRadius: '0',", 'physical margin, padding or border side'],
  ["'margin-left': '1rem',", 'physical margin, padding or border side'],
  ["textAlign: 'left',", 'physical text-align or float'],
  ["numericCell: { textAlign: 'right' },", 'physical text-align or float'],
  ["float: 'left',", 'physical text-align or float'],
  ["left: '0',", 'left/right offset'],
  ['right: t.space.md,', 'left/right offset'],
  ['left: `calc(50% - ${edge})`,', 'left/right offset'],
  ["transform: 'translateX(-50%)',", 'translateX'],
])('refuses %s', (line, what) => {
  expect(physicalFindings(style(`const a = {\n  ${line}\n}`))).toEqual([{ line: 3, what }])
})

test.each([
  "marginInlineStart: '1rem',",
  "textAlign: 'start',",
  "float: 'inline-start',",
  "insetInlineEnd: '0',",
  "borderEndStartRadius: '0',",
  'readonly left: number',
  "toward: 'left',",
  "left: Style.inline({ flexGrow: '1' }),",
  "placement: 'left',",
])('keeps %s', line => {
  expect(physicalFindings(style(`const a = {\n  ${line}\n}`))).toEqual([])
})

test('a marker on the line above covers the declarations after it, up to the object end', () => {
  const text = style(
    [
      'const a = {',
      '  // physical: a pointer coordinate',
      "  top: '0',",
      "  left: '0',",
      '}',
      'const b = {',
      "  left: '0',",
      '}',
    ].join('\n'),
  )
  expect(physicalFindings(text)).toEqual([{ line: 8, what: 'left/right offset' }])
})

test('a marker does not reach past a blank line or an opening brace', () => {
  const text = style(
    [
      '// physical: above the object',
      'const a = {',
      "  left: '0',",
      '}',
      '// physical: above a gap',
      '',
      'const b = { top: 0 }',
      "const c = { left: '0' }",
    ].join('\n'),
  )
  expect(physicalFindings(text).map(finding => finding.line)).toEqual([4, 9])
})

test('a marker at the end of the line covers that line', () => {
  expect(physicalFindings(style("const a = { left: '0' } // physical: the pointer's x"))).toEqual(
    [],
  )
})

test('a marker must say physical', () => {
  expect(physicalFindings(style("// centered\nconst a = { left: '0' }"))).toHaveLength(1)
})

test('a comment that names a property is not a declaration', () => {
  expect(physicalFindings(style("// marginLeft: '1rem' was physical\n/** left: '0' */"))).toEqual(
    [],
  )
})

test('a file that is no style file is not read', () => {
  expect(physicalFindings("const a = { left: '0', marginLeft: '1px' }\n")).toEqual([])
})

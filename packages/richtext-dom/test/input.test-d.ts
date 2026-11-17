/**
 * The key's type of `richTextInput`: a Document without a codec, the codec's type with one, and a
 * codec whose two sides disagree is refused.
 */
import * as RichText from 'foldkit-richtext'
import { richTextInput } from '../src/input.js'

type ValueOf<Control> = Control extends {
  readonly data: { readonly value: (model: never) => infer Value }
}
  ? NonNullable<Value>
  : never
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const same = <A, B>(_: Equal<A, B>) => undefined

const plain = richTextInput('a')
same<ValueOf<typeof plain>, RichText.Document>(true)

const text = richTextInput(
  'b',
  {},
  {
    codec: {
      value: (document: RichText.Document) => String(document.children.length),
      fill: (_stored: string) => RichText.decodeDocument({ version: 1, children: [] }),
    },
  },
)
same<ValueOf<typeof text>, string>(true)

richTextInput(
  'c',
  {},
  {
    codec: {
      // @ts-expect-error value gives a number where fill takes a string
      value: (document: RichText.Document) => document.children.length,
      fill: (_stored: string) => RichText.decodeDocument({ version: 1, children: [] }),
    },
  },
)

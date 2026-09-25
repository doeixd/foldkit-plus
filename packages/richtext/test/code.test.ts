/**
 * Code tokenizers (§124 §7, §130): a `CodeBlock`'s text read as decorations, with the token's
 * own name in the decoration's kind and in its data.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make

const codeBlock = (language?: string, text = 'let x = 1') =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'code',
        props: language === undefined ? {} : { language },
        children: [{ type: 'Text', id: 'code-t', text, marks: [] }],
      },
    ],
  })

/** Names one word, so these assertions are about the producer rather than about a grammar. */
const words = (language: string, ...named: ReadonlyArray<string>): RichText.CodeTokenizer => ({
  language,
  tokenize: text => {
    const tokens: Array<RichText.CodeToken> = []
    for (const word of named) {
      const at = text.indexOf(word)
      if (at >= 0) tokens.push({ from: at, to: at + word.length, kind: word })
    }
    return tokens
  },
})

describe('reading a code block as decorations', () => {
  it('names the token in the decoration’s kind and in its data', () => {
    expect(
      RichText.codeDecorations(codeBlock('plain', 'let x = 1'), [words('plain', 'let')]),
    ).toEqual([
      {
        from: { node: id('code-t'), offset: 0, affinity: 'before' },
        to: { node: id('code-t'), offset: 3, affinity: 'before' },
        kind: 'syntax-let',
        data: { token: 'let' },
      },
    ])
  })

  it('reads a token that spans two runs as one decoration', () => {
    const split = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'code',
          props: { language: 'plain' },
          children: [
            { type: 'Text', id: 'first', text: 'le', marks: [] },
            { type: 'Text', id: 'second', text: 't x', marks: [] },
          ],
        },
      ],
    })
    expect(RichText.codeDecorations(split, [words('plain', 'let')])[0]).toMatchObject({
      from: { node: id('first'), offset: 0 },
      to: { node: id('second'), offset: 1 },
      kind: 'syntax-let',
    })
  })

  it('leaves a block alone when no tokenizer names its language, or it has none', () => {
    expect(RichText.codeDecorations(codeBlock('other'), [words('plain', 'let')])).toEqual([])
    expect(RichText.codeDecorations(codeBlock(), [words('plain', 'let')])).toEqual([])
  })

  it('reads only code blocks, whatever else carries a language', () => {
    // A kind that is not code, holding runs and a `language` prop of its own: the kind decides.
    const notCode = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'pt', text: 'let', marks: [] }],
        },
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: { language: 'plain' },
          children: [{ type: 'Text', id: 'ct', text: 'let', marks: [] }],
        },
      ],
    })
    expect(RichText.codeDecorations(notCode, [words('plain', 'let')])).toEqual([])
  })

  it('skips a token whose range does not land in the block', () => {
    const beyond: RichText.CodeTokenizer = {
      language: 'plain',
      tokenize: () => [{ from: 99, to: 100, kind: 'x' }],
    }
    const empty: RichText.CodeTokenizer = {
      language: 'plain',
      tokenize: () => [{ from: 0, to: 0, kind: 'x' }],
    }
    expect(RichText.codeDecorations(codeBlock('plain'), [beyond])).toEqual([])
    expect(RichText.codeDecorations(codeBlock('plain'), [empty])).toEqual([])
  })
})

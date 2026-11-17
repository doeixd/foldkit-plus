/**
 * The code block grammars, in a module of their own so the page imports them after it starts: a
 * highlighter holds every grammar it is given (TypeScript's alone is 180 kB), and no block of
 * code is in the first screen. The highlighter is synchronous because decorating is a pure
 * call the editor makes on every patch; loading its grammars is this module's one cost.
 */
import { shikiTokenizers } from 'foldkit-richtext-code-shiki'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import css from 'shiki/langs/css.mjs'
import json from 'shiki/langs/json.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import githubLight from 'shiki/themes/github-light.mjs'

export const tokenizers = shikiTokenizers(
  createHighlighterCoreSync({
    themes: [githubLight],
    langs: [typescript, json, css],
    engine: createJavaScriptRegexEngine(),
  }),
)

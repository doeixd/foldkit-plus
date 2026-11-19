import { Option } from 'effect'
import { Badge, CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Tag = Recipes.Badge.style({ size: 'sm' })

const problems = new Map([
  [2, { kind: 'error', text: 'name is never read' }],
  [3, { kind: 'warning', text: 'prefer const' }],
])

// A checker's findings: each line it flagged is marked by severity, and
// `lineAction` puts the finding at the line's end, here a Badge.
export default example({
  title: 'Diagnostics',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  view: ({ style, h }) =>
    CodeBlock.view(
      {
        code: 'function greet() {\n  const name = "Ada"\n  let greeting = "Hello"\n  return greeting\n}',
        title: 'greet.ts',
        lineNumbers: true,
        marks: Array.from(problems, ([line, problem]) => ({ line, kind: problem.kind })),
        lineAction: line =>
          Option.map(Option.fromUndefinedOr(problems.get(line)), problem =>
            Badge.view(
              {
                text: problem.text,
                tone: problem.kind === 'error' ? 'danger' : 'warning',
                style: Tag,
              },
              h,
            ),
          ),
        style,
      },
      h,
    ),
})

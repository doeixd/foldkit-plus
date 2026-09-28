/**
 * Tag branching the type checker cannot vouch for, in every package's source:
 *
 * - a `_tag` compared with `===`/`!==` where its type is not a union of string
 *   literals (`string`, `unknown`), so any misspelling compiles;
 * - a `_tag` read through a cast, which makes a promise nothing enforces;
 * - a `switch` on `_tag` that neither lists every variant nor ends in a
 *   `never` default, so a new variant falls through silently;
 * - two or more sibling `if` statements testing one value's `_tag`, which is
 *   a hand-written match with the same hole.
 *
 * Branch through the union's own `match`, Effect `Match`, or a typed guard
 * (`SchemaAST.isUnion`); see "Tag branching" in AGENTS.md. A tag that is open
 * by design, such as another application's Message at a boundary, is marked on
 * the line above with `// tag-check: open` and the reason.
 *
 *   node scripts/tags-check.mjs     list findings; exit 1 if there are any
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const findings = []

const isTagAccess = node => ts.isPropertyAccessExpression(node) && node.name.text === '_tag'
const literalTags = type =>
  (type.isUnion() ? type.types : [type]).every(
    member => member.isStringLiteral() || (member.flags & ts.TypeFlags.Undefined) !== 0,
  )
const unwrap = node => {
  let inner = node
  while (ts.isParenthesizedExpression(inner) || ts.isNonNullExpression(inner)) {
    inner = inner.expression
  }
  return inner
}

const check = (program, files) => {
  const checker = program.getTypeChecker()
  for (const file of files) {
    const source = program.getSourceFile(file)
    const text = source.getFullText()
    const lineOf = node => source.getLineAndCharacterOfPosition(node.getStart()).line
    const marked = node => {
      const lines = text.split('\n')
      const line = lineOf(node)
      return [lines[line], lines[line - 1]].some(l => l?.includes('tag-check: open'))
    }
    const report = (node, what) => {
      if (marked(node)) return
      findings.push(`${relative(root, file)}:${lineOf(node) + 1}  ${what}`)
    }
    const visit = node => {
      if (isTagAccess(node)) {
        const subject = unwrap(node.expression)
        if (ts.isAsExpression(subject) || ts.isTypeAssertionExpression(subject)) {
          report(node, `_tag read through a cast: ${node.getText().slice(0, 60)}`)
        } else {
          const parent = node.parent
          const compared =
            ts.isBinaryExpression(parent) &&
            (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
              parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
          const type = checker.getTypeAtLocation(node)
          if (compared && !literalTags(type)) {
            report(
              node,
              `_tag typed ${checker.typeToString(type)}: ${parent.getText().slice(0, 60)}`,
            )
          }
        }
      }
      if (ts.isSwitchStatement(node) && isTagAccess(node.expression)) {
        const type = checker.getTypeAtLocation(node.expression)
        const variants = (type.isUnion() ? type.types : [type])
          .filter(member => member.isStringLiteral())
          .map(member => member.value)
        const listed = new Set(
          node.caseBlock.clauses
            .filter(ts.isCaseClause)
            .map(clause => (ts.isStringLiteral(clause.expression) ? clause.expression.text : '')),
        )
        const fallback = node.caseBlock.clauses.find(ts.isDefaultClause)
        const missing = variants.filter(variant => !listed.has(variant))
        const exhaustive = fallback !== undefined && /\bnever\b|absurd/.test(fallback.getText())
        if ((missing.length > 0 || variants.length === 0) && !exhaustive) {
          report(
            node,
            `switch on ${node.expression.getText()} misses ${missing.join(', ') || 'its variants'}`,
          )
        }
      }
      if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isCaseClause(node)) {
        const runs = new Map()
        for (const statement of node.statements) {
          if (!ts.isIfStatement(statement)) continue
          const subjects = new Set()
          const collect = expression => {
            if (!ts.isBinaryExpression(expression)) return
            if (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
              collect(expression.left)
              collect(expression.right)
            } else if (
              expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
              isTagAccess(expression.left) &&
              ts.isStringLiteral(expression.right)
            ) {
              subjects.add(expression.left.expression.getText())
            }
          }
          for (let branch = statement; branch !== undefined;) {
            collect(branch.expression)
            branch =
              branch.elseStatement && ts.isIfStatement(branch.elseStatement)
                ? branch.elseStatement
                : undefined
          }
          for (const subject of subjects)
            runs.set(subject, [...(runs.get(subject) ?? []), statement])
        }
        for (const [subject, statements] of runs) {
          if (statements.length >= 2)
            report(statements[0], `${statements.length} ifs on ${subject}._tag`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}

for (const name of readdirSync(join(root, 'packages')).sort()) {
  const config = join(root, 'packages', name, 'tsconfig.json')
  if (!existsSync(config)) continue
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    },
  )
  const sources = join(root, 'packages', name, 'src')
  const files = parsed?.fileNames.filter(file => file.startsWith(sources)) ?? []
  if (files.length === 0) continue
  const program = ts.createProgram({
    rootNames: files,
    options: { ...parsed.options, noEmit: true },
  })
  check(program, files)
}

for (const finding of findings) console.log(finding)
if (findings.length > 0) {
  console.error(
    `\n${findings.length} tag branches the checker cannot vouch for. See "Tag branching" in AGENTS.md.`,
  )
  process.exit(1)
}

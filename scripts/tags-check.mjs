/**
 * Tag branching the type checker cannot vouch for, in every package's and example's `src`:
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
 * the line above it (or above the statement holding it) with `// tag-check: open`
 * and the reason.
 *
 * A `_tag` read into a variable (`const tag = x._tag`), through a local
 * function that returns one, or passed as an argument into a local function's
 * parameter, is followed: its comparisons, `switch`es, sibling `if`s and
 * ternaries are held to the same rules, and an `if`/`else` or ternary on it is
 * a two-arm match the checker cannot see.
 *
 * So is a ternary or an `if`/`else` whose condition compares `x._tag` itself to
 * a literal (`===`, `!==`, either way round, alone or inside `&&`/`||`), even on
 * a precisely typed union: use the union's `match`. Allowed: a lone `if` without
 * `else` (a narrowing guard or early return), and a comparison used as a value,
 * such as the predicate of `filter`/`find`/`some`, which selects rows and does
 * not branch. Only the condition of a `?:` or `if`/`else` is held to this.
 *
 *   node scripts/tags-check.mjs     list findings; exit 1 if there are any
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// The compiler API, which TypeScript 7 no longer ships: 6 is installed beside it.
import ts from 'typescript-6'

const root = fileURLToPath(new URL('..', import.meta.url))
export const findings = []

const isTagAccess = node => ts.isPropertyAccessExpression(node) && node.name.text === '_tag'
const literalTags = type =>
  (type.isUnion() ? type.types : [type]).every(
    member => member.isStringLiteral() || (member.flags & ts.TypeFlags.Undefined) !== 0,
  )
// A `_tag` of text (or of nothing known): a field called `_tag` that holds an object is no tag.
const tagLike = type =>
  (type.isUnion() ? type.types : [type]).every(
    member =>
      (member.flags &
        (ts.TypeFlags.StringLike |
          ts.TypeFlags.Undefined |
          ts.TypeFlags.Null |
          ts.TypeFlags.Unknown |
          ts.TypeFlags.Any)) !==
      0,
  )
const unwrap = node => {
  let inner = node
  while (ts.isParenthesizedExpression(inner) || ts.isNonNullExpression(inner)) {
    inner = inner.expression
  }
  return inner
}

const isStrictEquality = kind =>
  kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
  kind === ts.SyntaxKind.ExclamationEqualsEqualsToken

// The symbols in one file that carry a `_tag` value: variables initialised from
// one, local functions that return one, and parameters such a value is passed to.
const followTags = (checker, source) => {
  const variables = new Set()
  const functions = new Set()
  const symbolOf = node => checker.getSymbolAtLocation(node)
  const functionOf = symbol => {
    const declaration = symbol?.valueDeclaration
    if (declaration === undefined) return undefined
    if (ts.isFunctionDeclaration(declaration)) return declaration
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer))
    )
      return declaration.initializer
    return undefined
  }
  const derived = expression => {
    const inner = unwrap(expression)
    if (isTagAccess(inner)) return tagLike(checker.getTypeAtLocation(inner))
    if (ts.isAsExpression(inner) || ts.isTypeAssertionExpression(inner))
      return derived(inner.expression)
    if (ts.isIdentifier(inner)) return variables.has(symbolOf(inner))
    if (ts.isCallExpression(inner)) {
      const callee = unwrap(inner.expression)
      return ts.isIdentifier(callee) && functions.has(symbolOf(callee))
    }
    if (ts.isConditionalExpression(inner))
      return derived(inner.whenTrue) || derived(inner.whenFalse)
    if (ts.isBinaryExpression(inner)) {
      const kind = inner.operatorToken.kind
      if (
        kind === ts.SyntaxKind.QuestionQuestionToken ||
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.AmpersandAmpersandToken
      )
        return derived(inner.left) || derived(inner.right)
    }
    return false
  }
  // What a function hands back: its returned expressions, and the functions
  // handed to a call there (`Option.match(read, { onSome: x => x._tag })`).
  const yields = expression => {
    if (derived(expression)) return true
    const inner = unwrap(expression)
    if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) return returnsTag(inner)
    if (ts.isObjectLiteralExpression(inner))
      return inner.properties.some(
        property =>
          (ts.isPropertyAssignment(property) && yields(property.initializer)) ||
          (ts.isMethodDeclaration(property) && returnsTag(property)),
      )
    return (
      ts.isCallExpression(inner) &&
      inner.arguments.some(argument => !derived(argument) && yields(argument))
    )
  }
  const returnsTag = fn => {
    if (fn.body === undefined) return false
    if (!ts.isBlock(fn.body)) return yields(fn.body)
    let found = false
    const walk = node => {
      if (ts.isFunctionLike(node)) return
      if (ts.isReturnStatement(node) && node.expression !== undefined && yields(node.expression))
        found = true
      ts.forEachChild(node, walk)
    }
    walk(fn.body)
    return found
  }
  const add = (set, symbol) => {
    if (symbol === undefined || set.has(symbol)) return false
    set.add(symbol)
    return true
  }
  for (let changed = true; changed;) {
    changed = false
    const walk = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const symbol = symbolOf(node.name)
        const fn = functionOf(symbol)
        if (fn !== undefined ? returnsTag(fn) : derived(node.initializer))
          changed = add(fn !== undefined ? functions : variables, symbol) || changed
      }
      if (ts.isFunctionDeclaration(node) && node.name && returnsTag(node))
        changed = add(functions, symbolOf(node.name)) || changed
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression)
        const fn = ts.isIdentifier(callee) ? functionOf(symbolOf(callee)) : undefined
        node.arguments.forEach((argument, index) => {
          const parameter = fn?.parameters[index]
          if (parameter && ts.isIdentifier(parameter.name) && derived(argument))
            changed = add(variables, symbolOf(parameter.name)) || changed
        })
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
  }
  // A tag held by a name or a call, not read as `x._tag` right here.
  const held = expression => {
    const inner = unwrap(expression)
    return !isTagAccess(inner) && derived(inner)
  }
  return { held }
}

export const check = (program, files, found = findings) => {
  const checker = program.getTypeChecker()
  for (const file of files) {
    const source = program.getSourceFile(file)
    const { held } = followTags(checker, source)
    const text = source.getFullText()
    const lineOf = node => source.getLineAndCharacterOfPosition(node.getStart()).line
    const lines = text.split('\n')
    const markedAt = node => {
      const line = lineOf(node)
      return [lines[line], lines[line - 1]].some(l => l?.includes('tag-check: open'))
    }
    // A mark covers the statement under it, so one stands over a condition that spans lines.
    const marked = node => {
      let statement = node
      while (
        statement.parent !== undefined &&
        !ts.isBlock(statement.parent) &&
        !ts.isSourceFile(statement.parent) &&
        !ts.isCaseClause(statement.parent) &&
        !ts.isDefaultClause(statement.parent)
      )
        statement = statement.parent
      return markedAt(node) || markedAt(statement)
    }
    const report = (node, what) => {
      if (marked(node)) return
      found.push(`${relative(root, file)}:${lineOf(node) + 1}  ${what}`)
    }
    const comparesHeld = expression => {
      const inner = unwrap(expression)
      if (!ts.isBinaryExpression(inner)) return false
      const kind = inner.operatorToken.kind
      if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.AmpersandAmpersandToken)
        return comparesHeld(inner.left) || comparesHeld(inner.right)
      return isStrictEquality(kind) && (held(inner.left) || held(inner.right))
    }
    // `x._tag === 'A'` (or `!==`, either way round) in a condition: a branch on a tag read right here.
    const comparesDirect = expression => {
      const inner = unwrap(expression)
      if (!ts.isBinaryExpression(inner)) return false
      const kind = inner.operatorToken.kind
      if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.AmpersandAmpersandToken)
        return comparesDirect(inner.left) || comparesDirect(inner.right)
      const literal = side => ts.isStringLiteralLike(unwrap(side))
      return (
        isStrictEquality(kind) &&
        ((isTagAccess(unwrap(inner.left)) && literal(inner.right)) ||
          (isTagAccess(unwrap(inner.right)) && literal(inner.left)))
      )
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
      if (ts.isSwitchStatement(node) && (isTagAccess(node.expression) || held(node.expression))) {
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
      if (ts.isBinaryExpression(node) && isStrictEquality(node.operatorToken.kind)) {
        const side = held(node.left) ? node.left : held(node.right) ? node.right : undefined
        if (side !== undefined) {
          const type = checker.getTypeAtLocation(side)
          if (!literalTags(type))
            report(
              node,
              `tag held as ${checker.typeToString(type)}: ${node.getText().slice(0, 60)}`,
            )
        }
      }
      if (ts.isConditionalExpression(node)) {
        const what = comparesHeld(node.condition)
          ? 'a held tag'
          : comparesDirect(node.condition)
            ? 'a tag'
            : undefined
        if (what !== undefined)
          report(node, `ternary on ${what}: ${node.condition.getText().slice(0, 60)}`)
      }
      if (
        ts.isIfStatement(node) &&
        node.elseStatement !== undefined &&
        !(ts.isIfStatement(node.parent) && node.parent.elseStatement === node) &&
        (comparesHeld(node.expression) || comparesDirect(node.expression))
      )
        report(
          node,
          `if/else on ${comparesHeld(node.expression) ? 'a held tag' : 'a tag'}: ${node.expression.getText().slice(0, 60)}`,
        )
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
              subjects.add(`${expression.left.expression.getText()}._tag`)
            } else if (
              expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
              held(expression.left) &&
              ts.isStringLiteral(expression.right)
            ) {
              subjects.add(expression.left.getText())
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
            report(statements[0], `${statements.length} ifs on ${subject}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}

const main = () => {
  const projectDirs = [
    ...['packages', 'examples', 'examples/foldkit'].flatMap(parent =>
      readdirSync(join(root, parent), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(root, parent, entry.name)),
    ),
  ].sort()

  for (const dir of projectDirs) {
    const config = join(dir, 'tsconfig.json')
    if (!existsSync(config)) continue
    const parsed = ts.getParsedCommandLineOfConfigFile(
      config,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => {},
      },
    )
    // TypeScript lists files with `/`; `join` writes `\` on Windows, where a
    // raw comparison matched nothing and the check passed having read no file.
    const sources = join(dir, 'src')
    const files = parsed?.fileNames.filter(file => resolve(file).startsWith(sources)) ?? []
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

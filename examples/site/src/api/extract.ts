/**
 * Reads a package's public API from its entry points with the TypeScript
 * checker: what each entry exports, with its doc comment and a readable
 * declaration. One Program serves every package, so a type shared between
 * packages is checked once.
 */
import { readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

import { Option } from 'effect'
import * as prettier from 'prettier'
import ts from 'typescript'

import type { ApiExport, ApiMember, ApiModule, ApiPackage } from './model.js'

/** One subpath export of a package, read from its `foldkit-plus:source` condition. */
export interface Entry {
  readonly specifier: string
  readonly slug: string
  /** Absolute. */
  readonly file: string
}

export interface PackageSource {
  readonly name: string
  readonly dir: string
  readonly version: string
  readonly entries: ReadonlyArray<Entry>
}

const sourceCondition = 'foldkit-plus:source'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The package in `packageDir` and its entry points; none for a private package. */
export const packageSource = (packageDir: string): Option.Option<PackageSource> => {
  const manifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (!isRecord(manifest) || manifest['private'] === true) return Option.none()
  const { name, version, exports } = manifest
  if (typeof name !== 'string' || typeof version !== 'string' || !isRecord(exports)) {
    throw new Error(`${packageDir}/package.json has no name, version or exports`)
  }
  const entries = Object.entries(exports).flatMap(([subpath, target]) => {
    const file = isRecord(target) ? target[sourceCondition] : undefined
    if (typeof file !== 'string' || !file.endsWith('.ts')) return []
    return [
      {
        specifier: subpath === '.' ? name : name + subpath.slice(1),
        slug: subpath === '.' ? 'index' : subpath.slice(2).replaceAll('/', '-'),
        file: join(packageDir, file),
      },
    ]
  })
  return Option.some({ name, version, dir: basename(packageDir), entries })
}

/** The repository's compiler options, resolving workspace packages to their source. */
export const compilerOptionsOf = (root: string): ts.CompilerOptions => {
  const path = join(root, 'tsconfig.base.json')
  const { config, error } = ts.readConfigFile(path, ts.sys.readFile)
  if (error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'))
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root, undefined, path)
  return { ...options, customConditions: [sourceCondition], noEmit: true, plugins: [] }
}

/** The longest a type the checker writes may be before it is cut: Effect's can run to pages. */
const typeLimit = 1500

const cap = (text: string): string =>
  text.length > typeLimit ? `${text.slice(0, typeLimit)} …` : text

type Doc = Pick<ApiExport, 'summary' | 'tags' | 'params'>

const noDoc: Doc = { summary: '', tags: [], params: [] }

const entityName = (name: ts.EntityName | ts.JSDocMemberName): string =>
  ts.isIdentifier(name)
    ? name.text
    : ts.isQualifiedName(name)
      ? `${entityName(name.left)}.${name.right.text}`
      : `${entityName(name.left)}#${name.right.text}`

const linkText = (link: ts.JSDocLink | ts.JSDocLinkCode | ts.JSDocLinkPlain): string => {
  const name = link.name === undefined ? '' : entityName(link.name)
  // `{@link https://…}` parses as the name `https` and the text `://…`.
  if (link.text.startsWith('://')) return name + link.text
  const label = link.text.replace(/^\s*\|/, '').trim()
  return label === '' ? `\`${name}\`` : label
}

const commentText = (comment: string | ts.NodeArray<ts.JSDocComment> | undefined): string =>
  comment === undefined
    ? ''
    : typeof comment === 'string'
      ? comment
      : comment
          .map(part =>
            ts.isJSDocLink(part) || ts.isJSDocLinkCode(part) || ts.isJSDocLinkPlain(part)
              ? linkText(part)
              : part.text,
          )
          .join('')

/** The doc comment nearest `node`; none when it has none. */
const docOf = (node: ts.Node): Option.Option<Doc> => {
  const doc = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc).at(-1)
  if (doc === undefined) return Option.none()
  const tags: Array<Doc['tags'][number]> = []
  const params: Array<Doc['params'][number]> = []
  for (const tag of doc.tags ?? []) {
    const text = commentText(tag.comment).trim()
    if (ts.isJSDocParameterTag(tag)) {
      params.push({ name: entityName(tag.name), summary: text.replace(/^-\s*/, '') })
    } else if (!ts.isJSDocReturnTag(tag)) {
      tags.push({ name: tag.tagName.text, text })
    }
  }
  return Option.some({ summary: commentText(doc.comment).trim(), tags, params })
}

const firstDoc = (nodes: ReadonlyArray<ts.Node>): Doc =>
  Option.getOrElse(Option.firstSomeOf(nodes.map(docOf)), () => noDoc)

/** The entry file's own comment: a doc comment that does not belong to its first statement. */
const fileSummary = (file: ts.SourceFile): string => {
  const text = file.getFullText()
  const comments = (ts.getLeadingCommentRanges(text, 0) ?? []).filter(range =>
    text.startsWith('/**', range.pos),
  )
  const first = comments[0]
  if (first === undefined) return ''
  const statement = file.statements[0]
  const ownsIt =
    comments.length === 1 &&
    statement !== undefined &&
    !ts.isImportDeclaration(statement) &&
    !ts.isExportDeclaration(statement)
  if (ownsIt) return ''
  return text
    .slice(first.pos + 3, first.end - 2)
    .split('\n')
    .map(line => line.replace(/^\s*\* ?/, ''))
    .join('\n')
    .replace(/\{@link(?:code|plain)?\s+([^}|\s]+)\s*(?:\|\s*([^}]*))?\}/g, (_, name, label) =>
      label === undefined || label.trim() === '' ? `\`${name}\`` : label.trim(),
    )
    .trim()
}

const sourceOf = (root: string, node: ts.Node): ApiExport['source'] => {
  const file = node.getSourceFile()
  return {
    file: relative(root, file.fileName).replaceAll('\\', '/'),
    line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
  }
}

const unwrap = (expression: ts.Expression): ts.Expression =>
  ts.isAsExpression(expression) ||
  ts.isSatisfiesExpression(expression) ||
  ts.isParenthesizedExpression(expression) ||
  ts.isTypeAssertionExpression(expression)
    ? unwrap(expression.expression)
    : expression

const dropped = new Set([
  ts.SyntaxKind.ExportKeyword,
  ts.SyntaxKind.DefaultKeyword,
  ts.SyntaxKind.DeclareKeyword,
  ts.SyntaxKind.AsyncKeyword,
])

const keptModifiers = (node: ts.HasModifiers): Array<ts.ModifierLike> | undefined => {
  const kept = (ts.getModifiers(node) ?? []).filter(modifier => !dropped.has(modifier.kind))
  return kept.length === 0 ? undefined : kept
}

const isHidden = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    modifier =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  )

type Shape = 'declaration' | 'member'

type FunctionLike =
  ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration

/** Reads one Program's declarations into the reference's shapes. */
const reader = (root: string, checker: ts.TypeChecker) => {
  const printer = ts.createPrinter({ removeComments: true })
  const flags =
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  const print = (node: ts.Node, file: ts.SourceFile): string =>
    printer.printNode(ts.EmitHint.Unspecified, node, file)
  // The checker's text stands in for a type node; the printer writes an identifier verbatim.
  const typeNode = (type: ts.Type, at: ts.Node): ts.TypeNode =>
    ts.factory.createTypeReferenceNode(cap(checker.typeToString(type, at, flags)))

  const resolve = (symbol: ts.Symbol): ts.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

  const parameter = (node: ts.ParameterDeclaration): ts.ParameterDeclaration =>
    ts.factory.updateParameterDeclaration(
      node,
      keptModifiers(node),
      node.dotDotDotToken,
      node.name,
      node.initializer === undefined
        ? node.questionToken
        : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      node.type ?? typeNode(checker.getTypeAtLocation(node), node),
      undefined,
    )

  const returnType = (node: FunctionLike): ts.TypeNode | undefined => {
    if (node.type !== undefined) return node.type
    const signature = checker.getSignatureFromDeclaration(node)
    return signature === undefined
      ? undefined
      : typeNode(checker.getReturnTypeOfSignature(signature), node)
  }

  /**
   * One line per overload, from the declarations' own text where written: a
   * `declaration` is `function name(…): R`, a namespace's `member` is
   * `name(…): R`, as its object's type holds it (so `in` is a fine name).
   */
  const functionText = (name: string, nodes: ReadonlyArray<FunctionLike>, shape: Shape): string => {
    const overloads = nodes.filter(node => node.body === undefined)
    return (overloads.length > 0 ? overloads : nodes)
      .map(node =>
        print(
          shape === 'member'
            ? ts.factory.createMethodSignature(
                undefined,
                name,
                undefined,
                node.typeParameters,
                node.parameters.map(parameter),
                returnType(node),
              )
            : ts.factory.createFunctionDeclaration(
                undefined,
                undefined,
                name,
                node.typeParameters,
                node.parameters.map(parameter),
                returnType(node),
                undefined,
              ),
          node.getSourceFile(),
        ),
      )
      .join('\n')
  }

  /** `const name: T` or a member's `name: T`, from the annotation where written. */
  const constText = (name: string, node: ts.Node, symbol: ts.Symbol, shape: Shape): string => {
    const type =
      ts.isVariableDeclaration(node) && node.type !== undefined
        ? node.type
        : typeNode(checker.getTypeOfSymbolAtLocation(symbol, node), node)
    return print(
      shape === 'member'
        ? ts.factory.createPropertySignature(undefined, name, undefined, type)
        : ts.factory.createVariableStatement(
            undefined,
            ts.factory.createVariableDeclarationList(
              [ts.factory.createVariableDeclaration(name, undefined, type)],
              ts.NodeFlags.Const,
            ),
          ),
      node.getSourceFile(),
    )
  }

  /** A type-level declaration printed whole, without comments or `export`. */
  const typeText = (node: ts.Declaration): string => {
    const file = node.getSourceFile()
    if (ts.isInterfaceDeclaration(node)) {
      return print(
        ts.factory.updateInterfaceDeclaration(
          node,
          keptModifiers(node),
          node.name,
          node.typeParameters,
          node.heritageClauses,
          node.members,
        ),
        file,
      )
    }
    if (ts.isTypeAliasDeclaration(node)) {
      return print(
        ts.factory.updateTypeAliasDeclaration(
          node,
          keptModifiers(node),
          node.name,
          node.typeParameters,
          node.type,
        ),
        file,
      )
    }
    if (ts.isEnumDeclaration(node)) {
      return print(
        ts.factory.updateEnumDeclaration(node, keptModifiers(node), node.name, node.members),
        file,
      )
    }
    if (ts.isClassDeclaration(node)) {
      return print(
        ts.factory.createClassDeclaration(
          keptModifiers(node),
          node.name,
          node.typeParameters,
          node.heritageClauses,
          [],
        ),
        file,
      )
    }
    return print(node, file)
  }

  /** A class member as its instance type would hold it: no body, no initializer. */
  const classMemberText = (member: ts.ClassElement, name: ts.PropertyName): string =>
    print(
      ts.isMethodDeclaration(member)
        ? ts.factory.createMethodSignature(
            undefined,
            name,
            member.questionToken,
            member.typeParameters,
            member.parameters.map(parameter),
            returnType(member),
          )
        : ts.factory.createPropertySignature(
            ts.isPropertyDeclaration(member)
              ? ts
                  .getModifiers(member)
                  ?.filter(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)
              : undefined,
            name,
            ts.isPropertyDeclaration(member) ? member.questionToken : undefined,
            ts.isPropertyDeclaration(member) && member.type !== undefined
              ? member.type
              : typeNode(checker.getTypeAtLocation(member), member),
          ),
      member.getSourceFile(),
    )

  /** A class's or interface's public, named members. */
  const typeMembers = (node: ts.ClassDeclaration | ts.InterfaceDeclaration): Array<ApiMember> =>
    node.members.flatMap((member: ts.ClassElement | ts.TypeElement): Array<ApiMember> => {
      const name = member.name
      if (name === undefined || ts.isPrivateIdentifier(name) || isHidden(member)) return []
      return [
        {
          name: name.getText(),
          kind:
            ts.isMethodDeclaration(member) || ts.isMethodSignature(member) ? 'method' : 'property',
          ...Option.getOrElse(docOf(member), () => noDoc),
          signature: ts.isClassElement(member)
            ? classMemberText(member, name)
            : print(member, member.getSourceFile()),
          source: sourceOf(root, member),
        },
      ]
    })

  /**
   * A namespace object's members: each property, a spread's properties in its
   * place, and one level of nested objects under dotted names. An identifier
   * reads the declaration it names, unless the property has a doc of its own.
   */
  const objectMembers = (
    literal: ts.ObjectLiteralExpression,
    prefix: string,
    depth: number,
  ): Array<ApiMember> => {
    const members = new Map<string, Array<ApiMember>>()
    for (const property of literal.properties) {
      if (ts.isSpreadAssignment(property)) {
        const target = declarationOf(property.expression)
        const spread = Option.flatMap(target, objectLiteralOf)
        if (Option.isSome(spread)) {
          for (const member of objectMembers(spread.value, prefix, depth)) {
            members.set(member.name, [member])
          }
        }
        continue
      }
      if (
        !(
          ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property) ||
          ts.isMethodDeclaration(property)
        ) ||
        ts.isComputedPropertyName(property.name)
      ) {
        continue
      }
      const name = prefix + property.name.getText()
      members.set(name, memberOf(property, name, depth))
    }
    return [...members.values()].flat()
  }

  /** The declaration an expression names, through imports and re-exports. */
  const declarationOf = (expression: ts.Expression): Option.Option<ts.Declaration> => {
    const symbol = checker.getSymbolAtLocation(expression)
    return Option.fromUndefinedOr(
      symbol === undefined ? undefined : resolve(symbol).valueDeclaration,
    )
  }

  const objectLiteralOf = (node: ts.Node): Option.Option<ts.ObjectLiteralExpression> => {
    if (ts.isObjectLiteralExpression(node)) return Option.some(node)
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const value = unwrap(node.initializer)
      if (ts.isObjectLiteralExpression(value)) return Option.some(value)
    }
    return Option.none()
  }

  const memberOf = (
    property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment | ts.MethodDeclaration,
    name: string,
    depth: number,
  ): Array<ApiMember> => {
    const own = docOf(property)
    const leaf = name.split('.').at(-1) ?? name
    const at = (
      node: ts.Node,
      kind: ApiMember['kind'],
      signature: string,
      doc: Doc,
    ): ApiMember => ({
      name,
      kind,
      ...Option.getOrElse(own, () => doc),
      signature,
      source: sourceOf(root, node),
    })
    if (ts.isMethodDeclaration(property)) {
      return [at(property, 'function', functionText(leaf, [property], 'member'), noDoc)]
    }
    const value = ts.isShorthandPropertyAssignment(property)
      ? property.name
      : unwrap(property.initializer)
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
      return [at(property, 'function', functionText(leaf, [value], 'member'), noDoc)]
    }
    // An object of functions reads as a namespace; an object of data, by its type.
    const nested = (
      literal: ts.ObjectLiteralExpression,
      node: ts.Node,
      self: ts.Symbol,
      doc: Doc,
    ): Array<ApiMember> =>
      literal.properties.some(
        inner =>
          inner.name !== undefined &&
          checker.getTypeAtLocation(inner.name).getCallSignatures().length > 0,
      )
        ? [
            at(node, 'const', `const ${leaf} = { ${objectNames(literal)} }`, doc),
            ...(depth < 2 ? objectMembers(literal, `${name}.`, depth + 1) : []),
          ]
        : [at(node, 'const', constText(leaf, node, self, 'member'), doc)]
    if (ts.isObjectLiteralExpression(value)) {
      const self = checker.getSymbolAtLocation(property.name)
      return self === undefined ? [] : nested(value, property, self, noDoc)
    }
    const symbol = ts.isShorthandPropertyAssignment(property)
      ? checker.getShorthandAssignmentValueSymbol(property)
      : ts.isIdentifier(value) || ts.isPropertyAccessExpression(value)
        ? checker.getSymbolAtLocation(value)
        : undefined
    const target = symbol === undefined ? undefined : resolve(symbol)
    const declarations = target?.declarations ?? []
    // A value that shares its name with a type: the value is what the property holds.
    const first = target?.valueDeclaration ?? declarations[0]
    // A property of something else (a schema's `literals`) is read where it is placed.
    const described =
      first !== undefined &&
      (ts.isFunctionDeclaration(first) ||
        ts.isVariableDeclaration(first) ||
        ts.isClassDeclaration(first))
    if (target === undefined || !described) {
      const self = checker.getSymbolAtLocation(property.name)
      return self === undefined
        ? []
        : [at(property, 'const', constText(leaf, property, self, 'member'), noDoc)]
    }
    const functions = declarations.filter(ts.isFunctionDeclaration)
    if (functions.length > 0) {
      return [at(first, 'function', functionText(leaf, functions, 'member'), firstDoc(functions))]
    }
    if (
      ts.isVariableDeclaration(first) &&
      first.type === undefined &&
      first.initializer !== undefined
    ) {
      const initial = unwrap(first.initializer)
      if (ts.isArrowFunction(initial) || ts.isFunctionExpression(initial)) {
        return [at(first, 'function', functionText(leaf, [initial], 'member'), firstDoc([first]))]
      }
      if (ts.isObjectLiteralExpression(initial)) {
        return nested(initial, first, target, firstDoc([first]))
      }
    }
    if (ts.isClassDeclaration(first)) {
      return [at(first, 'class', typeText(first), firstDoc([first]))]
    }
    return [at(first, 'const', constText(leaf, first, target, 'member'), firstDoc([first]))]
  }

  const objectNames = (literal: ts.ObjectLiteralExpression): string =>
    literal.properties
      .flatMap(property =>
        ts.isSpreadAssignment(property)
          ? [`...${property.expression.getText()}`]
          : property.name === undefined
            ? []
            : [property.name.getText()],
      )
      .join(', ')

  /** `export * as Name from '…'`, from the alias chain that reached a module. */
  const moduleText = (name: string, exported: ts.Symbol): string => {
    const declaration = exported.declarations?.find(
      node => ts.isNamespaceExport(node) || ts.isNamespaceImport(node),
    )
    const from =
      declaration !== undefined && ts.isNamespaceExport(declaration)
        ? declaration.parent.moduleSpecifier
        : declaration !== undefined && ts.isNamespaceImport(declaration)
          ? declaration.parent.parent.moduleSpecifier
          : undefined
    return from === undefined
      ? `namespace ${name} {}`
      : `export * as ${name} from ${from.getText()}`
  }

  const valueKinds = [
    ts.SyntaxKind.SourceFile,
    ts.SyntaxKind.ModuleDeclaration,
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.ClassDeclaration,
    ts.SyntaxKind.EnumDeclaration,
    ts.SyntaxKind.VariableDeclaration,
  ]

  /** One exported name; none for a symbol with no declaration to read. */
  const exportOf = (exported: ts.Symbol, depth: number): Option.Option<ApiExport> => {
    const name = exported.getName()
    const symbol = resolve(exported)
    const declarations = symbol.declarations ?? []
    const types = declarations.filter(
      node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
    )
    const value = declarations.find(node => valueKinds.includes(node.kind))
    const primary = value ?? types[0]
    if (primary === undefined) return Option.none()
    const shared = {
      name,
      slug: '',
      source: sourceOf(root, primary),
      typeSignature:
        value !== undefined && types.length > 0
          ? Option.some(types.map(typeText).join('\n'))
          : Option.none<string>(),
    }
    if (ts.isSourceFile(primary) || ts.isModuleDeclaration(primary)) {
      const members =
        depth > 0
          ? []
          : checker
              .getExportsOfModule(symbol)
              .flatMap(member => Option.toArray(exportOf(member, depth + 1)))
              .map(asMember)
              .sort(byName)
      return Option.some({
        ...shared,
        kind: 'namespace',
        ...(ts.isSourceFile(primary)
          ? { ...noDoc, summary: fileSummary(primary) }
          : firstDoc([primary])),
        signature: moduleText(name, exported),
        members,
      })
    }
    if (ts.isFunctionDeclaration(primary)) {
      const functions = declarations.filter(ts.isFunctionDeclaration)
      return Option.some({
        ...shared,
        kind: 'function',
        ...firstDoc([...functions, ...types]),
        signature: functionText(name, functions, 'declaration'),
        members: [],
      })
    }
    if (ts.isVariableDeclaration(primary)) {
      const doc = firstDoc([primary, ...types])
      const initial = primary.initializer === undefined ? undefined : unwrap(primary.initializer)
      if (
        primary.type === undefined &&
        initial !== undefined &&
        (ts.isArrowFunction(initial) || ts.isFunctionExpression(initial))
      ) {
        return Option.some({
          ...shared,
          kind: 'function',
          ...doc,
          signature: functionText(name, [initial], 'declaration'),
          members: [],
        })
      }
      if (initial !== undefined && ts.isObjectLiteralExpression(initial)) {
        return Option.some({
          ...shared,
          kind: 'namespace',
          ...doc,
          signature: `const ${name} = { ${objectNames(initial)} }`,
          members: objectMembers(initial, '', 1),
        })
      }
      return Option.some({
        ...shared,
        kind: 'const',
        ...doc,
        signature: constText(name, primary, symbol, 'declaration'),
        members: [],
      })
    }
    const kind = ts.isClassDeclaration(primary)
      ? 'class'
      : ts.isEnumDeclaration(primary)
        ? 'enum'
        : ts.isInterfaceDeclaration(primary)
          ? 'interface'
          : 'type'
    return Option.some({
      ...shared,
      kind,
      ...firstDoc([primary, ...types]),
      signature:
        kind === 'type' || kind === 'interface'
          ? types.map(typeText).join('\n')
          : typeText(primary),
      members:
        ts.isClassDeclaration(primary) || ts.isInterfaceDeclaration(primary)
          ? typeMembers(primary)
          : [],
    })
  }

  const asMember = (raw: ApiExport): ApiMember => ({
    name: raw.name,
    kind: raw.kind === 'namespace' ? 'const' : raw.kind,
    summary: raw.summary,
    signature: raw.signature,
    tags: raw.tags,
    params: raw.params,
    source: raw.source,
  })

  return { exportOf }
}

const byName = <A extends { readonly name: string }>(a: A, b: A): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || (a.name < b.name ? -1 : 1)

/** Lowercase and URL-safe; a name that differs from another only in case gets `-2`, `-3`, … */
const slugged = <A extends { readonly name: string }>(
  exports: ReadonlyArray<A>,
): Array<A & { readonly slug: string }> => {
  const taken = new Map<string, number>()
  return exports.map(entry => {
    const base = entry.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const count = (taken.get(base) ?? 0) + 1
    taken.set(base, count)
    return { ...entry, slug: count === 1 ? base : `${base}-${count}` }
  })
}

const prettierOptions: prettier.Options = {
  parser: 'typescript',
  printWidth: 80,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'avoid',
}

const tryFormat = async (text: string): Promise<Option.Option<string>> => {
  try {
    return Option.some((await prettier.format(text, prettierOptions)).trim())
  } catch {
    return Option.none()
  }
}

/**
 * Formats a declaration or a lone member, trying it as written, as an ambient
 * declaration, then inside an interface; the raw text when none parses.
 */
const format = async (text: string): Promise<string> => {
  const plain = await tryFormat(text)
  if (Option.isSome(plain)) return plain.value
  const ambient = await tryFormat(`declare ${text}`)
  if (Option.isSome(ambient)) return ambient.value.replace(/^declare /gm, '')
  const member = await tryFormat(`interface __ {\n${text}\n}`)
  if (Option.isSome(member)) {
    return member.value
      .split('\n')
      .slice(1, -1)
      .map(line => line.replace(/^ {2}/, ''))
      .join('\n')
  }
  return text.trim()
}

const formatted = async <A extends { readonly signature: string }>(entry: A): Promise<A> => ({
  ...entry,
  signature: await format(entry.signature),
})

/** Every package's API, from one Program over all their entry points. */
export const extract = async (
  root: string,
  packages: ReadonlyArray<PackageSource>,
  options: ts.CompilerOptions,
): Promise<Array<ApiPackage>> => {
  const program = ts.createProgram(
    packages.flatMap(source => source.entries.map(entry => entry.file)),
    options,
  )
  const checker = program.getTypeChecker()
  const { exportOf } = reader(root, checker)

  const moduleOf = async (entry: Entry): Promise<ApiModule> => {
    const file = program.getSourceFile(entry.file)
    const symbol = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    if (file === undefined || symbol === undefined) {
      throw new Error(`${entry.file} is not a module the program read`)
    }
    const raws = checker
      .getExportsOfModule(symbol)
      .flatMap(exported => Option.toArray(exportOf(exported, 0)))
      .sort(byName)
    const exports: Array<ApiExport> = []
    for (const raw of slugged(raws)) {
      const members: Array<ApiMember> = []
      for (const member of raw.members) members.push(await formatted(member))
      exports.push({
        ...(await formatted(raw)),
        typeSignature: Option.isSome(raw.typeSignature)
          ? Option.some(await format(raw.typeSignature.value))
          : raw.typeSignature,
        members,
      })
    }
    return { specifier: entry.specifier, slug: entry.slug, summary: fileSummary(file), exports }
  }

  const result: Array<ApiPackage> = []
  for (const source of packages) {
    const modules: Array<ApiModule> = []
    for (const entry of source.entries) modules.push(await moduleOf(entry))
    result.push({ name: source.name, dir: source.dir, version: source.version, modules })
  }
  return result
}

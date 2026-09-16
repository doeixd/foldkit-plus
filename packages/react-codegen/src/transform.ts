import ts from 'typescript'
import { TAGS } from './tags.js'

const f = ts.factory

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly fileName: string
  readonly line: number
  readonly column: number
}

export type TransformResult =
  | { readonly ok: true; readonly code: string; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> }

export const DiagnosticCode = {
  UnsupportedBuilder: 'FKREACT0001',
  UnsupportedAttribute: 'FKREACT0002',
  DynamicAttributes: 'FKREACT0003',
  EscapedBuilder: 'FKREACT0004',
  UnsupportedAttributeArgument: 'FKREACT0005',
} as const

/** Foldkit attributes that are the same DOM attribute or property under a React prop name. */
const PROPS: Readonly<Record<string, string>> = {
  Key: 'key',
  Class: 'className',
  Id: 'id',
  Title: 'title',
  Lang: 'lang',
  Dir: 'dir',
  Hidden: 'hidden',
  Tabindex: 'tabIndex',
  Value: 'value',
  Checked: 'checked',
  Selected: 'selected',
  Open: 'open',
  Placeholder: 'placeholder',
  Name: 'name',
  Disabled: 'disabled',
  Readonly: 'readOnly',
  Required: 'required',
  Autofocus: 'autoFocus',
  Multiple: 'multiple',
  Type: 'type',
  Pattern: 'pattern',
  Maxlength: 'maxLength',
  Minlength: 'minLength',
  Min: 'min',
  Max: 'max',
  Step: 'step',
  Rows: 'rows',
  Cols: 'cols',
  For: 'htmlFor',
  Href: 'href',
  Src: 'src',
  Alt: 'alt',
  Target: 'target',
  Rel: 'rel',
  Role: 'role',
  Width: 'width',
  Height: 'height',
  ViewBox: 'viewBox',
  Xmlns: 'xmlns',
  Fill: 'fill',
  Stroke: 'stroke',
  StrokeWidth: 'strokeWidth',
  D: 'd',
  Cx: 'cx',
  Cy: 'cy',
  R: 'r',
  X: 'x',
  Y: 'y',
  Points: 'points',
  Transform: 'transform',
  Opacity: 'opacity',
}

/** Foldkit events that dispatch a fixed Message, by React handler name. */
const MESSAGE_EVENTS: Readonly<Record<string, string>> = {
  OnClick: 'onClick',
  OnDoubleClick: 'onDoubleClick',
  OnMouseDown: 'onMouseDown',
  OnMouseUp: 'onMouseUp',
  OnMouseEnter: 'onMouseEnter',
  OnMouseLeave: 'onMouseLeave',
  OnMouseOver: 'onMouseOver',
  OnMouseOut: 'onMouseOut',
  OnFocus: 'onFocus',
  OnBlur: 'onBlur',
}

const DISPATCH = 'dispatch'

const isHtmlType = (node: ts.Node) =>
  ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'Html'

const reactNodeType = () => f.createTypeReferenceNode('ReactNode')

const kebabToCamel = (name: string) =>
  name.startsWith('--')
    ? name
    : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

const ariaName = (name: string) =>
  `aria-${name.slice('Aria'.length).replace(/[A-Z]/g, (letter, index: number) => `${index === 0 ? '' : '-'}${letter.toLowerCase()}`)}`

const isBuilderParameter = (parameter: ts.ParameterDeclaration) =>
  parameter.type !== undefined &&
  ts.isTypeReferenceNode(parameter.type) &&
  ts.isIdentifier(parameter.type.typeName) &&
  parameter.type.typeName.text === 'HtmlBuilder' &&
  ts.isIdentifier(parameter.name)

type ViewFunction = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

const isViewFunction = (node: ts.Node): node is ViewFunction =>
  (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
  node.parameters.some(isBuilderParameter)

/**
 * Compiles every Foldkit view function in a module (any function with an
 * `HtmlBuilder` parameter) to a function returning React elements, taking
 * `dispatch` where it took `h`. Fails with diagnostics rather than emitting
 * code for a construct it cannot translate with the same meaning.
 */
export const transformSourceFile = (fileName: string, sourceText: string): TransformResult => {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const diagnostics: Array<Diagnostic> = []
  const report = (node: ts.Node, code: string, message: string) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
    diagnostics.push({ code, message, fileName, line: line + 1, column: character + 1 })
  }
  let converted = false

  const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
    const visitView = (view: ViewFunction): ts.Node => {
      const builderParameter = view.parameters.find(isBuilderParameter)!
      const builder = (builderParameter.name as ts.Identifier).text
      converted = true

      const attribute = (node: ts.Expression): ts.JsxAttribute | undefined => {
        if (
          !ts.isCallExpression(node) ||
          !ts.isPropertyAccessExpression(node.expression) ||
          !ts.isIdentifier(node.expression.expression) ||
          node.expression.expression.text !== builder
        ) {
          report(
            node,
            DiagnosticCode.DynamicAttributes,
            `Write each attribute inline as ${builder}.Name(...): a computed attribute cannot be lowered to a JSX prop.`,
          )
          return undefined
        }
        const name = node.expression.name.text
        const args = node.arguments.map(argument => visit(argument) as ts.Expression)
        const prop = (propName: string, value: ts.Expression) =>
          f.createJsxAttribute(
            f.createIdentifier(propName),
            f.createJsxExpression(undefined, value),
          )
        const handler = (body: ts.ConciseBody, parameter?: string) =>
          f.createArrowFunction(
            undefined,
            undefined,
            parameter === undefined
              ? []
              : [f.createParameterDeclaration(undefined, undefined, parameter)],
            undefined,
            f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            body,
          )
        const dispatch = (message: ts.Expression) =>
          f.createCallExpression(f.createIdentifier(DISPATCH), undefined, [message])

        const mapped = PROPS[name]
        if (mapped !== undefined && args.length === 1) return prop(mapped, args[0]!)
        if (name.startsWith('Aria') && name.length > 4 && args.length === 1) {
          return prop(ariaName(name), args[0]!)
        }
        const event = MESSAGE_EVENTS[name]
        if (event !== undefined) {
          if (args.length !== 1) {
            report(
              node,
              DiagnosticCode.UnsupportedAttributeArgument,
              `${builder}.${name} with options has no React equivalent yet; pass only the Message.`,
            )
            return undefined
          }
          return prop(event, handler(dispatch(args[0]!)))
        }
        if (name === 'OnInput' && args.length === 1) {
          // React's onChange on a text control is the native input event, and keeps a controlled value warning-free.
          const value = f.createPropertyAccessExpression(
            f.createPropertyAccessExpression(f.createIdentifier('event'), 'currentTarget'),
            'value',
          )
          return prop(
            'onChange',
            handler(
              dispatch(
                f.createCallExpression(f.createParenthesizedExpression(args[0]!), undefined, [
                  value,
                ]),
              ),
              'event',
            ),
          )
        }
        if (name === 'OnSubmit' && args.length === 1) {
          const preventDefault = f.createExpressionStatement(
            f.createCallExpression(
              f.createPropertyAccessExpression(f.createIdentifier('event'), 'preventDefault'),
              undefined,
              [],
            ),
          )
          return prop(
            'onSubmit',
            handler(
              f.createBlock(
                [preventDefault, f.createExpressionStatement(dispatch(args[0]!))],
                true,
              ),
              'event',
            ),
          )
        }
        if ((name === 'Attribute' || name === 'DataAttribute') && args.length === 2) {
          const key = node.arguments[0]!
          if (!ts.isStringLiteralLike(key)) {
            report(
              key,
              DiagnosticCode.UnsupportedAttributeArgument,
              `${builder}.${name} needs a string literal name to become a JSX prop.`,
            )
            return undefined
          }
          const propName = name === 'DataAttribute' ? `data-${key.text}` : key.text
          return prop(propName, args[1]!)
        }
        if (name === 'Style' && args.length === 1) {
          const style = node.arguments[0]!
          if (!ts.isObjectLiteralExpression(style)) {
            report(
              style,
              DiagnosticCode.UnsupportedAttributeArgument,
              `${builder}.Style needs an object literal, so its CSS property names can be converted for React.`,
            )
            return undefined
          }
          const properties: Array<ts.ObjectLiteralElementLike> = []
          for (const property of style.properties) {
            if (
              !ts.isPropertyAssignment(property) ||
              !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            ) {
              report(
                property,
                DiagnosticCode.UnsupportedAttributeArgument,
                `${builder}.Style properties must be plain \`name: value\` entries.`,
              )
              return undefined
            }
            const cssName = kebabToCamel(property.name.text)
            properties.push(
              f.createPropertyAssignment(
                /^[A-Za-z_$][\w$]*$/.test(cssName)
                  ? f.createIdentifier(cssName)
                  : f.createStringLiteral(cssName),
                visit(property.initializer) as ts.Expression,
              ),
            )
          }
          return prop('style', f.createObjectLiteralExpression(properties))
        }
        report(
          node,
          DiagnosticCode.UnsupportedAttribute,
          `${builder}.${name} cannot be compiled to standalone React JSX. Use foldkit-react's runtime interop, or write this element in React.`,
        )
        return undefined
      }

      const child = (node: ts.Expression): ts.JsxChild => {
        if (
          ts.isStringLiteralLike(node) &&
          !/[{}<>]/.test(node.text) &&
          node.text.trim() === node.text
        ) {
          return f.createJsxText(node.text)
        }
        const tag = elementTag(node)
        if (tag !== undefined) return element(node as ts.CallExpression, tag)
        if (ts.isSpreadElement(node))
          return f.createJsxExpression(undefined, visit(node.expression) as ts.Expression)
        return f.createJsxExpression(undefined, visit(node) as ts.Expression)
      }

      const elementTag = (node: ts.Node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === builder &&
        TAGS.has(node.expression.name.text)
          ? node.expression.name.text
          : undefined

      const element = (
        call: ts.CallExpression,
        tag: string,
      ): ts.JsxElement | ts.JsxSelfClosingElement => {
        const [attributesArgument, childrenArgument] = call.arguments
        const attributes: Array<ts.JsxAttribute> = []
        if (attributesArgument !== undefined) {
          if (ts.isArrayLiteralExpression(attributesArgument)) {
            for (const entry of attributesArgument.elements) {
              const lowered = attribute(entry)
              if (lowered) attributes.push(lowered)
            }
          } else {
            report(
              attributesArgument,
              DiagnosticCode.DynamicAttributes,
              `Pass ${builder}.${tag}'s attributes as an array literal so each can be lowered to a JSX prop.`,
            )
          }
        }
        const children =
          childrenArgument === undefined
            ? []
            : ts.isArrayLiteralExpression(childrenArgument)
              ? childrenArgument.elements.map(child)
              : [f.createJsxExpression(undefined, visit(childrenArgument) as ts.Expression)]
        const name = f.createIdentifier(tag)
        const props = f.createJsxAttributes(attributes)
        return children.length === 0
          ? f.createJsxSelfClosingElement(name, undefined, props)
          : f.createJsxElement(
              f.createJsxOpeningElement(name, undefined, props),
              children,
              f.createJsxClosingElement(name),
            )
      }

      const visit = (node: ts.Node): ts.Node => {
        if (isHtmlType(node)) return reactNodeType()
        if (node !== view && isViewFunction(node)) return visitView(node)
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === builder
        ) {
          const name = node.expression.name.text
          if (TAGS.has(name)) return f.createParenthesizedExpression(element(node, name))
          report(
            node,
            /^[A-Z]/.test(name)
              ? DiagnosticCode.DynamicAttributes
              : DiagnosticCode.UnsupportedBuilder,
            /^[A-Z]/.test(name)
              ? `${builder}.${name} is only supported inline in an element's attribute array.`
              : `${builder}.${name} cannot be compiled to standalone React JSX. Use foldkit-react's runtime interop, or write this part in React.`,
          )
          return node
        }
        if (ts.isIdentifier(node) && node.text === builder) {
          const parent = node.parent
          if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
            // A helper view receives dispatch in place of the builder.
            return f.createIdentifier(DISPATCH)
          }
          if (parent === builderParameter) return node
          report(
            node,
            DiagnosticCode.EscapedBuilder,
            `${builder} may only be called or passed to a helper view; other uses have no React equivalent.`,
          )
          return node
        }
        return ts.visitEachChild(node, visit, context)
      }

      const messageType =
        (builderParameter.type as ts.TypeReferenceNode).typeArguments?.[0] ??
        f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      const parameters = view.parameters.map(parameter =>
        parameter === builderParameter
          ? f.createParameterDeclaration(
              undefined,
              undefined,
              DISPATCH,
              undefined,
              f.createFunctionTypeNode(
                undefined,
                [
                  f.createParameterDeclaration(
                    undefined,
                    undefined,
                    'message',
                    undefined,
                    messageType,
                  ),
                ],
                f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
              ),
            )
          : (ts.visitEachChild(parameter, visit, context) as ts.ParameterDeclaration),
      )
      const body = view.body && (visit(view.body) as ts.ConciseBody)
      const type = view.type && (visit(view.type) as ts.TypeNode)

      if (ts.isArrowFunction(view)) {
        return f.updateArrowFunction(
          view,
          view.modifiers,
          view.typeParameters,
          parameters,
          type,
          view.equalsGreaterThanToken,
          body!,
        )
      }
      if (ts.isFunctionExpression(view)) {
        return f.updateFunctionExpression(
          view,
          view.modifiers,
          view.asteriskToken,
          view.name,
          view.typeParameters,
          parameters,
          type,
          body as ts.Block,
        )
      }
      return f.updateFunctionDeclaration(
        view,
        view.modifiers,
        view.asteriskToken,
        view.name,
        view.typeParameters,
        parameters,
        type,
        body as ts.Block | undefined,
      )
    }

    const visitTop = (node: ts.Node): ts.Node => {
      if (isHtmlType(node)) return reactNodeType()
      if (isViewFunction(node)) return visitView(node)
      return ts.visitEachChild(node, visitTop, context)
    }

    return file => ts.visitEachChild(file, visitTop, context)
  }

  const result = ts.transform(source, [transformer])
  if (diagnostics.length > 0) {
    result.dispose()
    return { ok: false, diagnostics }
  }

  let output = result.transformed[0]!
  if (converted) output = rewriteImports(output)
  result.dispose()
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  const header = `// @generated by foldkit-react-codegen from ${fileName.replace(/\\/g, '/')}. Do not edit.\n`
  return { ok: true, code: header + printer.printFile(output), diagnostics: [] }
}

/** Drops the Foldkit html types the output no longer uses and imports `ReactNode`. */
const rewriteImports = (file: ts.SourceFile): ts.SourceFile => {
  const statements: Array<ts.Statement> = []
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'foldkit/html' &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const kept = statement.importClause.namedBindings.elements.filter(
        specifier => !['Html', 'HtmlBuilder'].includes(specifier.name.text),
      )
      if (kept.length === 0 && !statement.importClause.name) continue
      statements.push(
        f.updateImportDeclaration(
          statement,
          statement.modifiers,
          f.updateImportClause(
            statement.importClause,
            statement.importClause.isTypeOnly,
            statement.importClause.name,
            f.updateNamedImports(statement.importClause.namedBindings, kept),
          ),
          statement.moduleSpecifier,
          statement.attributes,
        ),
      )
      continue
    }
    statements.push(statement)
  }
  const reactImport = f.createImportDeclaration(
    undefined,
    f.createImportClause(
      true,
      undefined,
      f.createNamedImports([
        f.createImportSpecifier(false, undefined, f.createIdentifier('ReactNode')),
      ]),
    ),
    f.createStringLiteral('react'),
  )
  return f.updateSourceFile(file, [reactImport, ...statements])
}

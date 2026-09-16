/** Compiles, evaluates, and type-checks generated TSX in tests. */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { transformSourceFile } from '../src/index.js'

const require = createRequire(import.meta.url)

export const compile = (source: string) => {
  const result = transformSourceFile('src/View.ts', source)
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics, null, 2))
  return result.code
}

/** Type-strips and evaluates generated TSX, returning its exports. */
export const load = (code: string, modules: Record<string, unknown> = {}) => {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const exports: Record<string, any> = {}
  const resolveModule = (name: string) => modules[name] ?? require(name)
  new Function('exports', 'require', outputText)(exports, resolveModule)
  return exports
}

/**
 * Type-checks in-memory files, keyed by path relative to a virtual directory,
 * against the real React types. Returns the error messages.
 */
export const typecheck = (files: Readonly<Record<string, string>>, entry: string) => {
  // jsdom replaces import.meta.url's scheme, so resolve from the package directory.
  const root = `${resolve(process.cwd(), 'packages/react-codegen').replace(/\\/g, '/')}/virtual/`
  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const virtual = (name: string) => {
    const normalized = name.replace(/\\/g, '/')
    return normalized.startsWith(root) ? files[normalized.slice(root.length)] : undefined
  }
  const { fileExists, readFile, getSourceFile, directoryExists } = host
  host.fileExists = name => virtual(name) !== undefined || fileExists.call(host, name)
  host.readFile = name => virtual(name) ?? readFile.call(host, name)
  host.directoryExists = name =>
    `${name.replace(/\\/g, '/')}/` === root || (directoryExists?.call(host, name) ?? false)
  host.getSourceFile = (name, language) => {
    const text = virtual(name)
    return text === undefined
      ? getSourceFile.call(host, name, language)
      : ts.createSourceFile(name, text, language)
  }
  const program = ts.createProgram([root + entry], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
}

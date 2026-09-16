import ts from 'typescript'

export const printFile = (file: ts.SourceFile) =>
  ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(file)

/** The TypeScript internals that print with a source map; public `Printer` cannot. */
interface Internals {
  readonly createTextWriter: (newLine: string) => { getText: () => string }
  readonly createSourceMapGenerator: (
    host: { getCanonicalFileName: (name: string) => string; getCurrentDirectory: () => string },
    file: string,
    sourceRoot: string,
    sourcesDirectoryPath: string,
    options: object,
  ) => { toString: () => string }
}

interface MappingPrinter {
  readonly writeFile?: (file: ts.SourceFile, writer: unknown, generator: unknown) => void
}

export const printWithSourceMap = (file: ts.SourceFile): { code: string; map: string } => {
  const internals = ts as unknown as Partial<Internals>
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    sourceMap: true,
  } as ts.PrinterOptions) as ts.Printer & MappingPrinter
  if (
    internals.createTextWriter === undefined ||
    internals.createSourceMapGenerator === undefined ||
    printer.writeFile === undefined
  ) {
    throw new Error(
      `Source maps use TypeScript printer internals that TypeScript ${ts.version} does not expose.`,
    )
  }
  const writer = internals.createTextWriter('\n')
  const generator = internals.createSourceMapGenerator(
    { getCanonicalFileName: name => name, getCurrentDirectory: () => '' },
    '',
    '',
    '',
    {},
  )
  printer.writeFile(file, writer, generator)
  return { code: writer.getText(), map: generator.toString() }
}

/** The newest modification time of any file under `dir`, skipping `node_modules`; -Infinity when there is none. */
export declare const newestMtime: (dir: string) => number
/** Whether a package's `dist` is missing or older than its `src` or `package.json`. */
export declare const isStale: (packageDir: string) => boolean
/** The text with its leading one-line `import … from` and `export * from` statements sorted. */
export declare const sortLeadingImports: (text: string) => string
/** The workspace packages (folder names) an example's bundle reaches, its `devDependencies` included. */
export declare const workspaceClosure: (exampleDir: string) => ReadonlyArray<string>
/** What differs between two builds of one source, from their reports and `dump` folders. */
export declare const explainDifference: (
  first: BundleReport,
  second: BundleReport,
  firstDump: string,
  secondDump: string,
) => string

export interface BundleReport {
  readonly example: string
  readonly total: {
    readonly minified: number
    readonly brotli: number
    readonly chunks: number
    readonly lazyBrotli: number
    readonly lazyChunks: number
  }
  readonly rows: ReadonlyArray<{
    readonly name: string
    readonly minified: number
    readonly brotli: number
  }>
  readonly modules: ReadonlyArray<{
    readonly module: string
    readonly minified: number
    readonly brotli: number
  }>
  /** Every module loaded at start, by name, however small. */
  readonly included: ReadonlyArray<string>
  /** Each loaded module's minified bytes. */
  readonly sizes: Readonly<Record<string, number>>
  readonly styleSystemBrotli: number
  /** Present when `routes` were given. */
  readonly routes?: ReadonlyArray<RouteFigures>
}

export interface RouteSpec {
  readonly name: string
  /** Path suffixes of the route's root modules, comma-separated. */
  readonly module: string
  readonly landing?: boolean
}

export interface RouteFigures {
  readonly name: string
  readonly module: string
  readonly landing: boolean
  /** Whether the route's root is in a chunk the entry does not load at start. */
  readonly split: boolean
  readonly firstLoadBrotli: number
  /** Brotli (estimated) of the modules this route root alone reaches by static imports. */
  readonly aloneBrotli: number
  readonly aloneModules: ReadonlyArray<string>
}

export declare const SPLIT_THRESHOLD: number
export declare const formatRoutes: (report: BundleReport) => string
/** The modules exactly one root reaches; the entry's own and shared ones belong to none. */
export declare const exclusiveModules: (
  graph: Record<string, { readonly imports: ReadonlyArray<string> }>,
  entries: ReadonlyArray<string>,
  roots: ReadonlyMap<string, ReadonlyArray<string>>,
) => Map<string, string[]>

export declare const measure: (
  exampleDirectory: string,
  options?: {
    readonly rebuild?: boolean
    readonly routes?: ReadonlyArray<RouteSpec>
    /** A folder to copy the built client into. */
    readonly dump?: string
  },
) => Promise<BundleReport>
export declare const formatReport: (report: BundleReport) => string

export interface ServerReport {
  readonly example: string
  readonly bytes: number
  readonly gzip: number
  readonly rows: ReadonlyArray<{ readonly name: string; readonly bytes: number }>
  readonly modules: ReadonlyArray<{ readonly name: string; readonly bytes: number }>
  /** Every module in the bundle, not only the largest. */
  readonly files: ReadonlyArray<string>
}

export declare const measureServer: (
  exampleDirectory: string,
  options?: { readonly rebuild?: boolean },
) => Promise<ServerReport>
export declare const measureWorker: (
  exampleDirectory: string,
  entry: string,
) => Promise<ServerReport>
export declare const formatServerReport: (report: ServerReport) => string
export declare const lockDist: (lock?: string) => Promise<() => void>

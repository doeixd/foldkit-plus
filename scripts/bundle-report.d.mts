/** The newest modification time of any file under `dir`, skipping `node_modules`; -Infinity when there is none. */
export declare const newestMtime: (dir: string) => number
/** Whether a package's `dist` is missing or older than its `src` or `package.json`. */
export declare const isStale: (packageDir: string) => boolean

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
  readonly styleSystemBrotli: number
}

export declare const measure: (
  exampleDirectory: string,
  options?: { readonly rebuild?: boolean },
) => Promise<BundleReport>
export declare const formatReport: (report: BundleReport) => string

export interface ServerReport {
  readonly example: string
  readonly bytes: number
  readonly gzip: number
  readonly rows: ReadonlyArray<{ readonly name: string; readonly bytes: number }>
  readonly modules: ReadonlyArray<{ readonly name: string; readonly bytes: number }>
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

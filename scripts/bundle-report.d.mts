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

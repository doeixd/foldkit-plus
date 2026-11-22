/** The shape `Temporal.registry.report()` returns, without importing metakit: the command reads shapes, not copies. */
export const report = {
  open: [{}],
  discharged: [],
  decided: [],
  format: () => 'open (1)\n  stub A/B (declared at here): no walk has covered it',
}

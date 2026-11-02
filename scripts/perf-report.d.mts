import type { Cpu, CpuReading } from 'foldkit-plus/testing/workers'

/** Appends one reading to the `PERF_REPORT` file as a JSON line; does nothing when it is unset. */
export declare const record: (entry: Record<string, unknown>) => void

/** `Cpu.budget`, recording every reading before it fails a miss. */
export declare const cpuBudget: (
  suite: string,
  budget: typeof Cpu.budget,
  meter: Parameters<typeof Cpu.budget>[0],
  config: Parameters<typeof Cpu.budget>[1],
) => Promise<ReadonlyArray<CpuReading>>

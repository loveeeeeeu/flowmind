export interface CodeWorkerData {
  code: string;
  input: unknown;
  vmTimeoutMs: number;
}

export type CodeWorkerMessage = { ok: true; output: unknown } | { ok: false; error: string };

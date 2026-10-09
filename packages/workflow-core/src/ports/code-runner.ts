export interface CodeRunRequest {
  code: string;
  input: unknown;
  timeoutMs: number;
}

export interface CodeRunResponse {
  output: unknown;
}

export interface CodeRunner {
  run(request: CodeRunRequest): Promise<CodeRunResponse>;
}

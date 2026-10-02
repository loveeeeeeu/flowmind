export class LlmProviderError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LlmProviderError';
    }
  }
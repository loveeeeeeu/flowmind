export interface ChatOptions {
    model: string;
    prompt: string;
  }
  
  export interface ChatResult {
    content: string;
  }
  
  export interface LLMProvider {
    chat(options: ChatOptions): Promise<ChatResult>;
  }
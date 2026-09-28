import {
    ChatOptions,
    ChatResult,
    LLMProvider,
  } from "./llm-provider.interface.js";
  import { Injectable } from '@nestjs/common';
@Injectable()
  export class OpenAIProvider implements LLMProvider {
  
    async chat(
      options: ChatOptions,
    ): Promise<ChatResult> {
  
      return {
        content: `[OpenAI] ${options.prompt}`,
      };
  
    }
  
  }
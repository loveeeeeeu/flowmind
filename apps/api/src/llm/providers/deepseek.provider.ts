import { LLMProvider, ChatOptions, ChatResult } from "./llm-provider.interface.js";
import { Injectable } from '@nestjs/common';

@Injectable()
export class DeepSeekProvider
implements LLMProvider{

 async chat(options: ChatOptions): Promise<ChatResult> {

   return{

     content:`[DeepSeek] ${options.prompt}`

   }
 }
}
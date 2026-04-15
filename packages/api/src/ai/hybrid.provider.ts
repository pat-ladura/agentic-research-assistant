import { AIProvider, ChatMessage } from './provider';
import { OllamaProvider } from './ollama.provider';
import { logger } from '../lib/logger';

export interface ChatOptions {
  lowReason?: boolean; // true = route to local Ollama
}

export class HybridProvider implements AIProvider {
  private primary: AIProvider;
  private local: OllamaProvider;
  private localAvailable: boolean = true;

  constructor(primary: AIProvider) {
    this.primary = primary;
    this.local = new OllamaProvider({ cloud: false }); // always local for low-reason offload
  }

  async chat(messages: ChatMessage[], systemPrompt?: string, opts?: ChatOptions): Promise<string> {
    if (opts?.lowReason && this.localAvailable) {
      try {
        return await this.local.chat(messages, systemPrompt);
      } catch {
        logger.warn('Local Ollama unavailable, falling back to primary for low-reason task');
        this.localAvailable = false;
      }
    }
    return this.primary.chat(messages, systemPrompt);
  }

  async embed(text: string): Promise<number[]> {
    // embeddings always from selected provider
    return this.primary.embed(text);
  }

  async complete(prompt: string, maxTokens?: number): Promise<string> {
    return this.primary.complete(prompt, maxTokens);
  }
}

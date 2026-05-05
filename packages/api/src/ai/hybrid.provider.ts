import { AIProvider, ChatMessage } from './provider';
import { OllamaProvider } from './ollama.provider';
import { logger } from '../lib/logger';

export interface ChatOptions {
  lowReason?: boolean; // true = route to local Ollama
}

export interface HybridProviderConfig {
  useLocalForLowReason?: boolean; // default true; set false when primary is already local
}

export class HybridProvider implements AIProvider {
  private primary: AIProvider;
  private local: OllamaProvider;
  private localAvailable: boolean = true;
  private useLocalForLowReason: boolean;

  constructor(primary: AIProvider, config: HybridProviderConfig = {}) {
    this.primary = primary;
    this.useLocalForLowReason = config.useLocalForLowReason ?? true;
    this.local = new OllamaProvider({ cloud: false });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string, opts?: ChatOptions): Promise<string> {
    if (opts?.lowReason && this.useLocalForLowReason && this.localAvailable) {
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
    // OllamaProvider primary → embeddings use local Ollama (qwen3-embedding)
    // OpenAI primary → embeddings use their respective cloud provider
    if (this.primary instanceof OllamaProvider) {
      return this.local.embed(text);
    }
    return this.primary.embed(text);
  }

  async complete(prompt: string, maxTokens?: number): Promise<string> {
    return this.primary.complete(prompt, maxTokens);
  }
}

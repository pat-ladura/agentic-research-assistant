import { Ollama } from 'ollama';
import { AIProvider, ChatMessage } from './provider';
import { logger } from '../lib/logger';
import { getEnv } from '../config/env';

export interface OllamaConfig {
  cloud?: boolean; // true = Ollama Cloud, false/undefined = local
}

export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string;
  private embeddingModel: string = 'bge-m3';

  constructor(config: OllamaConfig = {}) {
    const env = getEnv();
    if (config.cloud) {
      if (!env.OLLAMA_CLOUD_BASE_URL) throw new Error('OLLAMA_CLOUD_BASE_URL is not set');
      this.model = 'deepseek-v3.1:671b';
      this.client = new Ollama({
        host: env.OLLAMA_CLOUD_BASE_URL,
        headers: env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {},
      });
    } else {
      // local — low-reason offload
      this.model = 'llama3';
      this.client = new Ollama({ host: env.OLLAMA_BASE_URL });
    }
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    try {
      const formattedMessages = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
        : messages;

      const response = await this.client.chat({
        model: this.model,
        messages: formattedMessages,
        stream: false,
      });

      logger.debug({ model: this.model }, 'Ollama chat completed');
      return response.message.content;
    } catch (error) {
      logger.error(error, 'Ollama chat failed');
      throw new Error(
        `Ollama chat error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embed({
        model: this.embeddingModel,
        input: text,
      });

      const raw = response.embeddings[0] ?? [];
      const sanitized = raw.map((v) => (Number.isFinite(v) ? v : 0));
      if (sanitized.some((v, i) => v !== raw[i])) {
        logger.warn(
          { model: this.embeddingModel },
          'Ollama embedding contained NaN/Infinity — sanitized to 0'
        );
      }
      logger.debug({ model: this.embeddingModel }, 'Ollama embedding generated');
      return sanitized;
    } catch (error) {
      logger.error(error, 'Ollama embedding failed');
      throw new Error(
        `Ollama embedding error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async complete(prompt: string, maxTokens: number = 256): Promise<string> {
    try {
      const response = await this.client.generate({
        model: this.model,
        prompt,
        stream: false,
        options: {
          num_predict: maxTokens,
        },
      });

      logger.debug({ model: this.model }, 'Ollama completion generated');
      return response.response;
    } catch (error) {
      logger.error(error, 'Ollama completion failed');
      throw new Error(
        `Ollama completion error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

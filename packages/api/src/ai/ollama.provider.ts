import { Ollama } from 'ollama';
import { AIProvider, ChatMessage } from './provider';
import { logger } from '../lib/logger';
import { getEnv } from '../config/env';

export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string = 'llama2'; // Default model, can be configurable
  private baseUrl: string;

  constructor() {
    const env = getEnv();
    this.baseUrl = env.OLLAMA_BASE_URL;
    // Set environment variable for Ollama client
    process.env.OLLAMA_HOST = this.baseUrl;
    this.client = new Ollama();
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
      const response = await this.client.embeddings({
        model: this.model,
        prompt: text,
      });

      logger.debug({ model: this.model }, 'Ollama embedding generated');
      return response.embedding;
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

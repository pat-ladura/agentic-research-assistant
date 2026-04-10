import OpenAI from 'openai';
import { AIProvider, ChatMessage } from './provider';
import { logger } from '../lib/logger';
import { getEnv } from '../config/env';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string = 'gpt-4-turbo';
  private embeddingModel: string = 'text-embedding-3-small';

  constructor() {
    const env = getEnv();
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    try {
      const systemMessage = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }]
        : [];

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [...systemMessage, ...messages],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      logger.debug({ model: this.model }, 'OpenAI chat completed');
      return content;
    } catch (error) {
      logger.error(error, 'OpenAI chat failed');
      throw new Error(
        `OpenAI chat error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding in OpenAI response');
      }

      logger.debug({ model: this.embeddingModel }, 'OpenAI embedding generated');
      return embedding;
    } catch (error) {
      logger.error(error, 'OpenAI embedding failed');
      throw new Error(
        `OpenAI embedding error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async complete(prompt: string, maxTokens: number = 256): Promise<string> {
    try {
      const response = await this.client.completions.create({
        model: this.model,
        prompt,
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      const content = response.choices[0]?.text;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      logger.debug({ model: this.model }, 'OpenAI completion generated');
      return content;
    } catch (error) {
      logger.error(error, 'OpenAI completion failed');
      throw new Error(
        `OpenAI completion error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

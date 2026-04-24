import OpenAI from 'openai';
import { AIProvider, ChatMessage } from './provider';
import { logger } from '../lib/logger';
import { getEnv } from '../config/env';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string = 'gpt-4o-mini';
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

  /**
   * Rerank documents by relevance to a query using embedding-based cosine similarity.
   *
   * Embeds query + all documents in a single batch call (text-embedding-3-small),
   * then ranks by cosine similarity between the query vector and each doc vector.
   *
   * Returns an array of scores aligned to the input documents array.
   * Returns [] on failure — caller falls back to original order.
   */
  async rerank(query: string, documents: string[]): Promise<number[]> {
    if (documents.length === 0) return [];

    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: [query, ...documents],
      });

      // OpenAI returns embeddings in the same order as input
      const vecs = response.data.map((d) => d.embedding);
      if (vecs.length !== documents.length + 1) {
        logger.warn(
          { model: this.embeddingModel },
          'OpenAI rerank: unexpected embedding count, falling back'
        );
        return [];
      }

      const queryVec = vecs[0];
      const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
      const norm = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0));

      const scores = vecs.slice(1).map((docVec) => {
        const n = norm(queryVec) * norm(docVec);
        return n === 0 ? 0 : dot(queryVec, docVec) / n;
      });

      logger.debug(
        { model: this.embeddingModel, count: documents.length },
        'OpenAI rerank complete'
      );
      return scores;
    } catch (error) {
      logger.warn({ error }, 'OpenAI rerank failed, falling back to original order');
      return [];
    }
  }
}

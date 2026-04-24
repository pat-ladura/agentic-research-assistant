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
  private embeddingModel: string = 'qwen3-embedding';

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
        options: { temperature: 0.7 },
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
    // qwen3-embedding context limit ~8192 tokens; truncate to ~30000 chars to stay safe
    const input = text.length > 30000 ? text.slice(0, 30000) : text;
    try {
      const response = await this.client.embed({
        model: this.embeddingModel,
        input,
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
          temperature: 0.7,
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

  /**
   * Rerank documents by relevance to a query using embedding-based cosine similarity.
   *
   * Embeds query + all documents in a single batch call via /api/embed (bge-m3),
   * then ranks by cosine similarity between the query vector and each doc vector.
   *
   * Returns an array of scores aligned to the input documents array.
   * Returns [] on failure — caller falls back to original order.
   */
  async rerank(query: string, documents: string[]): Promise<number[]> {
    if (documents.length === 0) return [];

    try {
      const response = await this.client.embed({
        model: this.embeddingModel,
        input: [query, ...documents],
      });

      const vecs = response.embeddings;
      if (!vecs || vecs.length !== documents.length + 1) {
        logger.warn(
          { model: this.embeddingModel },
          'Ollama rerank: unexpected embedding count, falling back'
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
        'Ollama rerank complete'
      );
      return scores;
    } catch (error) {
      logger.warn({ error }, 'Ollama rerank failed, falling back to original order');
      return [];
    }
  }
}

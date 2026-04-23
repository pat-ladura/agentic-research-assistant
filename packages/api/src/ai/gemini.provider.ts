import { GoogleGenAI } from '@google/genai';
import { AIProvider, ChatMessage } from './provider';
import { OllamaProvider } from './ollama.provider';
import { logger } from '../lib/logger';
import { getEnv } from '../config/env';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private model: string = 'gemini-2.5-flash';
  private localEmbedder: OllamaProvider;

  constructor() {
    const env = getEnv();
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    this.localEmbedder = new OllamaProvider({ cloud: false }); // bge-m3, 1024d
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    try {
      // Gemini uses 'model' role instead of 'assistant'
      const geminiMessages = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: geminiMessages,
        config: { systemInstruction: systemPrompt },
      });

      const text = response.text;
      if (!text) throw new Error('No content in Gemini response');
      logger.debug({ model: this.model }, 'Gemini chat completed');
      return text;
    } catch (error) {
      logger.error(error, 'Gemini chat failed');
      throw new Error(
        `Gemini chat error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    return this.localEmbedder.embed(text);
  }

  async complete(prompt: string, _maxTokens: number = 256): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }]);
  }
}

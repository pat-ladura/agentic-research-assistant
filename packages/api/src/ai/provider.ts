/**
 * AI Provider Interface
 * Defines the contract that all AI providers must implement
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProvider {
  /**
   * Send a chat message and receive a response
   * @param messages - Array of messages in the conversation
   * @param systemPrompt - Optional system prompt to guide the model
   * @returns The model's response text
   */
  chat(messages: ChatMessage[], systemPrompt?: string): Promise<string>;

  /**
   * Generate an embedding for text
   * @param text - Text to embed
   * @returns Array of numbers representing the embedding
   */
  embed(text: string): Promise<number[]>;

  /**
   * Complete a prompt with the model
   * @param prompt - The prompt to complete
   * @param maxTokens - Maximum tokens to generate
   * @returns The completion text
   */
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

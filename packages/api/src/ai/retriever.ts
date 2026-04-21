import { sql, eq } from 'drizzle-orm';
import { getDb } from '../config/database';
import { documents } from '../db/schema';
import { AIProvider } from './provider';
import { logger } from '../lib/logger';

const EMBEDDING_MODEL_MAP: Record<string, string> = {
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
  ollama: 'nomic-embed-text',
};

/**
 * Retrieve the top-K most semantically relevant document chunks for a query.
 *
 * Column selection:
 *  - OpenAI embeddings are 1536d → `embedding` column
 *  - Gemini / Ollama embeddings are 768d → `embedding_small` column
 *
 * Similarity is computed with pgvector cosine distance (<=>).
 * Results are always scoped to the session to prevent cross-session leakage.
 */
export async function retrieveRelevantChunks(
  query: string,
  sessionId: number,
  provider: AIProvider,
  topK: number = 5
): Promise<string[]> {
  const db = getDb();

  let queryEmbedding: number[];
  try {
    queryEmbedding = await provider.embed(query);
  } catch (err) {
    logger.warn({ sessionId, err }, 'RAG: embed() failed, skipping retrieval');
    return [];
  }

  if (!queryEmbedding || queryEmbedding.length === 0) {
    logger.warn({ sessionId }, 'RAG: empty embedding returned, skipping retrieval');
    return [];
  }

  const embeddingLiteral = `[${queryEmbedding.join(',')}]`;
  const is768d = queryEmbedding.length === 768;

  // Use typed column references so Drizzle knows the schema — avoids sql.identifier string risk
  const vectorCol = is768d ? documents.embeddingSmall : documents.embedding;

  try {
    const results = await db
      .select({ content: documents.content })
      .from(documents)
      .where(eq(documents.sessionId, sessionId))
      .orderBy(sql`${vectorCol} <=> ${embeddingLiteral}::vector`)
      .limit(topK);

    logger.debug(
      { sessionId, topK, returned: results.length, dim: queryEmbedding.length },
      'RAG retrieval complete'
    );
    return results.map((r) => r.content);
  } catch (err) {
    logger.warn({ sessionId, err }, 'RAG: vector search failed, skipping retrieval');
    return [];
  }
}

/**
 * Embed a document chunk and insert it into the documents table for a session.
 * Used during research to persist fetched web content so the RAG step has real sources.
 *
 * Silently skips embedding failures — the row is still stored without a vector,
 * meaning it won't surface in similarity search but is preserved for auditing.
 */
export async function storeDocumentChunk(
  sessionId: number,
  title: string,
  content: string,
  source: string,
  provider: AIProvider,
  providerType: string
): Promise<void> {
  const db = getDb();

  let embedding: number[] | null = null;
  try {
    const vec = await provider.embed(content);
    embedding = vec.length > 0 ? vec : null;
  } catch (err) {
    logger.warn({ sessionId, source, err }, 'RAG: embed() failed for document chunk, storing without vector');
  }

  const is768d = embedding !== null && embedding.length === 768;
  const embeddingModel = EMBEDDING_MODEL_MAP[providerType] ?? 'text-embedding-3-small';

  await db.insert(documents).values({
    sessionId,
    title,
    content,
    source,
    embeddingModel,
    ...(!is768d && embedding ? { embedding: embedding as number[] } : {}),
    ...(is768d && embedding ? { embeddingSmall: embedding as number[] } : {}),
  });
}

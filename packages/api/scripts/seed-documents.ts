/**
 * Phase 6 validation seed script
 * Embeds test documents and inserts them into the documents table for session 1 (OpenAI provider).
 * Run: pnpm tsx scripts/seed-documents.ts
 */
import 'dotenv/config';
import { getDb } from '../src/config/database';
import { getAIProvider } from '../src/ai';
import { documents } from '../src/db/schema';

const SESSION_ID = 1; // Phase 5 Test session (openai provider, 1536d)
const PROVIDER = 'openai' as const;

const TEST_DOCS = [
  {
    title: 'How Rainbows Form',
    content:
      'A rainbow forms when sunlight enters water droplets in the atmosphere. The light is refracted (bent) as it enters the droplet, reflects off the inner surface, and refracts again as it exits. Different wavelengths of light bend at different angles, separating white light into its spectrum: red at the outer arc (~42°) through orange, yellow, green, blue, to violet at the inner arc (~40°). The observer must be positioned with the sun behind them and rain or mist in front.',
    source: 'seed-script/optics-101',
  },
  {
    title: 'Rainbow Optics — Double Rainbows',
    content:
      "A secondary (double) rainbow appears when light reflects twice inside the droplet before exiting. This reverses the colour order — violet is on the outside, red on the inside — and the secondary bow appears at ~51°. The sky between the two bows (Alexander's dark band) appears darker because no light is scattered toward the observer from that angular region.",
    source: 'seed-script/optics-advanced',
  },
  {
    title: 'Conditions Required for Rainbow Visibility',
    content:
      'Rainbows are only visible when: (1) the sun is at a low angle (below ~42° above the horizon), (2) there are water droplets in front of the observer (rain, mist, spray), (3) the observer has their back to the sun. Larger droplets produce more vivid, narrowly banded rainbows; smaller droplets (fog) produce pale, wide "fogbows".',
    source: 'seed-script/meteorology',
  },
];

async function main() {
  const db = getDb();
  const provider = getAIProvider(PROVIDER);

  console.log(`Seeding ${TEST_DOCS.length} documents for session ${SESSION_ID}...`);

  for (const doc of TEST_DOCS) {
    process.stdout.write(`  Embedding: "${doc.title}" ... `);
    const embedding = await provider.embed(doc.content);
    console.log(`${embedding.length}d`);

    await db.insert(documents).values({
      sessionId: SESSION_ID,
      title: doc.title,
      content: doc.content,
      embeddingModel: 'text-embedding-3-small',
      embedding: embedding as unknown as readonly number[],
      source: doc.source,
    });
  }

  console.log('Done. Documents inserted:');
  const rows = await db.select({ id: documents.id, title: documents.title }).from(documents);
  rows.forEach((r) => console.log(`  [${r.id}] ${r.title}`));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

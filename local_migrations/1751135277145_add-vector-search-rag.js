/**
 * Add Vector Search and RAG Support
 * 
 * Implements comprehensive RAG (Retrieval-Augmented Generation) capabilities:
 * - Vector embeddings for semantic search (1536-dimensional)
 * - Keyword arrays for text search fallback
 * - AI-generated summaries and relevance scoring
 * - Hybrid search combining vector similarity and text matching
 * - Background processing helpers for AI enhancement
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Enable required extensions for vector search and text similarity
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  // Add vector and metadata columns to meeting_knowledge
  pgm.addColumns('meeting_knowledge', {
    embedding: { type: 'vector(1536)' },
    keywords: { type: 'text[]' },
    summary: { type: 'text' },
    relevance_score: { type: 'float', default: 1.0 }
  });

  // Create vector similarity index (IVFFlat for approximate nearest neighbor)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS meeting_knowledge_embedding_idx 
    ON meeting_knowledge 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `);

  // Create GIN index for keywords array
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS meeting_knowledge_keywords_idx 
    ON meeting_knowledge 
    USING gin (keywords)
  `);

  // Create composite indexes for better query performance
  pgm.createIndex('meeting_knowledge', ['meeting_id', 'content_type'], {
    name: 'meeting_knowledge_meeting_type_idx'
  });

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS meeting_knowledge_relevance_idx 
    ON meeting_knowledge (relevance_score DESC)
  `);

  // Drop existing functions if they exist (to avoid return type conflicts)
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, double precision, integer)');
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, float, int)');

  // Hybrid search function combining vector similarity and text search
  pgm.sql(`
    CREATE OR REPLACE FUNCTION hybrid_search(
      query_embedding vector(1536),
      query_text text,
      target_meeting_id text DEFAULT NULL,
      match_threshold float DEFAULT 0.7,
      match_count int DEFAULT 10
    )
    RETURNS TABLE (
      id uuid,
      meeting_id text,
      content text,
      content_type text,
      source text,
      created_at timestamptz,
      similarity float,
      keyword_match boolean
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        mk.id,
        mk.meeting_id,
        mk.content,
        mk.content_type,
        mk.source,
        mk.created_at,
        (mk.embedding <=> query_embedding) * -1 + 1 as similarity,
        (query_text <% ANY(mk.keywords)) as keyword_match
      FROM meeting_knowledge mk
      WHERE 
        (target_meeting_id IS NULL OR mk.meeting_id = target_meeting_id)
        AND mk.embedding IS NOT NULL
        AND (
          (mk.embedding <=> query_embedding) < (1 - match_threshold)
          OR (mk.keywords IS NOT NULL AND query_text <% ANY(mk.keywords))
        )
      ORDER BY 
        similarity DESC,
        keyword_match DESC,
        mk.created_at DESC
      LIMIT match_count;
    END;
    $$
  `);

  // Drop existing function if it exists
  pgm.sql('DROP FUNCTION IF EXISTS get_knowledge_needing_embeddings(int)');
  pgm.sql('DROP FUNCTION IF EXISTS get_knowledge_needing_embeddings(integer)');

  // Function to get knowledge items that need embedding processing
  pgm.sql(`
    CREATE OR REPLACE FUNCTION get_knowledge_needing_embeddings(
      batch_size int DEFAULT 10
    )
    RETURNS TABLE (
      id uuid,
      meeting_id text,
      content text,
      content_type text,
      source text,
      created_at timestamptz
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        mk.id,
        mk.meeting_id,
        mk.content,
        mk.content_type,
        mk.source,
        mk.created_at
      FROM meeting_knowledge mk
      WHERE mk.embedding IS NULL
      ORDER BY mk.created_at DESC
      LIMIT batch_size;
    END;
    $$
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop functions
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, float, int)');
  pgm.sql('DROP FUNCTION IF EXISTS get_knowledge_needing_embeddings(int)');

  // Drop indexes
  pgm.sql('DROP INDEX IF EXISTS meeting_knowledge_embedding_idx');
  pgm.sql('DROP INDEX IF EXISTS meeting_knowledge_keywords_idx');
  pgm.sql('DROP INDEX IF EXISTS meeting_knowledge_meeting_type_idx');
  pgm.sql('DROP INDEX IF EXISTS meeting_knowledge_relevance_idx');

  // Remove columns
  pgm.dropColumns('meeting_knowledge', ['embedding', 'keywords', 'summary', 'relevance_score']);

  // Note: Extensions are not dropped as they might be used by other parts of the system
};

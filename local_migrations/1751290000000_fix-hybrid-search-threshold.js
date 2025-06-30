/**
 * Fix Hybrid Search Function Threshold Logic
 * 
 * The original hybrid_search function had incorrect threshold logic for cosine distance.
 * Cosine distance (<=> operator) returns values 0-2 where:
 * - 0 = identical vectors (perfect match)
 * - 1 = orthogonal vectors (no similarity)
 * - 2 = opposite vectors (completely dissimilar)
 * 
 * The previous threshold logic was backwards and too restrictive.
 * This migration fixes the similarity calculation and threshold comparison.
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
  // Drop the existing function
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, float, int)');

  // Create corrected hybrid search function
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
        -- Correct similarity: convert cosine distance to similarity (1 - distance)
        (1 - (mk.embedding <=> query_embedding)) as similarity,
        -- Keyword matching using similarity operator
        (query_text <% ANY(mk.keywords)) as keyword_match
      FROM meeting_knowledge mk
      WHERE 
        (target_meeting_id IS NULL OR mk.meeting_id = target_meeting_id)
        AND mk.embedding IS NOT NULL
        AND (
          -- Correct threshold: distance should be LESS than (1 - threshold)
          -- For threshold 0.7, we want cosine distance < 0.3 (high similarity)
          (mk.embedding <=> query_embedding) < (1 - match_threshold)
          OR (mk.keywords IS NOT NULL AND query_text <% ANY(mk.keywords))
        )
      ORDER BY 
        similarity DESC,
        keyword_match DESC NULLS LAST,
        mk.created_at DESC
      LIMIT match_count;
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
  // Drop the corrected function
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, float, int)');

  // Restore the original (broken) function for rollback
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
};
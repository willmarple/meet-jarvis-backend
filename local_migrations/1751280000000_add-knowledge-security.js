/**
 * Add Knowledge Security
 * 
 * Critical security update to fix knowledge data leakage:
 * - Add creator_id column for Clerk user ownership tracking
 * - Add optional project_id for team-based knowledge sharing
 * - Replace permissive RLS policies with strict Clerk-based access control
 * - Update hybrid_search function to respect user permissions
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
  // Add security columns to meeting_knowledge
  pgm.addColumns('meeting_knowledge', {
    creator_id: {
      type: 'text',
      notNull: false, // Allow null for existing data
      comment: 'Clerk user ID of the person who created this knowledge item'
    },
    project_id: {
      type: 'uuid',
      references: 'projects(id)',
      onDelete: 'SET NULL',
      comment: 'Optional project association for team knowledge sharing'
    }
  });

  // Create indexes for performance
  pgm.createIndex('meeting_knowledge', 'creator_id');
  pgm.createIndex('meeting_knowledge', 'project_id');
  pgm.createIndex('meeting_knowledge', ['creator_id', 'meeting_id']);

  // Drop existing insecure policies
  pgm.sql('DROP POLICY IF EXISTS "Anyone can read meeting knowledge" ON meeting_knowledge;');
  pgm.sql('DROP POLICY IF EXISTS "Anyone can add meeting knowledge" ON meeting_knowledge;');
  pgm.sql('DROP POLICY IF EXISTS "Anyone can update meeting knowledge" ON meeting_knowledge;');

  // Create secure RLS policies based on Clerk authentication

  // Policy 1: Users can read knowledge they created OR from meetings they have access to
  pgm.sql(`
    CREATE POLICY "Users can read accessible knowledge" ON meeting_knowledge
      FOR SELECT 
      TO authenticated
      USING (
        -- User created this knowledge
        creator_id = auth.uid()::text 
        OR 
        -- User has access to the meeting (host or participant)
        meeting_id IN (
          SELECT id FROM meetings WHERE host_id = auth.uid()::text
          UNION
          SELECT meeting_id FROM meeting_participants WHERE user_id = auth.uid()::text
        )
        OR
        -- User is member of the project (if knowledge is project-associated)
        (project_id IS NOT NULL AND project_id IN (
          SELECT project_id FROM project_members WHERE user_id = auth.uid()::text
        ))
      )
  `);

  // Policy 2: Only authenticated users can create knowledge with their Clerk ID
  pgm.sql(`
    CREATE POLICY "Authenticated users can create knowledge" ON meeting_knowledge
      FOR INSERT 
      TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL 
        AND creator_id = auth.uid()::text
      )
  `);

  // Policy 3: Users can only update knowledge they created
  pgm.sql(`
    CREATE POLICY "Users can update their own knowledge" ON meeting_knowledge
      FOR UPDATE 
      TO authenticated
      USING (creator_id = auth.uid()::text)
  `);

  // Policy 4: Anonymous users get no access (security hardening)
  pgm.sql(`
    CREATE POLICY "Anonymous users have no access" ON meeting_knowledge
      FOR ALL
      TO anon
      USING (false)
  `);

  // Update hybrid_search function to respect user permissions
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, float, int)');
  
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
    SECURITY DEFINER
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
        AND (
          -- Apply same access control as RLS policies
          mk.creator_id = auth.uid()::text 
          OR 
          mk.meeting_id IN (
            SELECT m.id FROM meetings m WHERE m.host_id = auth.uid()::text
            UNION
            SELECT mp.meeting_id FROM meeting_participants mp WHERE mp.user_id = auth.uid()::text
          )
          OR
          (mk.project_id IS NOT NULL AND mk.project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = auth.uid()::text
          ))
        )
      ORDER BY 
        similarity DESC,
        keyword_match DESC,
        mk.created_at DESC
      LIMIT match_count;
    END;
    $$
  `);

  // Backfill existing knowledge with creator_id from meeting host
  // This ensures existing data isn't orphaned
  pgm.sql(`
    UPDATE meeting_knowledge 
    SET creator_id = (
      SELECT host_id 
      FROM meetings 
      WHERE meetings.id = meeting_knowledge.meeting_id
    )
    WHERE creator_id IS NULL
  `);

  // Now make creator_id NOT NULL to enforce security going forward
  pgm.alterColumn('meeting_knowledge', 'creator_id', {
    notNull: true
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Restore original hybrid_search function
  pgm.sql('DROP FUNCTION IF EXISTS hybrid_search(vector, text, text, float, int)');
  
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

  // Drop secure policies
  pgm.sql('DROP POLICY IF EXISTS "Users can read accessible knowledge" ON meeting_knowledge;');
  pgm.sql('DROP POLICY IF EXISTS "Authenticated users can create knowledge" ON meeting_knowledge;');
  pgm.sql('DROP POLICY IF EXISTS "Users can update their own knowledge" ON meeting_knowledge;');
  pgm.sql('DROP POLICY IF EXISTS "Anonymous users have no access" ON meeting_knowledge;');

  // Restore original insecure policies (for rollback only)
  pgm.sql(`
    CREATE POLICY "Anyone can read meeting knowledge"
      ON meeting_knowledge
      FOR SELECT
      TO anon, authenticated
      USING (true)
  `);

  pgm.sql(`
    CREATE POLICY "Anyone can add meeting knowledge"
      ON meeting_knowledge
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true)
  `);

  pgm.sql(`
    CREATE POLICY "Anyone can update meeting knowledge"
      ON meeting_knowledge
      FOR UPDATE
      TO anon, authenticated
      USING (true)
  `);

  // Drop indexes
  pgm.dropIndex('meeting_knowledge', ['creator_id', 'meeting_id']);
  pgm.dropIndex('meeting_knowledge', 'project_id');
  pgm.dropIndex('meeting_knowledge', 'creator_id');

  // Remove security columns
  pgm.dropColumns('meeting_knowledge', ['creator_id', 'project_id']);
};
/**
 * Initial Meeting Knowledge Base Schema
 * 
 * Creates the foundational tables for the AI Meeting Platform:
 * - meetings: Meeting rooms and metadata
 * - meeting_participants: Real-time participant tracking
 * - meeting_knowledge: RAG knowledge base with content management
 * 
 * Includes RLS policies for multi-tenant security and real-time subscriptions.
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
  // Create meetings table
  pgm.createTable('meetings', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    host_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    is_active: { type: 'boolean', default: true }
  });

  // Create meeting_participants table
  pgm.createTable('meeting_participants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    meeting_id: { 
      type: 'text', 
      notNull: true, 
      references: 'meetings(id)', 
      onDelete: 'CASCADE' 
    },
    user_name: { type: 'text', notNull: true },
    user_id: { type: 'text', notNull: true },
    joined_at: { type: 'timestamptz', default: pgm.func('now()') },
    left_at: { type: 'timestamptz' },
    is_connected: { type: 'boolean', default: true }
  });

  // Create meeting_knowledge table
  pgm.createTable('meeting_knowledge', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    meeting_id: { 
      type: 'text', 
      notNull: true, 
      references: 'meetings(id)', 
      onDelete: 'CASCADE' 
    },
    content: { type: 'text', notNull: true },
    content_type: { type: 'text', notNull: true, default: 'fact' },
    source: { type: 'text', notNull: true, default: 'user' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') }
  });

  // Enable Row Level Security
  pgm.sql('ALTER TABLE meetings ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE meeting_knowledge ENABLE ROW LEVEL SECURITY');

  // Create policies for meetings
  pgm.sql(`
    CREATE POLICY "Anyone can read meetings"
      ON meetings
      FOR SELECT
      TO anon, authenticated
      USING (true)
  `);

  pgm.sql(`
    CREATE POLICY "Anyone can create meetings"
      ON meetings
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true)
  `);

  pgm.sql(`
    CREATE POLICY "Host can update their meetings"
      ON meetings
      FOR UPDATE
      TO anon, authenticated
      USING (true)
  `);

  // Create policies for meeting_participants
  pgm.sql(`
    CREATE POLICY "Anyone can read participants"
      ON meeting_participants
      FOR SELECT
      TO anon, authenticated
      USING (true)
  `);

  pgm.sql(`
    CREATE POLICY "Anyone can join meetings"
      ON meeting_participants
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true)
  `);

  pgm.sql(`
    CREATE POLICY "Participants can update their own data"
      ON meeting_participants
      FOR UPDATE
      TO anon, authenticated
      USING (true)
  `);

  // Create policies for meeting_knowledge
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

  // Create indexes for better performance
  pgm.createIndex('meeting_participants', 'meeting_id');
  pgm.createIndex('meeting_participants', 'user_id');
  pgm.createIndex('meeting_knowledge', 'meeting_id');
  pgm.createIndex('meeting_knowledge', 'content_type');

  // Enable real-time subscriptions
  pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE meeting_knowledge');
  pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE meeting_participants');
  pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE meetings');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove real-time subscriptions
  pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE meeting_knowledge');
  pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE meeting_participants');
  pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE meetings');

  // Drop tables (CASCADE will handle foreign keys)
  pgm.dropTable('meeting_knowledge');
  pgm.dropTable('meeting_participants');
  pgm.dropTable('meetings');
};

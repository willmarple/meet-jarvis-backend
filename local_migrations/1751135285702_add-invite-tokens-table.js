/**
 * Add Invite Tokens Table
 * 
 * Implements invite token system for controlling signup access:
 * - invite_tokens: Single-use tokens for hackathon judge access control
 * - Supports email-specific tokens and role assignment
 * - Includes expiration, usage tracking, and admin controls
 * - RLS policies for secure token management
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
  // Create invite tokens table for controlling signup access
  pgm.createTable('invite_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    token: {
      type: 'varchar(255)',
      notNull: true,
      unique: true
    },
    email: {
      type: 'varchar(255)',
      comment: 'Optional: specific email this token is for'
    },
    role: {
      type: 'varchar(50)',
      notNull: true,
      default: 'judge',
      comment: 'Role to assign to user when they signup (judge, admin, etc.)'
    },
    created_by: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'User ID of the admin who created this token'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    used_at: {
      type: 'timestamptz',
      comment: 'When the token was consumed during signup'
    },
    used_by_user_id: {
      type: 'varchar(255)',
      comment: 'User ID of the person who used this token'
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'When this token expires'
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Whether this token can still be used'
    },
    metadata: {
      type: 'jsonb',
      comment: 'Additional data about the token (purpose, event, etc.)'
    }
  });

  // Create indexes for performance
  pgm.createIndex('invite_tokens', 'token');
  pgm.createIndex('invite_tokens', 'email');
  pgm.createIndex('invite_tokens', ['is_active', 'expires_at']);
  pgm.createIndex('invite_tokens', 'created_by');
  pgm.createIndex('invite_tokens', 'used_by_user_id');

  // Add RLS (Row Level Security)
  pgm.sql('ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY');

  // Policy: Users can only see tokens they created (for admins)
  pgm.sql(`
    CREATE POLICY "Users can view their own created tokens" ON invite_tokens
      FOR SELECT USING (created_by = auth.uid()::text);
  `);

  // Policy: Only authenticated users can create tokens (admins)
  pgm.sql(`
    CREATE POLICY "Authenticated users can create tokens" ON invite_tokens
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid()::text);
  `);

  // Policy: Users can update tokens they created (to deactivate them)
  pgm.sql(`
    CREATE POLICY "Users can update their own created tokens" ON invite_tokens
      FOR UPDATE USING (created_by = auth.uid()::text);
  `);

  // No delete policy - we want to keep audit trail
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop RLS policies first
  pgm.sql('DROP POLICY IF EXISTS "Users can view their own created tokens" ON invite_tokens;');
  pgm.sql('DROP POLICY IF EXISTS "Authenticated users can create tokens" ON invite_tokens;');
  pgm.sql('DROP POLICY IF EXISTS "Users can update their own created tokens" ON invite_tokens;');
  
  // Drop the table (indexes will be dropped automatically)
  pgm.dropTable('invite_tokens');
};

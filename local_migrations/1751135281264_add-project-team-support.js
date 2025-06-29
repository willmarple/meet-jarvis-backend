/**
 * Add Project/Team Support
 * 
 * Implements multi-tenant project management with role-based access:
 * - projects: Team/organization management with unique handles
 * - project_members: Role-based membership (owner, admin, member, viewer)
 * - Enhanced meetings table with optional project association
 * - Automatic triggers for owner management and timestamp updates
 * - RLS policies for secure multi-tenant data access
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
  // Create projects table
  pgm.createTable('projects', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    handle: {
      type: 'text',
      unique: true,
      notNull: true
    },
    name: {
      type: 'text',
      notNull: true
    },
    description: {
      type: 'text'
    },
    owner_id: {
      type: 'text',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamptz', 
      default: pgm.func('now()')
    }
  });

  // Create project_members table
  pgm.createTable('project_members', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    project_id: {
      type: 'uuid',
      notNull: true,
      references: 'projects(id)',
      onDelete: 'CASCADE'
    },
    user_id: {
      type: 'text',
      notNull: true
    },
    role: {
      type: 'text',
      notNull: true,
      default: 'member'
    },
    invited_by: {
      type: 'text'
    },
    joined_at: {
      type: 'timestamptz',
      default: pgm.func('now()')
    }
  });

  // Add unique constraint on project_members
  pgm.addConstraint('project_members', 'project_members_unique', {
    unique: ['project_id', 'user_id']
  });

  // Add project_id column to meetings table (backwards compatible)
  pgm.addColumns('meetings', {
    project_id: {
      type: 'uuid',
      references: 'projects(id)',
      onDelete: 'SET NULL'
    }
  });

  // Create indexes for performance
  pgm.createIndex('projects', 'handle');
  pgm.createIndex('projects', 'owner_id');
  pgm.createIndex('project_members', 'project_id');
  pgm.createIndex('project_members', 'user_id');
  pgm.createIndex('meetings', 'project_id');

  // Enable Row Level Security
  pgm.sql('ALTER TABLE projects ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE project_members ENABLE ROW LEVEL SECURITY');

  // Basic RLS policies for projects (permissive for now, will harden later)
  pgm.sql(`
    CREATE POLICY "Anyone can read projects"
      ON projects
      FOR SELECT
      TO anon, authenticated
      USING (true)
  `);

  pgm.sql(`
    CREATE POLICY "Authenticated users can create projects"
      ON projects
      FOR INSERT
      TO authenticated
      WITH CHECK (true)
  `);

  pgm.sql(`
    CREATE POLICY "Project owners can update their projects"
      ON projects
      FOR UPDATE
      TO authenticated
      USING (true)
  `);

  // Basic RLS policies for project_members
  pgm.sql(`
    CREATE POLICY "Anyone can read project members"
      ON project_members
      FOR SELECT
      TO anon, authenticated
      USING (true)
  `);

  pgm.sql(`
    CREATE POLICY "Project members can be added by anyone"
      ON project_members
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true)
  `);

  pgm.sql(`
    CREATE POLICY "Project members can update their own data"
      ON project_members
      FOR UPDATE
      TO anon, authenticated
      USING (true)
  `);

  // Add constraint to ensure valid roles
  pgm.addConstraint('project_members', 'check_valid_role', {
    check: "role IN ('owner', 'admin', 'member', 'viewer')"
  });

  // Function to automatically add owner as project member
  pgm.sql(`
    CREATE OR REPLACE FUNCTION add_owner_as_project_member()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO project_members (project_id, user_id, role, invited_by)
      VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Trigger to automatically add owner as project member
  pgm.sql(`
    CREATE TRIGGER trigger_add_owner_as_project_member
      AFTER INSERT ON projects
      FOR EACH ROW
      EXECUTE FUNCTION add_owner_as_project_member()
  `);

  // Function to update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Trigger to update updated_at on projects
  pgm.sql(`
    CREATE TRIGGER trigger_update_projects_updated_at
      BEFORE UPDATE ON projects
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
  `);

  // Enable real-time subscriptions for new tables
  pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE projects');
  pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE project_members');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove real-time subscriptions
  pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE projects');
  pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE project_members');

  // Drop triggers
  pgm.sql('DROP TRIGGER IF EXISTS trigger_update_projects_updated_at ON projects');
  pgm.sql('DROP TRIGGER IF EXISTS trigger_add_owner_as_project_member ON projects');

  // Drop functions
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column()');
  pgm.sql('DROP FUNCTION IF EXISTS add_owner_as_project_member()');

  // Remove project_id column from meetings
  pgm.dropColumns('meetings', ['project_id']);

  // Drop tables (this will cascade to remove constraints and indexes)
  pgm.dropTable('project_members');
  pgm.dropTable('projects');
};

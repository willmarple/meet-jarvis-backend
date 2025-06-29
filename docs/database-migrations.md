# Database Migration Management

This document outlines how to manage database migrations in our AI Meeting Platform using our Laravel-style migration system built with node-pg-migrate.

## Overview

Our migration system uses JavaScript-based migrations with chronological ordering, similar to Laravel's approach. This allows us to:
- Provision databases from scratch
- Track migration state automatically
- Roll back changes when needed
- Maintain team synchronization
- Support both local development and production deployments

## Quick Reference

```bash
# Run all pending migrations
npm run migrate:up

# Roll back the last migration
npm run migrate:down

# Create a new migration file
npm run migrate:create migration_name

# Check migration status
npm run migrate:status
```

## Setup Requirements

### Environment Variables
Ensure these are set in your `.env` file:

```env
# Supabase Database Connection
SUPABASE_DB_PASSWORD=your_actual_database_password
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# For migrations, DATABASE_URL will be constructed automatically
```

### Database URL Configuration
The system automatically constructs the DATABASE_URL using:
- Project reference from VITE_SUPABASE_URL
- Password from SUPABASE_DB_PASSWORD (URL-encoded for special characters)
- Session pooler for DDL compatibility

Use the helper script if needed:
```bash
node scripts/setup-database-url.js
```

## Creating New Migrations

### 1. Generate Migration File
```bash
npm run migrate:create your_descriptive_name
```

This creates a file like: `local_migrations/20250628125031_your_descriptive_name.js`

### 2. Migration File Structure
```javascript
/**
 * Descriptive Migration Title
 * 
 * Brief description of what this migration does:
 * - List key changes
 * - Note any breaking changes
 * - Document new features added
 */

export const up = (pgm) => {
  // Your migration code here
  pgm.createTable('example', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true }
  });
  
  // Enable RLS
  pgm.sql('ALTER TABLE example ENABLE ROW LEVEL SECURITY');
  
  // Add to real-time
  pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE example');
};

export const down = (pgm) => {
  // Reverse the migration
  pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE example');
  pgm.dropTable('example');
};
```

### 3. Migration Best Practices

#### Table Creation
```javascript
pgm.createTable('table_name', {
  id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
  created_at: { type: 'timestamptz', default: pgm.func('now()') },
  updated_at: { type: 'timestamptz', default: pgm.func('now()') }
});
```

#### Foreign Keys
```javascript
project_id: {
  type: 'uuid',
  references: 'projects(id)',
  onDelete: 'CASCADE' // or 'SET NULL'
}
```

#### Indexes
```javascript
pgm.createIndex('table_name', 'column_name');
pgm.createIndex('table_name', ['col1', 'col2'], { name: 'custom_index_name' });
```

#### Row Level Security
```javascript
pgm.sql('ALTER TABLE table_name ENABLE ROW LEVEL SECURITY');

pgm.sql(`
  CREATE POLICY "policy_name"
    ON table_name
    FOR SELECT
    TO anon, authenticated
    USING (true)
`);
```

#### Real-time Subscriptions
```javascript
// Add table to real-time (in up)
pgm.sql('ALTER PUBLICATION supabase_realtime ADD TABLE table_name');

// Remove from real-time (in down)
pgm.sql('ALTER PUBLICATION supabase_realtime DROP TABLE table_name');
```

## Running Migrations

### Local Development
```bash
# Run all pending migrations
npm run migrate:up

# Check what will be run
npm run migrate:status
```

### Production/Staging
```bash
# Always backup first!
# Then run migrations
export DATABASE_URL="your_production_url"
npm run migrate:up
```

### Rolling Back
```bash
# Roll back last migration
npm run migrate:down

# Roll back to specific migration
npm run migrate:down -- 20250615051828
```

## Migration File Naming

Our naming convention: `YYYYMMDDHHMMSS_descriptive_name.js`

### Good Names
- `20250628125031_add_project_team_support.js`
- `20250619185326_add_vector_search_rag.js`
- `20250615053210_add_participant_constraints.js`

### Bad Names
- `migration.js`
- `fix_bug.js`
- `update.js`

## Current Migration History

Our existing migrations in chronological order:

1. **20250615051828_initial_meeting_schema.js**
   - Creates foundational tables: meetings, meeting_participants, meeting_knowledge
   - Sets up RLS policies and real-time subscriptions
   - Establishes core indexes for performance

2. **20250615053210_add_participant_constraints.js**
   - Adds unique constraints for upsert operations
   - Prevents duplicate participant entries

3. **20250619185326_add_vector_search_rag.js**
   - Adds vector embeddings (1536-dimensional)
   - Creates hybrid search functions
   - Enables semantic search capabilities

4. **20250628125031_add_project_team_support.js**
   - Implements multi-tenant project management
   - Adds role-based team membership
   - Creates automatic triggers for ownership

## Common Operations

### Adding Columns
```javascript
export const up = (pgm) => {
  pgm.addColumns('existing_table', {
    new_column: { type: 'text' },
    another_column: { type: 'boolean', default: false }
  });
};

export const down = (pgm) => {
  pgm.dropColumns('existing_table', ['new_column', 'another_column']);
};
```

### Modifying Columns
```javascript
export const up = (pgm) => {
  pgm.alterColumn('table_name', 'column_name', {
    type: 'varchar(255)',
    notNull: true
  });
};
```

### Adding Constraints
```javascript
export const up = (pgm) => {
  pgm.addConstraint('table_name', 'constraint_name', {
    unique: ['col1', 'col2']
  });
  
  pgm.addConstraint('table_name', 'check_constraint', {
    check: "status IN ('active', 'inactive')"
  });
};
```

### Creating Functions
```javascript
export const up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION function_name()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS function_name()');
};
```

## Troubleshooting

### Common Issues

#### SASL Authentication Error
```
SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing
```

**Solution**: Ensure you're using the actual database password, not the service role key:
```bash
node scripts/setup-database-url.js
```

#### Permission Denied
```
permission denied for table pgmigrations
```

**Solution**: Use the session pooler URL format and ensure proper database credentials.

#### Migration File Not Found
```
Migration file not found
```

**Solution**: Ensure migration files are in `local_migrations/` and use `.js` extension.

### Recovery Procedures

#### Reset Local Database
```bash
# 1. Clear all tables (be careful!)
npm run db:reset  # If we add this script

# 2. Or manually clear and re-run
# Clear tables in Supabase dashboard, then:
npm run migrate:up
```

#### Fix Broken Migration
1. Roll back to last working state
2. Fix the migration file
3. Re-run migrations

```bash
npm run migrate:down
# Fix the .js file
npm run migrate:up
```

## Team Workflow

### When Starting Work
```bash
git pull origin main
npm run migrate:up  # Apply any new migrations
```

### When Creating Features
1. Create feature branch
2. Create migration if needed: `npm run migrate:create feature_name`
3. Develop and test
4. Commit migration with feature code

### Before Merging
1. Ensure migrations run cleanly
2. Test rollback functionality
3. Document any breaking changes

### Production Deployment
1. Backup database
2. Run migrations: `npm run migrate:up`
3. Verify application functionality
4. Monitor for issues

## Security Considerations

### Row Level Security
Always enable RLS on new tables:
```javascript
pgm.sql('ALTER TABLE table_name ENABLE ROW LEVEL SECURITY');
```

### Permissions
Use appropriate policies for your use case:
- `anon` - Unauthenticated users
- `authenticated` - Logged-in users
- Custom role-based policies

### Data Migration
Never include sensitive data in migration files. Use separate data seeding scripts for:
- Test data
- Default configurations
- User content

## Performance Considerations

### Indexes
Add indexes for:
- Foreign key columns
- Frequently queried columns
- Unique constraints
- Vector similarity searches

### Large Tables
For tables with significant data:
- Test migrations on production-sized datasets
- Consider adding indexes before bulk operations
- Use batched operations for large updates

### Vector Operations
Our vector search implementation includes:
- IVFFlat indexes for approximate nearest neighbor
- GIN indexes for keyword arrays
- Composite indexes for multi-column queries

---

## References

- [node-pg-migrate Documentation](https://salsita.github.io/node-pg-migrate/)
- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
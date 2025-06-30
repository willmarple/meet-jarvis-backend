#!/usr/bin/env node

/**
 * Conditional migration runner
 * Only runs migrations when RUN_MIGRATIONS environment variable is set to 'true'
 * This prevents automatic migration execution in deployment environments like Bolt.new
 */

import { execSync } from 'child_process';

const shouldRunMigrations = process.env.RUN_MIGRATIONS === 'true';
const command = process.argv[2]; // 'up', 'down', or 'create'

if (!shouldRunMigrations) {
  console.log('🚫 Skipping migrations (RUN_MIGRATIONS not set to "true")');
  console.log('💡 To run migrations locally, set: RUN_MIGRATIONS=true');
  process.exit(0);
}

if (!command) {
  console.error('❌ Migration command required: up, down, or create');
  process.exit(1);
}

const migrationCommands = {
  up: 'npx node-pg-migrate up --migrations-dir local_migrations --migration-file-language js',
  down: 'npx node-pg-migrate down --migrations-dir local_migrations --migration-file-language js',
  create: 'npx node-pg-migrate create --migrations-dir local_migrations --migration-file-language js'
};

const migrationCommand = migrationCommands[command];

if (!migrationCommand) {
  console.error(`❌ Unknown migration command: ${command}`);
  console.error('Available commands: up, down, create');
  process.exit(1);
}

try {
  console.log(`🚀 Running migration: ${command}`);
  console.log(`📁 Command: ${migrationCommand}`);
  
  execSync(migrationCommand, { 
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  console.log(`✅ Migration ${command} completed successfully`);
} catch (error) {
  console.error(`❌ Migration ${command} failed:`, error.message);
  process.exit(1);
}
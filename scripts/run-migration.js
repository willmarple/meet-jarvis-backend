#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function ensureMigrationsDir() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    log(`Created migrations directory: ${MIGRATIONS_DIR}`, 'green');
  }
}

function getMigrationFiles() {
  ensureMigrationsDir();
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

function extractMigrationInfo(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  
  // Extract title from first comment block
  const titleMatch = content.match(/\/\*\s*#\s*(.+?)\s*\n/);
  const title = titleMatch ? titleMatch[1] : 'No title';
  
  // Count SQL statements (rough estimate)
  const statements = content.split(';').filter(s => s.trim().length > 0).length;
  
  // Check for common patterns
  const hasCreateTable = /CREATE TABLE/i.test(content);
  const hasAlterTable = /ALTER TABLE/i.test(content);
  const hasCreateIndex = /CREATE INDEX/i.test(content);
  const hasRLS = /ROW LEVEL SECURITY|CREATE POLICY/i.test(content);
  const hasExtension = /CREATE EXTENSION/i.test(content);
  
  return {
    filename,
    title,
    statements,
    hasCreateTable,
    hasAlterTable,
    hasCreateIndex,
    hasRLS,
    hasExtension,
    size: fs.statSync(filepath).size
  };
}

function listMigrations() {
  const files = getMigrationFiles();
  
  if (files.length === 0) {
    log('No migration files found.', 'yellow');
    return;
  }
  
  log('\n📋 Migration Files:', 'bright');
  log('=' .repeat(80), 'cyan');
  
  files.forEach((file, index) => {
    const info = extractMigrationInfo(file);
    log(`\n${index + 1}. ${file}`, 'bright');
    log(`   Title: ${info.title}`, 'cyan');
    log(`   Size: ${info.size} bytes | Statements: ~${info.statements}`, 'blue');
    
    const features = [];
    if (info.hasCreateTable) features.push('CREATE TABLE');
    if (info.hasAlterTable) features.push('ALTER TABLE');
    if (info.hasCreateIndex) features.push('INDEX');
    if (info.hasRLS) features.push('RLS');
    if (info.hasExtension) features.push('EXTENSION');
    
    if (features.length > 0) {
      log(`   Features: ${features.join(', ')}`, 'green');
    }
  });
  
  log('\n' + '=' .repeat(80), 'cyan');
}

function showMigration(filename) {
  const files = getMigrationFiles();
  const targetFile = files.find(f => f.includes(filename) || f === filename);
  
  if (!targetFile) {
    log(`Migration file not found: ${filename}`, 'red');
    log('Available files:', 'yellow');
    files.forEach(f => log(`  - ${f}`, 'blue'));
    return;
  }
  
  const filepath = path.join(MIGRATIONS_DIR, targetFile);
  const content = fs.readFileSync(filepath, 'utf8');
  
  log(`\n📄 Migration: ${targetFile}`, 'bright');
  log('=' .repeat(80), 'cyan');
  log(content);
  log('=' .repeat(80), 'cyan');
}

function validateMigration(filename) {
  const files = getMigrationFiles();
  const targetFile = files.find(f => f.includes(filename) || f === filename);
  
  if (!targetFile) {
    log(`Migration file not found: ${filename}`, 'red');
    return;
  }
  
  const filepath = path.join(MIGRATIONS_DIR, targetFile);
  const content = fs.readFileSync(filepath, 'utf8');
  const info = extractMigrationInfo(targetFile);
  
  log(`\n🔍 Validating: ${targetFile}`, 'bright');
  log('=' .repeat(60), 'cyan');
  
  const issues = [];
  const warnings = [];
  
  // Check for common issues
  if (!content.trim()) {
    issues.push('File is empty');
  }
  
  if (!content.includes('/*') && !content.includes('--')) {
    warnings.push('No comments found - consider adding documentation');
  }
  
  if (content.includes('DROP TABLE') && !content.includes('IF EXISTS')) {
    issues.push('DROP TABLE without IF EXISTS - could fail if table doesn\'t exist');
  }
  
  if (content.includes('CREATE TABLE') && !content.includes('IF NOT EXISTS')) {
    warnings.push('CREATE TABLE without IF NOT EXISTS - could fail if table exists');
  }
  
  if (info.hasRLS && !content.includes('ENABLE ROW LEVEL SECURITY')) {
    warnings.push('RLS policies found but no ENABLE ROW LEVEL SECURITY statement');
  }
  
  if (content.includes('gen_random_uuid()') && !content.includes('CREATE EXTENSION')) {
    warnings.push('Uses gen_random_uuid() but no uuid-ossp extension creation found');
  }
  
  // Check for vector extension usage
  if (content.includes('vector') && !content.includes('CREATE EXTENSION IF NOT EXISTS vector')) {
    warnings.push('Uses vector type but no vector extension creation found');
  }
  
  // Display results
  if (issues.length === 0 && warnings.length === 0) {
    log('✅ No issues found!', 'green');
  } else {
    if (issues.length > 0) {
      log('\n❌ Issues:', 'red');
      issues.forEach(issue => log(`  - ${issue}`, 'red'));
    }
    
    if (warnings.length > 0) {
      log('\n⚠️  Warnings:', 'yellow');
      warnings.forEach(warning => log(`  - ${warning}`, 'yellow'));
    }
  }
  
  log(`\n📊 Summary:`, 'bright');
  log(`  - File size: ${info.size} bytes`, 'blue');
  log(`  - Estimated statements: ${info.statements}`, 'blue');
  log(`  - Features: ${[
    info.hasCreateTable && 'Tables',
    info.hasAlterTable && 'Alterations', 
    info.hasCreateIndex && 'Indexes',
    info.hasRLS && 'RLS',
    info.hasExtension && 'Extensions'
  ].filter(Boolean).join(', ') || 'None detected'}`, 'blue');
  
  log('=' .repeat(60), 'cyan');
}

function createMigration(description) {
  if (!description) {
    log('Please provide a description for the migration', 'red');
    log('Usage: node scripts/run-migration.js create "Add user authentication"', 'yellow');
    return;
  }
  
  ensureMigrationsDir();
  
  // Generate timestamp-based filename
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const slug = description.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  
  const filename = `${timestamp}_${slug}.sql`;
  const filepath = path.join(MIGRATIONS_DIR, filename);
  
  const template = `/*
  # ${description}

  1. New Tables
    - Describe any new tables and their purpose
    
  2. Changes
    - List any modifications to existing tables
    
  3. Security
    - Describe RLS policies and security measures
    
  4. Notes
    - Any important implementation details
*/

-- Add your SQL statements here
-- Example:
-- CREATE TABLE IF NOT EXISTS example_table (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   name text NOT NULL,
--   created_at timestamptz DEFAULT now()
-- );

-- ALTER TABLE example_table ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can read own data"
--   ON example_table
--   FOR SELECT
--   TO authenticated
--   USING (auth.uid() = user_id);
`;
  
  fs.writeFileSync(filepath, template);
  log(`\n✅ Created migration: ${filename}`, 'green');
  log(`📁 Location: ${filepath}`, 'blue');
  log(`\n📝 Next steps:`, 'bright');
  log(`  1. Edit the migration file with your SQL`, 'yellow');
  log(`  2. Validate: node scripts/run-migration.js validate ${filename}`, 'yellow');
  log(`  3. Apply to Supabase when ready`, 'yellow');
}

// Main command handler
function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  switch (command) {
    case 'list':
      listMigrations();
      break;
      
    case 'show':
      if (!arg) {
        log('Please specify a migration filename', 'red');
        log('Usage: node scripts/run-migration.js show <filename>', 'yellow');
        return;
      }
      showMigration(arg);
      break;
      
    case 'validate':
      if (!arg) {
        log('Please specify a migration filename', 'red');
        log('Usage: node scripts/run-migration.js validate <filename>', 'yellow');
        return;
      }
      validateMigration(arg);
      break;
      
    case 'create':
      createMigration(arg);
      break;
      
    default:
      log('\n🛠️  Migration Management Tool', 'bright');
      log('=' .repeat(40), 'cyan');
      log('\nAvailable commands:', 'bright');
      log('  list                    - List all migrations with info', 'green');
      log('  show <filename>         - Display migration content', 'green');
      log('  validate <filename>     - Check migration for issues', 'green');
      log('  create "description"    - Create new migration template', 'green');
      log('\nExamples:', 'bright');
      log('  node scripts/run-migration.js list', 'yellow');
      log('  node scripts/run-migration.js show muddy_leaf', 'yellow');
      log('  node scripts/run-migration.js validate yellow_wood', 'yellow');
      log('  node scripts/run-migration.js create "Add vector search"', 'yellow');
      log('=' .repeat(40), 'cyan');
  }
}

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  listMigrations,
  showMigration,
  validateMigration,
  createMigration
};
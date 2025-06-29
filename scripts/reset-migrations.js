#!/usr/bin/env node

/**
 * Reset migration state by clearing the pgmigrations table
 * Use this when you need to start fresh with migrations
 */

import { config } from 'dotenv';
import pg from 'pg';
const { Client } = pg;

// Load environment variables
config();

async function resetMigrations() {
  const databaseUrl = "postgresql://postgres.mgikppwblqnsssbkskbj:i61pQvpkCqu2xD%25Q@aws-0-us-east-2.pooler.supabase.com:5432/postgres";
  
  const client = new Client({
    connectionString: databaseUrl
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database');

    // First, let's see what tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Current tables:', tablesResult.rows.map(r => r.table_name));

    // Check if pgmigrations table exists
    const migrationCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'pgmigrations'
    `);

    if (migrationCheck.rows[0].count > 0) {
      // Get current migration records
      const migrationsResult = await client.query('SELECT * FROM pgmigrations ORDER BY id');
      console.log('📋 Current migration records:');
      migrationsResult.rows.forEach(row => {
        console.log(`  - ${row.name} (ran at: ${row.run_on})`);
      });

      // Clear the pgmigrations table
      await client.query('DELETE FROM pgmigrations');
      console.log('✅ Cleared pgmigrations table');
    } else {
      console.log('📋 No pgmigrations table found');
    }

    // Optionally drop all our tables to start completely fresh
    console.log('\n🧹 Dropping all existing tables...');
    
    // Drop tables in reverse dependency order
    const tablesToDrop = [
      'meeting_knowledge',
      'meeting_participants', 
      'meetings',
      'project_members',
      'projects',
      'invite_tokens'
    ];

    for (const table of tablesToDrop) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`⚠️ Could not drop ${table}: ${error.message}`);
      }
    }

    console.log('\n✅ Database reset complete! You can now run migrations from scratch.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetMigrations();
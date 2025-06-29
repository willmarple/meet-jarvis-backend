#!/usr/bin/env node

/**
 * Helper script to construct DATABASE_URL for migrations
 * Reads environment variables and outputs the correct PostgreSQL connection string
 */

import { config } from 'dotenv';

// Load environment variables
config();

function setupDatabaseUrl() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const databasePassword = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl) {
    console.error('❌ VITE_SUPABASE_URL not found in environment');
    process.exit(1);
  }

  if (!databasePassword) {
    console.error('❌ SUPABASE_DB_PASSWORD not found in environment');
    console.error('📋 Please add your Supabase Database Password to .env:');
    console.error('   1. Go to your Supabase dashboard');
    console.error('   2. Project Settings → Database → Connection string');
    console.error('   3. Copy the database password (NOT the service role key)');
    console.error('   4. Add SUPABASE_DB_PASSWORD=your_db_password to .env');
    console.error('');
    console.error('💡 Note: This is different from the service role key!');
    console.error('   The database password is for PostgreSQL user authentication');
    console.error('   The service role key is for Supabase API authentication');
    process.exit(1);
  }

  // Extract project reference from Supabase URL
  const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    console.error('❌ Invalid Supabase URL format:', supabaseUrl);
    process.exit(1);
  }

  const projectRef = urlMatch[1];
  
  // URL encode the password to handle special characters like %
  const encodedPassword = encodeURIComponent(databasePassword);
  
  // Use session pooler format (standard for Supabase)
  // Format: postgres://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
  const databaseUrl = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-us-east-2.pooler.supabase.com:5432/postgres`;

  console.log('✅ Database URL constructed successfully');
  console.log('📋 Project Reference:', projectRef);
  console.log('🔗 Database URL:', databaseUrl.replace(encodedPassword, '[ENCODED_PASSWORD]'));
  console.log('');
  console.log('✅ Password URL-encoded to handle special characters (% becomes %25)');
  console.log('✅ Using session pooler for better compatibility with DDL operations');
  console.log('✅ This should fix SASL authentication errors');
  
  return databaseUrl;
}

// If run directly, output the DATABASE_URL
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const databaseUrl = setupDatabaseUrl();
    console.log('\n🚀 To run migrations:');
    console.log(`   export DATABASE_URL="${databaseUrl}"`);
    console.log('   npm run migrate:up');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export { setupDatabaseUrl };
#!/usr/bin/env node

/**
 * CLI tool for listing and managing existing invite tokens
 * 
 * Usage:
 *   npm run tokens:list
 *   npm run tokens:list -- --used
 *   npm run tokens:list -- --expired
 *   npm run tokens:list -- --role judge
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    showUsed: false,
    showExpired: false,
    role: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--used':
      case '-u':
        options.showUsed = true;
        break;
      case '--expired':
      case '-e':
        options.showExpired = true;
        break;
      case '--role':
      case '-r':
        options.role = args[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
📋 Invite Token Lister

Usage:
  npm run tokens:list [options]

Options:
  -u, --used                Show used tokens
  -e, --expired             Show expired tokens  
  -r, --role <role>         Filter by role (judge, admin, member)
  -h, --help                Show this help message

Examples:
  # List all active tokens
  npm run tokens:list

  # List used tokens
  npm run tokens:list -- --used

  # List expired tokens
  npm run tokens:list -- --expired

  # List judge tokens only
  npm run tokens:list -- --role judge
`);
}

function formatTokensTable(tokens) {
  if (tokens.length === 0) {
    console.log('\n📭 No tokens found matching the criteria.');
    return;
  }

  console.log(`\n📋 Found ${tokens.length} invite token(s):`);
  console.log('─'.repeat(140));
  console.log('│ Token (first 16 chars)   │ Email                   │ Role   │ Status    │ Expires              │ Used By         │');
  console.log('─'.repeat(140));
  
  tokens.forEach(token => {
    const tokenDisplay = token.token.substring(0, 16) + '...';
    const emailDisplay = (token.email || 'ANY').padEnd(23);
    const roleDisplay = token.role.padEnd(6);
    
    let statusDisplay = 'ACTIVE  ';
    if (token.used_at) {
      statusDisplay = 'USED    ';
    } else if (new Date(token.expires_at) < new Date()) {
      statusDisplay = 'EXPIRED ';
    } else if (!token.is_active) {
      statusDisplay = 'DISABLED';
    }
    
    const expiresDisplay = new Date(token.expires_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).padEnd(20);
    
    const usedByDisplay = (token.used_by_user_id 
      ? token.used_by_user_id.substring(0, 15) 
      : '-'
    ).padEnd(15);
    
    console.log(`│ ${tokenDisplay.padEnd(24)} │ ${emailDisplay} │ ${roleDisplay} │ ${statusDisplay} │ ${expiresDisplay} │ ${usedByDisplay} │`);
  });
  
  console.log('─'.repeat(140));
}

function printTokenStats(tokens) {
  const now = new Date();
  const stats = {
    total: tokens.length,
    active: tokens.filter(t => !t.used_at && new Date(t.expires_at) > now && t.is_active).length,
    used: tokens.filter(t => t.used_at).length,
    expired: tokens.filter(t => !t.used_at && new Date(t.expires_at) <= now).length,
    disabled: tokens.filter(t => !t.used_at && !t.is_active).length,
    byRole: {}
  };

  // Count by role
  tokens.forEach(token => {
    stats.byRole[token.role] = (stats.byRole[token.role] || 0) + 1;
  });

  console.log(`\n📊 Token Statistics:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   Active: ${stats.active}`);
  console.log(`   Used: ${stats.used}`);
  console.log(`   Expired: ${stats.expired}`);
  if (stats.disabled > 0) {
    console.log(`   Disabled: ${stats.disabled}`);
  }
  
  console.log(`\n📈 By Role:`);
  Object.entries(stats.byRole).forEach(([role, count]) => {
    console.log(`   ${role}: ${count}`);
  });
}

async function listTokens() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }

  // Validate environment
  if (!process.env.VITE_SUPABASE_URL) {
    console.error('❌ VITE_SUPABASE_URL not found in environment');
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!serviceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
  }

  // Initialize Supabase with service key to bypass RLS
  const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceKey);

  try {
    console.log('📋 Fetching invite tokens...');

    // Build query
    let query = supabase
      .from('invite_tokens')
      .select('*');

    // Apply filters
    if (options.role) {
      query = query.eq('role', options.role);
    }

    const { data: tokens, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching tokens:', error.message);
      process.exit(1);
    }

    // Apply post-query filters
    let filteredTokens = tokens;
    const now = new Date();

    if (!options.showUsed && !options.showExpired) {
      // Default: show only active tokens
      filteredTokens = tokens.filter(token => 
        !token.used_at && 
        new Date(token.expires_at) > now && 
        token.is_active
      );
    } else {
      if (options.showUsed) {
        filteredTokens = tokens.filter(token => token.used_at);
      } else if (options.showExpired) {
        filteredTokens = tokens.filter(token => 
          !token.used_at && new Date(token.expires_at) <= now
        );
      }
    }

    formatTokensTable(filteredTokens);
    printTokenStats(tokens);

    if (!options.showUsed && !options.showExpired && filteredTokens.length < tokens.length) {
      console.log(`\n💡 Use --used or --expired flags to see inactive tokens.`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  listTokens().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

export { listTokens };
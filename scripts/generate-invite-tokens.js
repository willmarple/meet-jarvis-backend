#!/usr/bin/env node

/**
 * CLI tool for generating invite tokens for hackathon judges
 * 
 * Usage:
 *   npm run tokens:generate -- --count 5 --role judge --days 30
 *   npm run tokens:generate -- --emails judge1@example.com,judge2@example.com
 *   npm run tokens:generate -- --help
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Load environment variables
config();

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    count: 1,
    role: 'judge',
    days: 30,
    emails: [],
    help: false,
    createdBy: 'admin-cli',
    metadata: { purpose: 'hackathon_judge_access', generated_via: 'cli' }
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--count':
      case '-c':
        options.count = parseInt(args[++i]) || 1;
        break;
      case '--role':
      case '-r':
        options.role = args[++i] || 'judge';
        break;
      case '--days':
      case '-d':
        options.days = parseInt(args[++i]) || 30;
        break;
      case '--emails':
      case '-e':
        options.emails = args[++i]?.split(',').map(e => e.trim()) || [];
        break;
      case '--created-by':
        options.createdBy = args[++i] || 'admin-cli';
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  // If emails provided, set count to match
  if (options.emails.length > 0) {
    options.count = options.emails.length;
  }

  return options;
}

function showHelp() {
  console.log(`
🎫 Invite Token Generator

Usage:
  npm run tokens:generate [options]

Options:
  -c, --count <number>      Number of tokens to generate (default: 1)
  -r, --role <role>         Role to assign (judge, admin, member) (default: judge)
  -d, --days <number>       Days until expiration (default: 30)
  -e, --emails <emails>     Comma-separated list of emails (optional)
  --created-by <user>       User ID for token creator (default: admin-cli)
  -h, --help                Show this help message

Examples:
  # Generate 5 judge tokens valid for 30 days
  npm run tokens:generate -- --count 5 --role judge --days 30

  # Generate tokens for specific emails
  npm run tokens:generate -- --emails "judge1@example.com,judge2@example.com"

  # Generate admin token valid for 7 days
  npm run tokens:generate -- --count 1 --role admin --days 7

Environment Requirements:
  - VITE_SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)
`);
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function formatTable(tokens) {
  console.log('\n📋 Generated Invite Tokens:');
  console.log('─'.repeat(120));
  console.log('│ Token                            │ Email                   │ Role   │ Expires              │');
  console.log('─'.repeat(120));
  
  tokens.forEach(token => {
    const tokenDisplay = token.token.substring(0, 16) + '...';
    const emailDisplay = (token.email || 'ANY').padEnd(23);
    const roleDisplay = token.role.padEnd(6);
    const expiresDisplay = new Date(token.expires_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    console.log(`│ ${tokenDisplay.padEnd(32)} │ ${emailDisplay} │ ${roleDisplay} │ ${expiresDisplay.padEnd(20)} │`);
  });
  
  console.log('─'.repeat(120));
}

function formatTokenList(tokens) {
  console.log('\n🎫 Complete Token List:');
  tokens.forEach((token, index) => {
    console.log(`\n${index + 1}. Token: ${token.token}`);
    if (token.email) console.log(`   Email: ${token.email}`);
    console.log(`   Role: ${token.role}`);
    console.log(`   Expires: ${new Date(token.expires_at).toISOString()}`);
    console.log(`   Signup URL: ${process.env.VITE_CLERK_SIGNUP_URL || 'https://your-app.com/signup'}?token=${token.token}`);
  });
}

async function generateTokens() {
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

  // Initialize Supabase
  const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceKey);

  console.log('🎫 Generating invite tokens...');
  console.log(`📊 Count: ${options.count}`);
  console.log(`🎭 Role: ${options.role}`);
  console.log(`📅 Valid for: ${options.days} days`);
  if (options.emails.length > 0) {
    console.log(`📧 Emails: ${options.emails.join(', ')}`);
  }

  const tokens = [];
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + options.days);

  try {
    for (let i = 0; i < options.count; i++) {
      const token = generateSecureToken();
      const email = options.emails[i] || null;
      
      const { data, error } = await supabase
        .from('invite_tokens')
        .insert([{
          token,
          email,
          role: options.role,
          created_by: options.createdBy,
          expires_at: expiresAt.toISOString(),
          metadata: {
            ...options.metadata,
            generated_at: new Date().toISOString(),
            email_specific: !!email
          }
        }])
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating token ${i + 1}:`, error.message);
        continue;
      }

      tokens.push(data);
      console.log(`✅ Generated token ${i + 1}/${options.count}`);
    }

    if (tokens.length === 0) {
      console.error('❌ No tokens were created successfully');
      process.exit(1);
    }

    // Display results
    formatTable(tokens);
    
    if (tokens.length <= 5) {
      formatTokenList(tokens);
    } else {
      console.log(`\n💡 Use --help to see format options. ${tokens.length} tokens generated successfully.`);
    }

    console.log(`\n🎉 Successfully generated ${tokens.length} invite token(s)!`);
    console.log(`⏰ Tokens expire: ${expiresAt.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`);

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTokens().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

export { generateTokens };
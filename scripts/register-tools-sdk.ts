#!/usr/bin/env node

import dotenv from 'dotenv';
import { ElevenLabsToolRegistrationSDK } from '../dist/services/elevenLabsToolRegistrationSDK.js';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  console.log('🚀 Starting ElevenLabs tool registration with official SDK...');
  
  try {
    // Create registration service
    const registration = new ElevenLabsToolRegistrationSDK();
    
    // Get command line arguments
    const args = process.argv.slice(2);
    const shouldClean = args.includes('--clean') || args.includes('-c');
    
    // First test the connection by listing existing tools
    console.log('🔍 Testing SDK connection by listing existing tools...');
    try {
      const existingToolsResponse = await registration.listTools();
      const existingTools = existingToolsResponse.tools || [];
      console.log(`✅ SDK connection successful. Found ${existingTools.length} existing tools.`);
      if (existingTools.length > 0) {
        console.log('Existing tools:', existingTools.map(t => `${t.name} (${t.type || 'unknown'})`).join(', '));
      }
    } catch (error) {
      console.error('❌ SDK connection failed:', error instanceof Error ? error.message : error);
      throw error;
    }

    let results;
    
    if (shouldClean) {
      console.log('🧹 Clean mode: Will remove existing client tools first');
      results = await registration.cleanAndRegisterTools();
    } else {
      console.log('📝 Register mode: Adding tools (may duplicate if they exist)');
      results = await registration.registerAllTools();
    }
    
    // Print summary
    console.log('\n📊 Registration Summary:');
    console.log('========================');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    if (successful.length > 0) {
      successful.forEach(r => console.log(`   - ${r.tool}`));
    }
    
    if (failed.length > 0) {
      console.log(`❌ Failed: ${failed.length}/${results.length}`);
      failed.forEach(r => console.log(`   - ${r.tool}: ${r.error}`));
    }
    
    if (failed.length === 0) {
      console.log('\n🎉 All tools registered successfully with the official SDK!');
      console.log('Your ElevenLabs agent now has these client tools available.');
    } else {
      console.log('\n⚠️  Some tools failed to register. Check the errors above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Registration process failed:', error instanceof Error ? error.message : error);
    console.error('\nPlease check:');
    console.error('1. ELEVENLABS_API_KEY is set in your .env file');
    console.error('2. ELEVENLABS_AGENT_ID is set in your .env file');
    console.error('3. Your API key has the correct permissions');
    console.error('4. Your agent ID is valid');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the script
main();
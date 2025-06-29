import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Load test environment variables
config({ path: path.join(__dirname, '../.env.test') });

const execAsync = promisify(exec);

// Demo data configuration
const TEST_MEETING_ID = 'TASKFLOW-DEMO';
const TEST_PARTICIPANTS = [
  'Sarah (PM)', 'Mike (Frontend)', 'Lisa (Backend)', 
  'David (DevOps)', 'Emma (Designer)', 'Tom (QA)', 'Alex (Backend)'
];

// Smaller subset of demo knowledge for faster testing
const TEST_KNOWLEDGE = [
  {
    content: "TaskFlow is a full-stack project management SaaS application currently in month 6 of an 8-month development cycle.",
    content_type: 'context',
    source: 'document'
  },
  {
    content: "Current API response times are averaging 800ms, which is significantly above our target of 200ms for 95th percentile.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "We decided to implement Redis caching for frequently accessed data and move to connection pooling with PgBouncer.",
    content_type: 'summary',
    source: 'ai'
  },
  {
    content: "Mike needs to complete the drag-and-drop prototype by November 20th for Sprint 12 demo.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "How should we handle offline functionality for mobile users?",
    content_type: 'question',
    source: 'user'
  },
  {
    content: "For offline functionality, we should implement service workers for caching and local storage for temporary data persistence.",
    content_type: 'answer',
    source: 'ai'
  }
];

// Mock embedding service for testing
class MockEmbeddingService {
  constructor() {
    this.mockMode = true;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Generate a mock 1536-dimensional embedding based on text content
    const hash = this.simpleHash(text);
    const embedding = [];
    for (let i = 0; i < 1536; i++) {
      embedding.push((Math.sin(hash + i) + 1) / 2); // Normalize to 0-1
    }
    return embedding;
  }

  async extractKeywords(text: string): Promise<string[]> {
    // Simple keyword extraction for testing
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'have', 'will', 'been', 'from', 'they', 'them'].includes(word));
    
    const uniqueWords = [...new Set(words)];
    return uniqueWords.slice(0, 5);
  }

  async generateSummary(text: string): Promise<string> {
    // Mock summary generation
    return text.length > 100 ? text.substring(0, 97) + '...' : text;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

export class TestDataManager {
  private supabase: ReturnType<typeof createClient>;
  private embeddingService: MockEmbeddingService;

  constructor() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Test Supabase credentials not found in environment variables');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.embeddingService = new MockEmbeddingService();
  }

  async setupDatabase(): Promise<void> {
    console.log('🗄️ Setting up test database schema...');
    
    try {
      // Set DATABASE_URL for migrations using local Supabase
      const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
      process.env.DATABASE_URL = databaseUrl;
      
      // Change to project root for migration commands
      const projectRoot = path.join(__dirname, '../..');
      
      // Run migrations to set up schema
      console.log('📋 Running database migrations...');
      const { stderr } = await execAsync('npm run migrate:up', {
        cwd: projectRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl, RUN_MIGRATIONS: 'true' }
      });
      
      if (stderr && !stderr.includes('npm warn')) {
        console.warn('Migration warnings:', stderr);
      }
      
      console.log('✅ Database schema setup complete');
      
    } catch (error) {
      console.error('❌ Error setting up database:', error);
      throw error;
    }
  }

  async setupTestData(): Promise<void> {
    console.log('🧪 Setting up test data for local Supabase...');
    
    try {
      // First ensure database schema is set up
      await this.setupDatabase();
      
      // Clean up any existing data first
      await this.cleanupTestData();
      
      // 1. Create test meeting
      await this.createTestMeeting();
      
      // 2. Add test participants
      await this.addTestParticipants();
      
      // 3. Generate knowledge items with mock AI enhancement
      await this.generateTestKnowledge();
      
      console.log('✅ Test data setup complete!');
      
    } catch (error) {
      console.error('❌ Error setting up test data:', error);
      throw error;
    }
  }

  async cleanupTestData(): Promise<void> {
    console.log('🧹 Cleaning up test data...');
    
    try {
      // Delete in reverse order due to foreign key constraints
      await this.supabase.from('meeting_knowledge').delete().eq('meeting_id', TEST_MEETING_ID);
      await this.supabase.from('meeting_participants').delete().eq('meeting_id', TEST_MEETING_ID);
      await this.supabase.from('meetings').delete().eq('id', TEST_MEETING_ID);
      
      console.log('✓ Test data cleaned up');
    } catch (error) {
      console.error('Error cleaning up test data:', error);
      // Don't throw here, as cleanup should be best-effort
    }
  }

  private async createTestMeeting(): Promise<void> {
    console.log('📝 Creating test meeting...');
    
    const { data, error } = await this.supabase
      .from('meetings')
      .upsert([{
        id: TEST_MEETING_ID,
        name: 'TaskFlow Sprint 12 Planning - Test Meeting',
        host_id: 'test-host',
        created_at: new Date().toISOString(),
        is_active: true
      }])
      .select();
    
    if (error) {
      console.error('Error creating test meeting:', error);
      throw error;
    }
    
    console.log('✓ Test meeting created:', data);
  }

  private async addTestParticipants(): Promise<void> {
    console.log('👥 Adding test participants...');
    
    const participants = TEST_PARTICIPANTS.map((name, index) => ({
      meeting_id: TEST_MEETING_ID,
      user_name: name,
      user_id: `test-user-${index}`,
      joined_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      is_connected: Math.random() > 0.3
    }));

    const { data, error } = await this.supabase
      .from('meeting_participants')
      .upsert(participants, { onConflict: 'meeting_id,user_id' })
      .select();
    
    if (error) {
      console.error('Error adding test participants:', error);
      throw error;
    }
    
    console.log(`✓ Added ${participants.length} test participants:`, data?.length);
  }

  private async generateTestKnowledge(): Promise<void> {
    console.log('🧠 Generating test knowledge items with mock AI enhancement...');
    
    let processedCount = 0;
    
    for (const item of TEST_KNOWLEDGE) {
      try {
        // Insert knowledge item
        const { data: knowledgeItem, error } = await this.supabase
          .from('meeting_knowledge')
          .insert([{
            meeting_id: TEST_MEETING_ID,
            content: item.content,
            content_type: item.content_type,
            source: item.source,
            created_at: new Date(Date.now() - Math.random() * 86400000).toISOString()
          }])
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting knowledge item:', error);
          continue;
        }
        
        // Generate mock AI enhancements
        const [embedding, keywords, summary] = await Promise.all([
          this.embeddingService.generateEmbedding(item.content),
          this.embeddingService.extractKeywords(item.content),
          this.embeddingService.generateSummary(item.content)
        ]);

        // Update with mock enhancements
        const { error: updateError } = await this.supabase
          .from('meeting_knowledge')
          .update({
            embedding,
            keywords,
            summary,
            updated_at: new Date().toISOString()
          })
          .eq('id', knowledgeItem.id);

        if (updateError) {
          console.error('Error updating knowledge item:', updateError);
        } else {
          processedCount++;
          console.log(`✓ Processed test knowledge item ${processedCount}/${TEST_KNOWLEDGE.length}`);
        }
        
      } catch (error) {
        console.error('Error processing knowledge item:', error);
      }
    }
    
    console.log(`✓ Generated and enhanced ${processedCount} test knowledge items`);
  }

  async verifyTestData(): Promise<{
    meeting: boolean;
    participants: number;
    knowledge: number;
  }> {
    console.log('🔍 Verifying test data...');
    
    // Check meeting exists
    const { data: meeting, error: meetingError } = await this.supabase
      .from('meetings')
      .select('*')
      .eq('id', TEST_MEETING_ID)
      .single();

    // Check participants
    const { data: participants, error: participantsError } = await this.supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', TEST_MEETING_ID);

    // Check knowledge items
    const { data: knowledge, error: knowledgeError } = await this.supabase
      .from('meeting_knowledge')
      .select('*')
      .eq('meeting_id', TEST_MEETING_ID);

    const verification = {
      meeting: !meetingError && !!meeting,
      participants: participantsError ? 0 : (participants?.length || 0),
      knowledge: knowledgeError ? 0 : (knowledge?.length || 0)
    };

    console.log('🔍 Test data verification:', verification);
    return verification;
  }

  static get TEST_MEETING_ID() {
    return TEST_MEETING_ID;
  }
}
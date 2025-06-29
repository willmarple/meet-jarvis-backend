#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

// Demo data configuration
const DEMO_MEETING_ID = 'TASKFLOW-DEMO';
const DEMO_PARTICIPANTS = [
  'Sarah (PM)', 'Mike (Frontend)', 'Lisa (Backend)', 
  'David (DevOps)', 'Emma (Designer)', 'Tom (QA)', 'Alex (Backend)'
];

// TaskFlow project demo knowledge items
const DEMO_KNOWLEDGE = [
  // Project Context
  {
    content: "TaskFlow is a full-stack project management SaaS application currently in month 6 of an 8-month development cycle. The team consists of 8 developers working remotely across 3 time zones.",
    content_type: 'context',
    source: 'document'
  },
  {
    content: "Tech stack includes React/TypeScript frontend, Node.js/Express backend, PostgreSQL database, and AWS deployment infrastructure.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Core features include task management, team collaboration, time tracking, and reporting capabilities.",
    content_type: 'summary',
    source: 'user'
  },

  // Performance Issues
  {
    content: "Current API response times are averaging 800ms, which is significantly above our target of 200ms for 95th percentile.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Database connection limits are being hit during peak usage, causing intermittent service disruptions.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "We decided to implement Redis caching for frequently accessed data and move to connection pooling with PgBouncer.",
    content_type: 'summary',
    source: 'ai'
  },

  // Sprint Planning
  {
    content: "Sprint 12 focuses on implementing drag-and-drop task management using React DnD library.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Real-time collaboration features will use WebSocket connections for live updates between team members.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Mobile responsiveness is prioritized for tablet layout over phone layout due to user research findings.",
    content_type: 'summary',
    source: 'user'
  },

  // Action Items
  {
    content: "Mike needs to complete the drag-and-drop prototype by November 20th for Sprint 12 demo.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Lisa is implementing WebSocket backend infrastructure with a deadline of November 18th.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "David is setting up Redis for session management to improve performance.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Emma needs to finalize tablet wireframes by November 17th for the mobile optimization sprint.",
    content_type: 'fact',
    source: 'user'
  },

  // Technical Challenges
  {
    content: "WebSocket scaling concerns with current infrastructure - need to evaluate horizontal scaling options.",
    content_type: 'context',
    source: 'user'
  },
  {
    content: "Drag-and-drop functionality conflicts with mobile touch events, requiring custom event handling.",
    content_type: 'context',
    source: 'user'
  },
  {
    content: "Database query performance is degrading with large datasets - need to implement proper indexing strategy.",
    content_type: 'context',
    source: 'user'
  },
  {
    content: "Large file uploads are causing memory issues on the server - considering chunked upload implementation.",
    content_type: 'context',
    source: 'user'
  },

  // Architecture Decisions
  {
    content: "We decided to set up CloudFront CDN for static asset delivery to improve global performance.",
    content_type: 'summary',
    source: 'ai'
  },
  {
    content: "Target 95th percentile response time under 200ms was agreed upon for the beta launch performance criteria.",
    content_type: 'summary',
    source: 'ai'
  },
  {
    content: "PgBouncer will be configured in staging environment first before production deployment.",
    content_type: 'fact',
    source: 'user'
  },

  // Team Velocity and Progress
  {
    content: "Team velocity has increased 40% since implementing the new CI/CD pipeline in Sprint 10.",
    content_type: 'fact',
    source: 'ai'
  },
  {
    content: "TaskFlow project is 75% complete with 6 weeks remaining until beta launch.",
    content_type: 'summary',
    source: 'ai'
  },
  {
    content: "Key risks include performance optimization timeline and mobile responsiveness completion.",
    content_type: 'context',
    source: 'ai'
  },

  // Security and Testing
  {
    content: "Security audit is scheduled for week 7 before beta launch to ensure compliance standards.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Tom is setting up automated performance testing pipeline to catch regressions early.",
    content_type: 'fact',
    source: 'user'
  },
  {
    content: "Alex is optimizing N+1 query issues in task endpoints to improve database performance.",
    content_type: 'fact',
    source: 'user'
  },

  // User Feedback
  {
    content: "Beta testing feedback indicates users prefer keyboard shortcuts for task management over mouse-only interactions.",
    content_type: 'context',
    source: 'document'
  },
  {
    content: "Mobile users report difficulty with small touch targets - need to increase minimum touch area to 44px.",
    content_type: 'context',
    source: 'document'
  },

  // Questions and Answers
  {
    content: "How should we handle offline functionality for mobile users?",
    content_type: 'question',
    source: 'user'
  },
  {
    content: "For offline functionality, we should implement service workers for caching and local storage for temporary data persistence.",
    content_type: 'answer',
    source: 'ai'
  },
  {
    content: "What's our strategy for handling real-time conflicts when multiple users edit the same task?",
    content_type: 'question',
    source: 'user'
  },
  {
    content: "We'll implement operational transformation for conflict resolution, similar to Google Docs collaborative editing.",
    content_type: 'answer',
    source: 'ai'
  }
];

// Simple embedding service for demo data
class SimpleEmbeddingService {
  constructor() {
    this.openaiApiKey = process.env.VITE_OPENAI_API_KEY;
  }

  async generateEmbedding(text) {
    if (!this.openaiApiKey) {
      console.warn('OpenAI API key not configured, skipping embedding generation');
      return null;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
          encoding_format: 'float'
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  async extractKeywords(text) {
    if (!this.openaiApiKey) {
      return this.simpleKeywordExtraction(text);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Extract 5-7 relevant keywords from this text. Return only the keywords separated by commas, no explanations:\n\n${text}`
            }
          ],
          max_tokens: 100,
          temperature: 0.3
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const keywords = data.choices[0].message.content
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
      
      return keywords;
    } catch (error) {
      console.error('Error extracting keywords:', error);
      return this.simpleKeywordExtraction(text);
    }
  }

  async generateSummary(text) {
    if (!this.openaiApiKey) {
      return text.length > 100 ? text.substring(0, 97) + '...' : text;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Summarize this text in one concise sentence (max 50 words):\n\n${text}`
            }
          ],
          max_tokens: 60,
          temperature: 0.3
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      return text.length > 100 ? text.substring(0, 97) + '...' : text;
    }
  }

  simpleKeywordExtraction(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'have', 'will', 'been', 'from', 'they', 'them', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other'].includes(word));
    
    const uniqueWords = [...new Set(words)];
    return uniqueWords.slice(0, 5);
  }
}

class DemoDataGenerator {
  constructor() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not found in environment variables');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.embeddingService = new SimpleEmbeddingService();
  }

  async generateDemoData() {
    console.log('🌱 Starting TaskFlow demo data generation...');
    
    try {
      // 1. Create demo meeting
      await this.createDemoMeeting();
      
      // 2. Add demo participants
      await this.addDemoParticipants();
      
      // 3. Generate knowledge items with AI enhancement
      await this.generateKnowledgeItems();
      
      console.log('✅ Demo data generation complete!');
      console.log(`📊 Generated meeting "${DEMO_MEETING_ID}" with ${DEMO_KNOWLEDGE.length} knowledge items`);
      
    } catch (error) {
      console.error('❌ Error generating demo data:', error);
      throw error;
    }
  }

  async createDemoMeeting() {
    console.log('📝 Creating demo meeting...');
    
    const { error } = await this.supabase
      .from('meetings')
      .upsert([{
        id: DEMO_MEETING_ID,
        name: 'TaskFlow Sprint 12 Planning - Demo Meeting',
        host_id: 'demo-host',
        created_at: new Date().toISOString(),
        is_active: true
      }]);
    
    if (error) {
      console.error('Error creating demo meeting:', error);
      throw error;
    }
    
    console.log('✓ Demo meeting created');
  }

  async addDemoParticipants() {
    console.log('👥 Adding demo participants...');
    
    const participants = DEMO_PARTICIPANTS.map((name, index) => ({
      meeting_id: DEMO_MEETING_ID,
      user_name: name,
      user_id: `demo-user-${index}`,
      joined_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      is_connected: Math.random() > 0.3
    }));

    const { error } = await this.supabase
      .from('meeting_participants')
      .upsert(participants, { onConflict: 'meeting_id,user_id' });
    
    if (error) {
      console.error('Error adding demo participants:', error);
      throw error;
    }
    
    console.log(`✓ Added ${participants.length} demo participants`);
  }

  async generateKnowledgeItems() {
    console.log('🧠 Generating knowledge items with AI enhancement...');
    
    let processedCount = 0;
    
    for (const item of DEMO_KNOWLEDGE) {
      try {
        // Insert knowledge item
        const { data: knowledgeItem, error } = await this.supabase
          .from('meeting_knowledge')
          .insert([{
            meeting_id: DEMO_MEETING_ID,
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
        
        // Generate AI enhancements
        try {
          const [embedding, keywords, summary] = await Promise.all([
            this.embeddingService.generateEmbedding(item.content),
            this.embeddingService.extractKeywords(item.content),
            this.embeddingService.generateSummary(item.content)
          ]);

          // Update with enhancements
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
          }

          processedCount++;
          console.log(`✓ Processed knowledge item ${processedCount}/${DEMO_KNOWLEDGE.length}: ${item.content.substring(0, 50)}...`);
        } catch (enhancementError) {
          console.warn(`⚠️ Failed to enhance knowledge item: ${enhancementError}`);
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error('Error processing knowledge item:', error);
      }
    }
    
    console.log(`✓ Generated and enhanced ${processedCount} knowledge items`);
  }

  async cleanupDemoData() {
    console.log('🧹 Cleaning up existing demo data...');
    
    // Delete in reverse order due to foreign key constraints
    await this.supabase.from('meeting_knowledge').delete().eq('meeting_id', DEMO_MEETING_ID);
    await this.supabase.from('meeting_participants').delete().eq('meeting_id', DEMO_MEETING_ID);
    await this.supabase.from('meetings').delete().eq('id', DEMO_MEETING_ID);
    
    console.log('✓ Demo data cleaned up');
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const generator = new DemoDataGenerator();
  
  try {
    switch (command) {
      case 'generate':
        await generator.generateDemoData();
        break;
        
      case 'cleanup':
        await generator.cleanupDemoData();
        break;
        
      case 'regenerate':
        await generator.cleanupDemoData();
        await generator.generateDemoData();
        break;
        
      default:
        console.log('Usage: npm run demo-data <command>');
        console.log('Commands:');
        console.log('  generate   - Generate demo data');
        console.log('  cleanup    - Remove demo data');
        console.log('  regenerate - Clean and regenerate demo data');
        process.exit(1);
    }
  } catch (error) {
    console.error('Demo data generation failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DemoDataGenerator };
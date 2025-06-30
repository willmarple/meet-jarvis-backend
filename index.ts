import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { DemoDataGenerator } from './demoDataGenerator.js';
import { createClient } from '@supabase/supabase-js';
import { logger } from './logger.js';
import { 
  JsonValue, 
  ToolCall, 
  ParticipantData, 
  RoomData,
  TestResult,
  DatabaseTestResult,
  EmbeddingsTestResult,
  SearchTestResult,
  FunctionsTestResult,
  ComprehensiveTestResults,
  KnowledgeStatItem
} from './src/types/index.js';

// Import secure routes
import secureKnowledgeRoutes from './routes/secure-knowledge.js';
import secureMeetingRoutes from './routes/secure-meetings.js';
import secureProjectRoutes from './routes/secure-projects.js';
import secureInviteTokenRoutes from './routes/secure-invite-tokens.js';

// Load environment variables from parent directory
config({ path: '../.env' });

const app = express();
const server = createServer(app);
// CORS configuration for both local development and Bolt.new deployment
const allowedOrigins = [
  // Local development
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  // Bolt.new and StackBlitz domains
  "https://stackblitz.com",
  "https://*.stackblitz.io",
  "https://bolt.new",
  "https://*.bolt.new",
  // WebContainer API domains
  "https://*.webcontainer-api.io",
  "https://webcontainer-api.io"
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check for exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check for wildcard matches (*.stackblitz.io, *.bolt.new, etc.)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace('*', '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    // Log rejected origins for debugging
    console.warn(`CORS: Rejected origin ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Allow cookies and auth headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};

const io = new Server(server, {
  cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json());

// Add request logging middleware
app.use(logger.request);

// Store active rooms and participants
const rooms = new Map<string, RoomData>();
const participants = new Map<string, ParticipantData>();

// WebRTC Configuration (used for future implementation)
// const ICE_SERVERS = [
//   { urls: 'stun:stun.l.google.com:19302' },
//   { urls: 'stun:stun1.l.google.com:19302' },
//   { urls: 'stun:stun2.l.google.com:19302' }
// ];

// Initialize Supabase client for RAG testing
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// Mount secure routes
app.use('/api/secure', secureKnowledgeRoutes);
app.use('/api/secure', secureMeetingRoutes);
app.use('/api/secure', secureProjectRoutes);
app.use('/api', secureInviteTokenRoutes); // Note: includes both secure and public endpoints

// Legacy API Routes (for backward compatibility during migration)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    auth: {
      clerk_configured: !!(process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY),
      supabase_configured: !!(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY)
    }
  });
});

app.post('/api/rooms', (req: Request, res: Response) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  const room = {
    id: roomId,
    name: req.body.name || `Meeting ${roomId}`,
    createdAt: new Date().toISOString(),
    participants: []
  };
  
  rooms.set(roomId, room);
  res.json({ roomId, room });
});

app.get('/api/rooms/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  return res.json({ room });
});

// Demo Data Management Routes
app.post('/api/demo-data/generate', async (req: Request, res: Response) => {
  try {
    // Generate demo data
    const generator = new DemoDataGenerator();
    const result = await generator.generateDemoData();
    res.json({ 
      success: true, 
      message: 'Demo data generated successfully',
      data: result
    });
  } catch (error: unknown) {
    console.error('Demo data generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.delete('/api/demo-data/cleanup', async (req: Request, res: Response) => {
  try {
    // Cleanup demo data
    const generator = new DemoDataGenerator();
    await generator.cleanupDemoData();
    res.json({ 
      success: true, 
      message: 'Demo data cleaned up successfully' 
    });
  } catch (error: unknown) {
    console.error('Demo data cleanup failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/demo-data/regenerate', async (req: Request, res: Response) => {
  try {
    // Regenerate demo data
    const generator = new DemoDataGenerator();
    await generator.cleanupDemoData();
    const result = await generator.generateDemoData();
    res.json({ 
      success: true, 
      message: 'Demo data regenerated successfully',
      data: result
    });
  } catch (error: unknown) {
    console.error('Demo data regeneration failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test OpenAI Integration
app.get('/api/test/openai', async (req: Request, res: Response) => {
  try {
    // Test OpenAI integration
    const generator = new DemoDataGenerator();
    const results = await generator.testOpenAIIntegration();
    res.json({ 
      success: true, 
      message: 'OpenAI integration test completed',
      results
    });
  } catch (error: unknown) {
    console.error('OpenAI integration test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test RAG Search Functionality
app.post('/api/test/rag-search', async (req: Request, res: Response) => {
  try {
    const { query, meetingId = 'TASKFLOW-DEMO' } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query parameter is required' 
      });
    }

    // Execute RAG search test
    
    // Test the hybrid search function
    const { data, error } = await supabase.rpc('hybrid_search', {
      query_embedding: null, // Will fall back to text search
      query_text: query,
      target_meeting_id: meetingId,
      match_threshold: 0.5,
      match_count: 5
    });

    if (error) {
      throw error;
    }

    return res.json({ 
      success: true, 
      message: `RAG search completed for "${query}"`,
      results: {
        query,
        meetingId,
        resultsCount: data?.length || 0,
        results: data || []
      }
    });
  } catch (error: unknown) {
    console.error('RAG search test failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test Knowledge Base Status
app.get('/api/test/knowledge-status', async (req: Request, res: Response) => {
  try {
    // Check knowledge base status
    const { meetingId = 'TASKFLOW-DEMO' } = req.query;
    
    // Get knowledge stats
    const { data: knowledgeStats, error: statsError } = await supabase
      .from('meeting_knowledge')
      .select('meeting_id, content_type, source, embedding')
      .eq('meeting_id', meetingId);

    if (statsError) {
      throw statsError;
    }

    const stats = {
      totalItems: knowledgeStats?.length || 0,
      withEmbeddings: knowledgeStats?.filter((item: KnowledgeStatItem) => item.embedding).length || 0,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>
    };

    // Count by type and source
    knowledgeStats?.forEach((item: KnowledgeStatItem) => {
      stats.byType[item.content_type] = (stats.byType[item.content_type] || 0) + 1;
      stats.bySource[item.source] = (stats.bySource[item.source] || 0) + 1;
    });

    return res.json({ 
      success: true, 
      message: 'Knowledge base status retrieved',
      stats
    });
  } catch (error: unknown) {
    console.error('Knowledge base status check failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test Clerk Authentication
app.get('/api/test/auth', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({
        success: true,
        message: 'No auth token provided',
        auth: {
          authenticated: false,
          user: null
        }
      });
    }

    // For now, just return the token info without validation
    // Full validation will be implemented in the auth middleware
    return res.json({
      success: true,
      message: 'Auth token received',
      auth: {
        authenticated: true,
        token_present: true,
        token_length: authHeader.length
      }
    });
  } catch (error: unknown) {
    console.error('Auth test failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test AI Tools Service
app.post('/api/test/ai-tools', async (req: Request, res: Response) => {
  try {
    const { toolName, parameters, meetingId = 'TASKFLOW-DEMO' } = req.body;
    
    if (!toolName) {
      return res.status(400).json({ 
        success: false, 
        error: 'toolName parameter is required' 
      });
    }

    // Import AI Tools Service
    const { createAIToolsService } = await import('./services/aiToolsService.js');
    const aiToolsService = createAIToolsService(meetingId);

    // Execute the tool
    const result = await aiToolsService.executeTool({
      name: toolName,
      parameters: parameters || {}
    });

    return res.json({ 
      success: true, 
      message: `AI tool "${toolName}" executed successfully`,
      result
    });
  } catch (error: unknown) {
    console.error('AI tools test failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Fix Embedding Types
app.post('/api/test/fix-embeddings', async (req: Request, res: Response) => {
  try {
    const { meetingId = 'TASKFLOW-DEMO' } = req.body;
    
    // Get items with string embeddings
    const { data: items, error } = await supabase
      .from('meeting_knowledge')
      .select('id, content, embedding')
      .eq('meeting_id', meetingId)
      .not('embedding', 'is', null)
      .limit(5);

    if (error) {
      throw error;
    }

    let fixedCount = 0;
    const results = [];

    for (const item of items || []) {
      // Check if embedding is a string
      if (typeof item.embedding === 'string') {
        try {
          // Try to parse the string as JSON array
          const embeddingArray = JSON.parse(item.embedding);
          
          if (Array.isArray(embeddingArray) && embeddingArray.length === 1536) {
            // Update with proper array
            const { error: updateError } = await supabase
              .from('meeting_knowledge')
              .update({ embedding: embeddingArray })
              .eq('id', item.id);
            
            if (!updateError) {
              fixedCount++;
              results.push({
                id: item.id,
                status: 'fixed',
                originalType: 'string',
                newLength: embeddingArray.length
              });
            } else {
              results.push({
                id: item.id,
                status: 'error',
                error: updateError.message
              });
            }
          } else {
            results.push({
              id: item.id,
              status: 'invalid_array',
              length: Array.isArray(embeddingArray) ? embeddingArray.length : 'not_array'
            });
          }
        } catch (parseError) {
          results.push({
            id: item.id,
            status: 'parse_error',
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
          });
        }
      } else {
        results.push({
          id: item.id,
          status: 'already_correct',
          type: typeof item.embedding,
          isArray: Array.isArray(item.embedding)
        });
      }
    }

    res.json({
      success: true,
      message: `Fixed ${fixedCount} embeddings`,
      fixedCount,
      totalChecked: items?.length || 0,
      results
    });
  } catch (error: unknown) {
    console.error('Fix embeddings failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug Database Content
app.get('/api/test/debug-db', async (req: Request, res: Response) => {
  try {
    const { meetingId = 'TASKFLOW-DEMO' } = req.query;
    
    // Get raw knowledge data
    const { data: rawData, error } = await supabase
      .from('meeting_knowledge')
      .select('id, content, embedding, keywords, summary')
      .eq('meeting_id', meetingId)
      .limit(3);

    if (error) {
      throw error;
    }

    const debug = {
      totalItems: rawData?.length || 0,
      items: rawData?.map(item => ({
        id: item.id,
        content: item.content.substring(0, 100) + '...',
        hasEmbedding: !!item.embedding,
        embeddingLength: item.embedding ? item.embedding.length : 0,
        embeddingType: item.embedding ? typeof item.embedding : 'null',
        hasKeywords: !!item.keywords,
        keywordsCount: item.keywords ? item.keywords.length : 0,
        hasSummary: !!item.summary
      })) || []
    };

    res.json({
      success: true,
      message: 'Debug information retrieved',
      debug
    });
  } catch (error: unknown) {
    console.error('Debug DB test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test ElevenLabs Tool Integration
app.post('/api/test/elevenlabs-tools', async (req: Request, res: Response) => {
  try {
    const { meetingId = 'TASKFLOW-DEMO' } = req.body;
    
    // Import AI Tools Service
    const { createAIToolsService } = await import('./services/aiToolsService.js');
    const aiToolsService = createAIToolsService(meetingId);

    // Test all 5 tools
    const testScenarios: ToolCall[] = [
      {
        name: 'search_meeting_knowledge',
        parameters: { query: 'budget decisions', limit: 3 }
      },
      {
        name: 'recall_decisions',
        parameters: { topic: 'budget' }
      },
      {
        name: 'get_action_items',
        parameters: { status: 'all' }
      },
      {
        name: 'summarize_topic',
        parameters: { topic: 'project timeline' }
      },
      {
        name: 'find_similar_discussions',
        parameters: { reference_text: 'budget planning meeting', scope: 'current_meeting' }
      }
    ];

    const results: Record<string, TestResult> = {};
    
    for (const scenario of testScenarios) {
      try {
        const start = Date.now();
        const result = await aiToolsService.executeTool(scenario);
        const duration = Date.now() - start;
        
        results[scenario.name] = {
          success: result.success,
          duration,
          dataCount: result.data && typeof result.data === 'object' && result.data !== null && 'results' in result.data && Array.isArray((result.data as { results: unknown[] }).results) ? (result.data as { results: unknown[] }).results.length : 0,
          error: result.error
        };
      } catch (error: unknown) {
        results[scenario.name] = {
          success: false,
          duration: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    // Summary
    const successCount = Object.values(results).filter(r => r.success).length;
    const avgDuration = Object.values(results).reduce((sum: number, r) => sum + r.duration, 0) / testScenarios.length;

    res.json({ 
      success: true, 
      message: `ElevenLabs tools integration test completed`,
      summary: {
        totalTools: testScenarios.length,
        successfulTools: successCount,
        averageDuration: `${avgDuration.toFixed(0)}ms`,
        allToolsWorking: successCount === testScenarios.length
      },
      results
    });
  } catch (error: unknown) {
    console.error('ElevenLabs tools integration test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Comprehensive Knowledge Base Test
app.get('/api/test/knowledge-comprehensive', async (req: Request, res: Response) => {
  try {
    const { meetingId = 'TASKFLOW-DEMO' } = req.query;
    
    const testResults: ComprehensiveTestResults = {
      database: {
        connectivity: false,
        error: null,
        total_items: 0,
        meeting_specific_items: 0
      },
      embeddings: {
        total_with_embeddings: 0,
        valid_embeddings: 0,
        quality_score: 0
      },
      search: {
        queries: {}
      },
      functions: {
        vector_search_available: false,
        similarity_search_working: false
      }
    };

    // Test 1: Database connectivity and schema
    try {
      const { error: schemaError } = await supabase
        .from('meeting_knowledge')
        .select('id')
        .limit(1);
      
      testResults.database.connectivity = !schemaError;
      testResults.database.error = schemaError?.message || null;
    } catch (error: unknown) {
      testResults.database.connectivity = false;
      testResults.database.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test 2: Check vector extension
    try {
      const { error: vectorError } = await supabase
        .rpc('hybrid_search', {
          query_embedding: null,
          query_text: 'test',
          target_meeting_id: meetingId,
          match_threshold: 0.5,
          match_count: 1
        });
      
      testResults.functions.hybrid_search = !vectorError;
      testResults.functions.error = vectorError?.message || null;
    } catch (error: unknown) {
      testResults.functions.hybrid_search = false;
      testResults.functions.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test 3: Embeddings quality check
    try {
      const { data: embeddingData } = await supabase
        .from('meeting_knowledge')
        .select('id, content, embedding')
        .eq('meeting_id', meetingId)
        .not('embedding', 'is', null)
        .limit(10);
      
      testResults.embeddings.total_with_embeddings = embeddingData?.length || 0;
      testResults.embeddings.valid_embeddings = embeddingData?.filter(
        item => item.embedding && Array.isArray(item.embedding) && item.embedding.length === 1536
      ).length || 0;
      testResults.embeddings.quality_score = testResults.embeddings.total_with_embeddings > 0 
        ? (testResults.embeddings.valid_embeddings / testResults.embeddings.total_with_embeddings) 
        : 0;
    } catch (error: unknown) {
      testResults.embeddings.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test 4: Search performance
    const searchQueries = [
      'budget decisions',
      'project timeline',
      'team responsibilities',
      'action items'
    ];

    testResults.search.queries = {} as Record<string, { success: boolean; duration?: number; resultCount?: number; error?: string | null }>;
    
    for (const query of searchQueries) {
      try {
        const start = Date.now();
        const { data: searchResults, error: searchError } = await supabase.rpc('hybrid_search', {
          query_embedding: null,
          query_text: query,
          target_meeting_id: meetingId,
          match_threshold: 0.3,
          match_count: 5
        });
        const duration = Date.now() - start;
        
        testResults.search.queries[query] = {
          success: !searchError,
          duration,
          resultCount: searchResults?.length || 0,
          error: searchError?.message || null
        };
      } catch (error: unknown) {
        testResults.search.queries[query] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    // Calculate overall health score
    const healthChecks = [
      testResults.database.connectivity,
      testResults.functions.hybrid_search,
      testResults.embeddings.quality_score > 0.8,
      Object.values(testResults.search.queries).every(q => q.success)
    ];
    
    const healthScore = healthChecks.filter(Boolean).length / healthChecks.length;

    res.json({ 
      success: true, 
      message: 'Comprehensive knowledge base test completed',
      healthScore: `${(healthScore * 100).toFixed(0)}%`,
      results: testResults,
      recommendations: healthScore < 1 ? [
        healthScore < 0.25 && 'Database connectivity issues detected',
        !testResults.functions.hybrid_search && 'Vector search function not working',
        testResults.embeddings.quality_score < 0.8 && 'Embedding quality issues detected',
        !Object.values(testResults.search.queries).every(q => q.success) && 'Search performance issues detected'
      ].filter(Boolean) : ['All systems operational']
    });
  } catch (error: unknown) {
    console.error('Comprehensive knowledge base test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Socket.io WebRTC Signaling
io.on('connection', (socket) => {
  // User connected
  
  socket.on('join-room', (data) => {
    const { roomId, userName, userId } = data;
    
    // Join socket room
    socket.join(roomId);
    
    // Store participant info
    const participant = {
      id: userId,
      socketId: socket.id,
      name: userName,
      roomId,
      joinedAt: new Date().toISOString()
    };
    
    participants.set(socket.id, participant);
    
    // Update room participants
    const room = rooms.get(roomId);
    if (room) {
      room.participants = room.participants.filter((p: unknown) => (p as ParticipantData).id !== userId);
      room.participants.push(participant);
      rooms.set(roomId, room);
    }
    
    // Notify existing participants
    socket.to(roomId).emit('user-joined', participant);
    
    // Send current participants to new user
    const roomParticipants = Array.from(participants.values())
      .filter(p => p.roomId === roomId && p.socketId !== socket.id);
    
    socket.emit('room-participants', roomParticipants);
    
    // User joined room
  });
  
  // WebRTC Signaling Events
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });
  
  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });
  
  // Media control events
  socket.on('toggle-audio', (data) => {
    const participant = participants.get(socket.id);
    if (participant) {
      socket.to(participant.roomId).emit('participant-audio-toggle', {
        participantId: participant.id,
        audioEnabled: data.audioEnabled
      });
    }
  });
  
  socket.on('toggle-video', (data) => {
    const participant = participants.get(socket.id);
    if (participant) {
      socket.to(participant.roomId).emit('participant-video-toggle', {
        participantId: participant.id,
        videoEnabled: data.videoEnabled
      });
    }
  });
  
  socket.on('disconnect', () => {
    const participant = participants.get(socket.id);
    
    if (participant) {
      const { roomId, id: userId } = participant;
      
      // Remove from participants
      participants.delete(socket.id);
      
      // Update room
      const room = rooms.get(roomId);
      if (room) {
        room.participants = room.participants.filter((p: unknown) => (p as ParticipantData).id !== userId);
        rooms.set(roomId, room);
      }
      
      // Notify other participants
      socket.to(roomId).emit('user-left', { participantId: userId });
      
      // User left room
    }
    
    // User disconnected
  });
});

// Background processing for knowledge embeddings
const startBackgroundProcessing = async () => {
  console.log('🔄 Starting background knowledge processing...');
  
  const processKnowledge = async () => {
    try {
      const { EmbeddingService } = await import('./services/embeddingService.js');
      const embeddingService = new EmbeddingService();
      await embeddingService.processPendingKnowledge();
    } catch (error) {
      console.error('Background processing error:', error);
    }
  };
  
  // Process immediately on startup
  setTimeout(processKnowledge, 5000); // Wait 5 seconds for server to be ready
  
  // Then process every 30 seconds
  setInterval(processKnowledge, 30000);
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🔧 Available endpoints:');
  console.log('  Legacy API:');
  console.log('    POST /api/demo-data/generate');
  console.log('    DELETE /api/demo-data/cleanup');
  console.log('    POST /api/demo-data/regenerate');
  console.log('  Testing API:');
  console.log('    GET /api/test/openai');
  console.log('    POST /api/test/rag-search');
  console.log('    GET /api/test/knowledge-status');
  console.log('    GET /api/test/knowledge-comprehensive');
  console.log('    POST /api/test/ai-tools');
  console.log('    POST /api/test/elevenlabs-tools');
  console.log('    GET /api/test/auth');
  console.log('  Secure API:');
  console.log('    GET /api/secure/meetings/:meetingId/knowledge');
  console.log('    POST /api/secure/meetings/:meetingId/knowledge');
  console.log('    POST /api/secure/meetings');
  console.log('    GET /api/secure/meetings/:meetingId');
  console.log('    POST /api/secure/projects');
  console.log('    GET /api/secure/projects');
  console.log('    GET /api/secure/projects/:handle');
  console.log('    GET /api/secure/projects/:handle/members');
  console.log('    POST /api/secure/projects/:handle/meetings');
  console.log('🔒 Authentication:');
  console.log(`  Clerk configured: ${!!(process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY)}`);
  console.log(`  Supabase configured: ${!!(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY)}`);
  
  // Environment detection and debugging
  const hasWebCrypto = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
  const isWebContainer = process.env.WEBCONTAINER_MODE === 'true' || process.env.SHELL === '/bin/jsh';
  
  console.log('🌍 Environment Detection:');
  console.log(`  Runtime: ${process.versions?.node ? 'Node.js ' + process.versions.node : 'Unknown'}`);
  console.log(`  WebCrypto API: ${hasWebCrypto ? 'Available' : 'Not Available'}`);
  console.log(`  WebContainer Mode: ${isWebContainer ? 'Enabled' : 'Disabled'}`);
  console.log(`  Shell: ${process.env.SHELL || 'Unknown'}`);
  
  console.log('📋 Environment Variables Debug:');
  console.log(`  CLERK_SECRET_KEY: ${process.env.CLERK_SECRET_KEY ? 'SET (' + process.env.CLERK_SECRET_KEY.substring(0, 10) + '...)' : 'MISSING'}`);
  console.log(`  VITE_CLERK_PUBLISHABLE_KEY: ${process.env.VITE_CLERK_PUBLISHABLE_KEY ? 'SET (' + process.env.VITE_CLERK_PUBLISHABLE_KEY.substring(0, 15) + '...)' : 'MISSING'}`);
  console.log(`  CLERK_ISSUER: ${process.env.CLERK_ISSUER || 'NOT SET'}`);
  console.log(`  VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? 'SET (' + process.env.VITE_SUPABASE_URL.substring(0, 30) + '...)' : 'MISSING'}`);
  console.log(`  VITE_SUPABASE_ANON_KEY: ${process.env.VITE_SUPABASE_ANON_KEY ? 'SET (' + process.env.VITE_SUPABASE_ANON_KEY.substring(0, 20) + '...)' : 'MISSING'}`);
  console.log(`  WEBCONTAINER_MODE: ${process.env.WEBCONTAINER_MODE || 'NOT SET'}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
  
  // Start background processing for knowledge embeddings
  startBackgroundProcessing();
});
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
// CORS configuration for local development, production, and cloud IDE environments
const allowedOrigins = [
  // Local development
  /^https?:\/\/localhost:(5173|3000|3001)$/,
  /^https?:\/\/127\.0\.0\.1:(5173|3000|3001)$/,
  
  // Production domains  
  /^https?:\/\/(www\.)?dope\.vision$/,
  
  // Netlify domains
  /^https?:\/\/.*\.netlify\.app$/,
  
  // Bolt.new and StackBlitz domains
  /^https?:\/\/stackblitz\.com$/,
  /^https?:\/\/.*\.stackblitz\.io$/,
  /^https?:\/\/bolt\.new$/,
  /^https?:\/\/.*\.bolt\.new$/,
  
  // WebContainer API domains
  /^https?:\/\/.*\.webcontainer-api\.io$/,
  /^https?:\/\/webcontainer-api\.io$/
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps, curl requests, or same-origin)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any of our allowed patterns
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    // Log rejected origins for debugging
    console.warn(`CORS: Rejected origin ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Allow cookies and auth headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-API-Key"]
};

const io = new Server(server, {
  cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

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

// REMOVED: Demo data management endpoints for security
// These endpoints allowed unlimited data generation/deletion without authentication

// REMOVED: Test OpenAI Integration endpoint for security
// This endpoint could be used to consume OpenAI credits without authentication

// REMOVED: Test RAG Search endpoint for security
// This endpoint could be used to access meeting knowledge without proper authorization

// REMOVED: Test Knowledge Base Status endpoint for security
// This endpoint could expose sensitive meeting knowledge statistics without authorization

// REMOVED: Test Clerk Authentication endpoint for security
// This endpoint could expose authentication token information

// REMOVED: Dangerous test endpoint that bypassed authentication

// REMOVED: Fix Embedding Types endpoint for security
// This endpoint could modify database embeddings without proper authorization

// REMOVED: Debug Database Content endpoint for security
// This endpoint could expose sensitive meeting knowledge data without authorization

// REMOVED: Test ElevenLabs Tool Integration endpoint for security
// This endpoint could access meeting knowledge and consume AI tools without authorization

// REMOVED: Comprehensive Knowledge Base Test endpoint for security
// This endpoint could perform extensive database queries and expose system information without authorization

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
  console.log('  Public API:');
  console.log('    GET /api/health');
  console.log('    POST /api/rooms');
  console.log('    GET /api/rooms/:roomId');
  console.log('    POST /api/public/invite-tokens/validate');
  console.log('    POST /api/public/invite-tokens/consume');
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
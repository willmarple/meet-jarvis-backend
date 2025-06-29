# Architecture Documentation

## System Overview

The AI Meeting Platform is built as a modern web application with real-time capabilities, combining WebRTC for peer-to-peer communication, AI voice assistance, and collaborative knowledge management.

## Component Architecture

### Frontend Components

```
src/
├── components/
│   ├── HomePage.tsx          # Landing page with create/join options
│   ├── MeetingRoom.tsx       # Main meeting interface
│   ├── VideoGrid.tsx         # Video participant grid
│   ├── MeetingControls.tsx   # Audio/video/screen controls
│   └── KnowledgePanel.tsx    # Collaborative knowledge sidebar
├── hooks/
│   ├── useWebRTC.ts          # WebRTC connection management
│   ├── useSupabaseSync.ts    # Database synchronization
│   └── useElevenLabsVoice.ts # AI voice integration
└── lib/
    └── supabase.ts           # Database client and services
```

### Backend Services

```
server/
└── index.js                 # Express + Socket.io signaling server

supabase/
└── migrations/              # Database schema migrations
```

## Data Flow

### WebRTC Signaling Flow
1. Client connects to Socket.io server
2. Joins room with user credentials
3. Exchanges WebRTC offers/answers through signaling server
4. Establishes peer-to-peer connections
5. Streams audio/video directly between peers

### AI Voice Integration Flow
1. User clicks "Voice AI" button
2. ElevenLabs SDK establishes connection
3. Real-time audio transcription
4. AI processes context and responds
5. Responses added to knowledge base

### Knowledge Management Flow
1. Users add knowledge items during meeting
2. Real-time sync via Supabase subscriptions
3. AI responses automatically added
4. All participants see updates instantly

## Database Schema

### Tables

#### `meetings`
- `id` (text, PK): Unique room identifier
- `name` (text): Meeting display name
- `host_id` (text): Meeting creator ID
- `created_at` (timestamp): Creation time
- `is_active` (boolean): Meeting status

#### `meeting_participants`
- `id` (uuid, PK): Unique participant record
- `meeting_id` (text, FK): Reference to meeting
- `user_name` (text): Participant display name
- `user_id` (text): Unique user identifier
- `joined_at` (timestamp): Join time
- `left_at` (timestamp): Leave time (nullable)
- `is_connected` (boolean): Current connection status

#### `meeting_knowledge`
- `id` (uuid, PK): Unique knowledge item
- `meeting_id` (text, FK): Reference to meeting
- `content` (text): Knowledge content
- `content_type` (enum): Type (fact, context, summary, question, answer)
- `source` (enum): Source (user, ai, document)
- `created_at` (timestamp): Creation time
- `updated_at` (timestamp): Last update time

### Security (RLS Policies)
- Anonymous and authenticated users can read/write meeting data
- Participants can update their own status
- Knowledge items are accessible to all meeting participants

## Real-time Features

### WebRTC Peer Connections
- STUN servers for NAT traversal
- Automatic reconnection handling
- Media stream management
- Connection state monitoring

### Supabase Real-time
- Live knowledge base updates
- Participant status changes
- Meeting state synchronization

### Socket.io Signaling
- WebRTC offer/answer exchange
- ICE candidate relay
- Room management
- Participant notifications

## AI Integration

### ElevenLabs Conversational AI
- Real-time voice interaction
- Context-aware responses
- Meeting-specific knowledge integration
- Automatic transcription and response logging

### Knowledge Context
- AI receives meeting context (participants, existing knowledge)
- Responses are categorized and stored
- Integration with collaborative knowledge base

## Performance Considerations

### WebRTC Optimization
- Efficient peer connection management
- Media stream reuse
- Connection cleanup on disconnect

### Database Optimization
- Indexed queries for meeting lookups
- Real-time subscription filtering
- Efficient upsert operations for participants

### Frontend Optimization
- React hook optimization to prevent re-renders
- Memoized callbacks and contexts
- Efficient state management

## Security Considerations

### WebRTC Security
- Peer-to-peer encryption
- STUN server configuration
- Media permission handling

### Database Security
- Row Level Security (RLS) policies
- Anonymous access controls
- Data validation

### API Security
- Environment variable protection
- Secure key management
- CORS configuration

## Deployment Architecture

### Development
- Vite dev server (port 5173)
- Express signaling server (port 3001)
- Local Supabase connection

### Production
- Static frontend deployment
- Node.js server deployment
- Supabase cloud database
- CDN for static assets

## Monitoring and Logging

### Frontend Logging
- WebRTC connection states
- AI interaction events
- User action tracking
- Error reporting

### Backend Logging
- Socket.io connection events
- Room management activities
- Error handling

### Database Monitoring
- Real-time subscription health
- Query performance
- Connection pooling
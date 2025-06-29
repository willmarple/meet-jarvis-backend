# API Documentation

## WebRTC Signaling API (Socket.io)

### Connection Events

#### `connect`
Establishes connection to signaling server.

#### `join-room`
Join a meeting room.

**Payload:**
```typescript
{
  roomId: string;
  userName: string;
  userId: string;
}
```

**Response Events:**
- `room-participants`: List of existing participants
- `user-joined`: New participant joined

#### `offer`
Send WebRTC offer to another participant.

**Payload:**
```typescript
{
  target: string; // Socket ID of target participant
  offer: RTCSessionDescriptionInit;
}
```

#### `answer`
Send WebRTC answer to another participant.

**Payload:**
```typescript
{
  target: string; // Socket ID of target participant
  answer: RTCSessionDescriptionInit;
}
```

#### `ice-candidate`
Send ICE candidate to another participant.

**Payload:**
```typescript
{
  target: string; // Socket ID of target participant
  candidate: RTCIceCandidate;
}
```

#### `toggle-audio`
Notify other participants of audio state change.

**Payload:**
```typescript
{
  audioEnabled: boolean;
}
```

#### `toggle-video`
Notify other participants of video state change.

**Payload:**
```typescript
{
  videoEnabled: boolean;
}
```

### Server Events

#### `user-joined`
Emitted when a new participant joins the room.

**Payload:**
```typescript
{
  id: string;
  socketId: string;
  name: string;
  roomId: string;
  joinedAt: string;
}
```

#### `user-left`
Emitted when a participant leaves the room.

**Payload:**
```typescript
{
  participantId: string;
}
```

#### `participant-audio-toggle`
Emitted when a participant toggles their audio.

**Payload:**
```typescript
{
  participantId: string;
  audioEnabled: boolean;
}
```

#### `participant-video-toggle`
Emitted when a participant toggles their video.

**Payload:**
```typescript
{
  participantId: string;
  videoEnabled: boolean;
}
```

---

## REST API Endpoints

### Meeting Management

#### `POST /api/rooms`
Create a new meeting room.

**Request Body:**
```typescript
{
  name?: string; // Optional meeting name
}
```

**Response:**
```typescript
{
  roomId: string;
  room: {
    id: string;
    name: string;
    createdAt: string;
    participants: [];
  }
}
```

#### `GET /api/rooms/:roomId`
Get meeting room information.

**Response:**
```typescript
{
  room: {
    id: string;
    name: string;
    createdAt: string;
    participants: Participant[];
  }
}
```

**Error Response (404):**
```typescript
{
  error: "Room not found"
}
```

#### `GET /api/health`
Health check endpoint.

**Response:**
```typescript
{
  status: "ok";
  timestamp: string;
}
```

---

## Database API (Supabase)

### Meeting Service

#### `createMeeting(meetingData)`
Create a new meeting record.

**Parameters:**
```typescript
{
  id: string;
  name: string;
  host_id: string;
}
```

**Returns:** `Meeting`

#### `getMeeting(meetingId)`
Get meeting by ID.

**Parameters:** `meetingId: string`

**Returns:** `Meeting | null`

#### `addParticipant(participantData)`
Add participant to meeting (upsert operation).

**Parameters:**
```typescript
{
  meeting_id: string;
  user_name: string;
  user_id: string;
}
```

**Returns:** `MeetingParticipant`

#### `updateParticipantStatus(userId, meetingId, isConnected)`
Update participant connection status.

**Parameters:**
- `userId: string`
- `meetingId: string`
- `isConnected: boolean`

**Returns:** `void`

#### `getMeetingParticipants(meetingId)`
Get all connected participants for a meeting.

**Parameters:** `meetingId: string`

**Returns:** `MeetingParticipant[]`

### Knowledge Service

#### `addKnowledge(knowledgeData)`
Add knowledge item to meeting.

**Parameters:**
```typescript
{
  meeting_id: string;
  content: string;
  content_type: 'fact' | 'context' | 'summary' | 'question' | 'answer';
  source: 'user' | 'ai' | 'document';
}
```

**Returns:** `MeetingKnowledge`

#### `getMeetingKnowledge(meetingId, contentType?)`
Get knowledge items for a meeting.

**Parameters:**
- `meetingId: string`
- `contentType?: string` (optional filter)

**Returns:** `MeetingKnowledge[]`

#### `updateKnowledge(knowledgeId, updates)`
Update existing knowledge item.

**Parameters:**
- `knowledgeId: string`
- `updates: Partial<MeetingKnowledge>`

**Returns:** `MeetingKnowledge`

#### `subscribeToKnowledgeUpdates(meetingId, callback)`
Subscribe to real-time knowledge updates.

**Parameters:**
- `meetingId: string`
- `callback: (payload: any) => void`

**Returns:** `RealtimeSubscription`

### Real-time Service

#### `subscribeToParticipants(meetingId, callback)`
Subscribe to participant updates.

**Parameters:**
- `meetingId: string`
- `callback: (payload: any) => void`

**Returns:** `RealtimeSubscription`

#### `subscribeToMeeting(meetingId, callback)`
Subscribe to meeting updates.

**Parameters:**
- `meetingId: string`
- `callback: (payload: any) => void`

**Returns:** `RealtimeSubscription`

---

## Type Definitions

### Core Types

```typescript
interface Meeting {
  id: string;
  name: string;
  host_id: string;
  created_at: string;
  is_active: boolean;
}

interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_name: string;
  user_id: string;
  joined_at: string;
  left_at?: string;
  is_connected: boolean;
}

interface MeetingKnowledge {
  id: string;
  meeting_id: string;
  content: string;
  content_type: 'fact' | 'context' | 'summary' | 'question' | 'answer';
  source: 'user' | 'ai' | 'document';
  created_at: string;
  updated_at: string;
}

interface Participant {
  id: string;
  name: string;
  socketId: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
```

### WebRTC Types

```typescript
interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  target: string;
  payload: any;
}
```

### ElevenLabs Types

```typescript
interface VoiceAIMessage {
  type: string;
  source: 'user' | 'ai';
  message: string;
  timestamp: string;
}

interface VoiceAIStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
}
```

---

## Error Handling

### Common Error Codes

- `400`: Bad Request - Invalid parameters
- `404`: Not Found - Resource doesn't exist
- `500`: Internal Server Error - Server-side error

### WebRTC Errors

- Connection timeout
- ICE gathering failure
- Media access denied
- Peer connection failed

### AI Integration Errors

- SDK not loaded
- Agent ID not configured
- Connection timeout
- API rate limits exceeded

### Database Errors

- Connection timeout
- Permission denied
- Constraint violations
- Real-time subscription failures
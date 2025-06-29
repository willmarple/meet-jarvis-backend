# AI Meeting Platform

A modern WebRTC-based video conferencing platform with integrated AI voice assistant and knowledge management capabilities.

## 🚀 Features

### ✅ Implemented
- **WebRTC Video Conferencing**: High-quality peer-to-peer video and audio communication
- **Real-time Meeting Management**: Create and join meetings with unique room IDs
- **AI Voice Assistant**: ElevenLabs conversational AI integration with voice interaction
- **Knowledge Base**: Real-time collaborative knowledge management during meetings
- **Responsive UI**: Modern, production-ready interface with Tailwind CSS
- **Database Integration**: Supabase backend with real-time synchronization
- **Meeting Persistence**: Store meeting data, participants, and knowledge

### 🔄 In Progress
- Screen sharing functionality
- Meeting recordings
- Advanced AI features (meeting summaries, action items)

### 📋 Planned
- Multi-language support
- Calendar integration
- Advanced analytics
- Mobile app
- Enterprise features

## 🏗️ Architecture

### Frontend Stack
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Vite** for development and building

### Backend Stack
- **Node.js/Express** signaling server
- **Socket.io** for WebRTC signaling
- **Supabase** for database and real-time features

### AI Integration
- **ElevenLabs Conversational AI** for voice interactions
- Real-time transcription and response generation

### Database Schema
- `meetings`: Meeting room management
- `meeting_participants`: Participant tracking
- `meeting_knowledge`: Collaborative knowledge base

## 🚦 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- ElevenLabs account with conversational AI agent

### Environment Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment template:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # ElevenLabs Configuration
   VITE_ELEVENLABS_AGENT_ID=your_elevenlabs_agent_id
   
   # Server Configuration
   PORT=3001
   ```

### Database Setup

1. Create a new Supabase project
2. Run the migration files in `supabase/migrations/` to set up the database schema
3. Enable real-time subscriptions for the tables

### Development

Start the development servers:
```bash
npm run dev
```

This runs both the client (port 5173) and signaling server (port 3001) concurrently.

### Production Build

```bash
npm run build
npm run preview
```

## 📖 Usage

1. **Create a Meeting**: Enter your name and click "Create Meeting"
2. **Join a Meeting**: Enter your name and the meeting ID, then click "Join Meeting"
3. **Voice AI**: Click the "Voice AI" button to start conversing with the AI assistant
4. **Knowledge Base**: Use the "Knowledge" panel to add and view meeting notes
5. **Media Controls**: Toggle audio/video, share screen, or leave the meeting

## 🔧 Configuration

### ElevenLabs Setup
1. Create an ElevenLabs account
2. Set up a conversational AI agent
3. Copy the agent ID to your `.env` file

### Supabase Setup
1. Create a Supabase project
2. Run the provided migrations
3. Configure RLS policies as needed
4. Copy project URL and anon key to `.env`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
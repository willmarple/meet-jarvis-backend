# WebRTC Converse Backend

Node.js/Express backend for the AI Meeting Platform with WebRTC signaling, AI integrations, and authentication.

## Features

- Express.js REST API server
- Socket.io WebRTC signaling server
- Clerk.dev authentication with WebContainer compatibility
- Supabase database integration with RAG search
- OpenAI embeddings and AI tools
- ElevenLabs voice AI integration
- CORS configured for Bolt.new/StackBlitz frontends

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Build and start:
   ```bash
   npm run build
   npm start
   ```

   For development:
   ```bash
   npm run dev
   ```

## Environment Variables

Required:
- `CLERK_SECRET_KEY` - Clerk authentication
- `VITE_SUPABASE_URL` - Supabase project URL  
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key

Optional:
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment mode

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/secure/meetings` - Create meeting (auth required)
- `GET /api/secure/meetings/:id` - Get meeting details
- `POST /api/secure/meetings/:id/knowledge` - Add knowledge
- `GET /api/test/*` - Testing endpoints

## Deployment

Optimized for deployment on:
- VPS (netcup VPS 2000 G11 recommended)
- Railway
- Render
- DigitalOcean App Platform

## CORS Configuration

Configured to accept requests from:
- `localhost` (development)
- `*.stackblitz.io` (StackBlitz projects)
- `*.bolt.new` (Bolt.new projects)
- `*.webcontainer-api.io` (WebContainer domains)
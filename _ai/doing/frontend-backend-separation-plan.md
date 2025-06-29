# Frontend/Backend Separation Plan

## Project Overview
This document outlines the plan to separate the AI Meeting Platform into two distinct repositories:
1. **Frontend Repository** (stays in Bolt.new) - React/TypeScript application
2. **Backend Repository** (new, deployed externally) - Node.js/Express API and WebSocket server

## Current Issues Driving This Change
- Bolt.new project duplication failures due to project complexity/size
- WebContainer environment conflicts with Node.js crypto operations
- Clerk JWT verification incompatibility with WebCrypto API in webcontainers
- Mixed frontend/backend dependencies causing deployment issues

## Local Directory Structure

```
/Users/will/Projects/webrtc-converse/  (current repo - will be deprecated)
├── webrtc-converse-frontend/          (new frontend repo)
├── webrtc-converse-backend/           (new backend repo)
└── shared-types/                      (shared TypeScript definitions)
```

## Shared Types Strategy

**Current State**: We already have `shared/types.ts` with comprehensive type definitions

**Recommended Approach**: Local npm package with workspace linking
- Extract `shared/types.ts` to `shared-types/` directory
- Create local npm package with proper TypeScript compilation
- Use npm workspaces or `npm link` for local development
- Later publish to npm registry for remote deployment

**Types to Extract**:
- All interfaces from `shared/types.ts` (already comprehensive)
- `MeetingData`, `User`, `Participant` interfaces from frontend
- Backend-specific types from `server/index.ts`

**Implementation**:
```bash
# In shared-types/
npm init -y
npm install typescript @types/node

# In both frontend and backend:
npm link ../shared-types
```

## Architecture Split

### Frontend Repository (webrtc-converse-frontend)
**What Stays:**
- `src/` directory (all React components and hooks)
- `public/` directory (static assets)
- `index.html`, `vite.config.ts`, `tailwind.config.js`
- `package.json` (frontend dependencies only)
- `.env` (frontend environment variables only)
- TypeScript configuration for frontend

**Frontend Dependencies to Keep:**
```json
{
  "@clerk/clerk-react": "^5.14.2",
  "@supabase/supabase-js": "^2.48.1", 
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "socket.io-client": "^4.8.1",
  "uuid": "^10.0.0",
  "lucide-react": "^0.454.0"
}
```

**Frontend Environment Variables:**
```env
VITE_SUPABASE_URL=https://mgikppwblqnsssbkskbj.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ELEVENLABS_API_KEY=sk_...
VITE_ELEVENLABS_AGENT_ID=agent_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_BACKEND_URL=https://your-deployed-backend.com
VITE_BACKEND_WS_URL=wss://your-deployed-backend.com
```

### Backend Repository (webrtc-converse-backend)
**What Moves:**
- `server/` directory (entire Express.js application)
- `local_migrations/` directory (database migrations)
- Backend-specific `package.json` and dependencies
- Backend environment variables
- Node.js configuration files

**Backend Dependencies:**
```json
{
  "@clerk/backend": "^1.15.6",
  "@supabase/supabase-js": "^2.48.1",
  "express": "^4.21.1",
  "socket.io": "^4.8.1",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "uuid": "^10.0.0",
  "openai": "^4.71.0"
}
```

**Backend Environment Variables:**
```env
CLERK_SECRET_KEY=sk_test_...
CLERK_ISSUER=https://fine-mullet-11.clerk.accounts.dev
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-proj-...
SUPABASE_DB_PASSWORD=...
PORT=3001
NODE_ENV=production
```

## Implementation Plan

### Phase 1: Local Repository Setup
1. **Create local directories** for separated repos:
   ```bash
   mkdir webrtc-converse-frontend
   mkdir webrtc-converse-backend
   mkdir shared-types
   ```

2. **Backend structure** (webrtc-converse-backend/):
   ```
   webrtc-converse-backend/
   ├── src/
   │   ├── middleware/
   │   ├── routes/
   │   ├── services/
   │   └── index.ts
   ├── migrations/
   ├── package.json
   ├── .env.example
   └── README.md
   ```

3. **Frontend structure** (webrtc-converse-frontend/):
   ```
   webrtc-converse-frontend/
   ├── src/
   │   ├── components/
   │   ├── hooks/
   │   └── services/
   ├── public/
   ├── package.json
   ├── vite.config.ts
   └── README.md
   ```

4. **Shared types structure** (shared-types/):
   ```
   shared-types/
   ├── src/
   │   ├── api.ts
   │   ├── meeting.ts
   │   ├── user.ts
   │   └── index.ts
   ├── package.json
   └── README.md
   ```
3. **Update CORS configuration** for Bolt.new domains:
   - `https://*.stackblitz.io`
   - `https://*.bolt.new`
   - `https://*.webcontainer-api.io`
4. **Add health check endpoints** for deployment verification
5. **Configure Socket.io CORS** for WebSocket connections from webcontainer

### Phase 2: Backend Deployment
1. **Deploy to netcup VPS 2000 G11**:
   - **Specifications**: 4 vCPU, 8GB RAM, 160GB SSD, 1Gbit/s unlimited
   - **Perfect fit** for Node.js/Socket.io backend with 10-50+ concurrent users
   - **Cost-effective** compared to cloud platforms
2. **Set up environment variables** in deployment platform
3. **Configure domain/SSL** for secure connections
4. **Test database connectivity** from deployed environment
5. **Verify Socket.io WebSocket** connections work from external origins

### Phase 3: Frontend Updates
1. **Remove server dependencies** from package.json:
   - Remove all Node.js/Express related packages
   - Remove server-specific scripts
2. **Update API endpoints** to use deployed backend:
   ```typescript
   const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
   const WS_URL = import.meta.env.VITE_BACKEND_WS_URL || 'http://localhost:3001';
   ```
3. **Update Socket.io client** to connect to external server
4. **Remove webcontainer detection logic** (no longer needed)
5. **Update authentication flow** for cross-origin token handling
6. **Test Bolt.new project duplication** after complexity reduction

### Phase 4: Testing & Validation
1. **Test local development** with separated repos
2. **Test Bolt.new frontend** with deployed backend
3. **Verify WebRTC signaling** works across origins
4. **Test authentication** flow end-to-end
5. **Validate AI features** (ElevenLabs, OpenAI integrations)
6. **Performance testing** for added network latency

## CORS & Security Considerations

### CORS Configuration
```javascript
const corsOptions = {
  origin: [
    "http://localhost:5173", // Local development
    "https://*.stackblitz.io", // StackBlitz projects
    "https://*.bolt.new", // Bolt.new projects
    "https://*.webcontainer-api.io" // WebContainer API
  ],
  credentials: true, // For auth tokens
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
```

### Authentication Flow
1. **Frontend** gets token from Clerk
2. **Frontend** sends token in Authorization header to backend
3. **Backend** validates token with Clerk's API
4. **Backend** returns data or error response
5. **WebSocket** authentication via handshake with token

### Security Headers
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});
```

## Migration Timeline

**Week 1: Backend Setup**
- Day 1-2: Create backend repository and basic structure
- Day 3-4: Configure CORS and deploy to staging
- Day 5-7: Test all backend endpoints and WebSocket connections

**Week 2: Frontend Migration**
- Day 1-2: Update frontend to use external backend
- Day 3-4: Remove server dependencies and test in Bolt.new
- Day 5-7: End-to-end testing and bug fixes

## Rollback Plan
If issues arise:
1. **Keep current monorepo** as backup
2. **Revert frontend changes** to use local backend
3. **Document issues** for future resolution
4. **Consider hybrid approach** (some endpoints external, some local)

## Success Criteria
- [ ] Bolt.new project duplication works reliably
- [ ] All WebRTC functionality works with external backend
- [ ] Authentication flow works across origins
- [ ] AI features (ElevenLabs, OpenAI) work from deployed backend
- [ ] Performance is acceptable (< 200ms additional latency)
- [ ] No CORS errors in browser console
- [ ] WebSocket connections stable from Bolt.new to external server

## Risks & Mitigation
1. **CORS Issues**: Comprehensive testing with real Bolt.new URLs
2. **WebSocket Failures**: Fallback to HTTP polling if needed
3. **Auth Token Issues**: Implement token refresh and error handling
4. **Deployment Costs**: Choose cost-effective platform (Railway free tier)
5. **Network Latency**: Deploy backend geographically close to users

## Questions for Approval
1. **Deployment Platform**: Confirmed - using netcup VPS 2000 G11 ✅
2. **Timeline**: Is 2-week timeline acceptable?
3. **Domain**: Should we get custom domain for backend API?
4. **Monitoring**: Add logging/monitoring to track CORS and auth issues?
5. **Fallback**: Keep current monorepo structure as backup during transition?

---

**Status**: Planning Phase - Awaiting Approval
**Created**: 2025-01-29
**Last Updated**: 2025-01-29
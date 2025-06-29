import { verifyToken } from '@clerk/backend';
import { logger } from '../logger.js';
import { config } from 'dotenv';
import { Request, Response, NextFunction } from 'express';

// Load environment variables from parent directory
config({ path: '../.env' });

// Initialize Supabase for auth middleware
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

// Extend Express Request interface
declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      userId: string | null;
      sessionId?: string;
      claims?: Record<string, unknown>;
      isAnonymous?: boolean;
    };
    meeting?: {
      meetingId: string;
    };
  }
}

// Check if we're in webcontainer mode via environment variable or shell detection
function isWebContainerEnvironment(): boolean {
  // First check explicit environment variable
  if (process.env.WEBCONTAINER_MODE === 'true') {
    return true;
  }
  
  // Fallback: detect webcontainer by shell (Bolt.new/StackBlitz use /bin/jsh)
  if (process.env.SHELL === '/bin/jsh') {
    return true;
  }
  
  return false;
}

// Middleware to authenticate requests using Clerk JWT
export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No authorization token provided' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // For development/testing, allow a special bypass token
    if (process.env.NODE_ENV === 'development' && token === 'dev-bypass-token') {
      logger.warn('Using development bypass token - INSECURE FOR PRODUCTION');
      req.auth = {
        userId: 'dev-user-id',
        isAnonymous: false
      };
      next();
      return;
    }

    // Handle webcontainer environments where JWT verification fails due to WebCrypto API limitations
    const isWebContainer = isWebContainerEnvironment();
    logger.debug('WebContainer environment check', { 
      isWebContainer, 
      webcontainerModeEnv: process.env.WEBCONTAINER_MODE,
      shell: process.env.SHELL,
      nodeEnv: process.env.NODE_ENV 
    });
    
    if (isWebContainer && (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)) {
      logger.warn('WebContainer environment detected - Clerk JWT verification incompatible with WebCrypto API');
      logger.warn('Falling back to anonymous access in development mode');
      req.auth = { 
        userId: null, 
        isAnonymous: true 
      };
      next();
      return;
    }

    // Check if we have the required Clerk configuration
    if (!process.env.CLERK_SECRET_KEY) {
      logger.error('Clerk authentication failed - Missing CLERK_SECRET_KEY');
      res.status(500).json({ error: 'Authentication configuration error' });
      return;
    }

    try {
      // Extract issuer from publishable key or use environment variable  
      const getClerkIssuer = (): string => {
        // First priority: explicit CLERK_ISSUER environment variable
        if (process.env.CLERK_ISSUER) {
          return process.env.CLERK_ISSUER;
        }

        // Second priority: extract from publishable key with base64 decoding support
        const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
        if (publishableKey) {
          const parts = publishableKey.split('_');
          if (parts.length >= 3) {
            let slug = parts[2];
            
            // Check if slug is base64 encoded (common in Bolt.new environments)
            try {
              const decoded = Buffer.from(slug, 'base64').toString('utf-8');
              const cleanDomain = decoded.replace(/\$$/, '');
              if (cleanDomain.includes('.clerk.accounts.dev')) {
                // Extract only the project slug (part before .clerk.accounts.dev)
                const projectSlug = cleanDomain.split('.clerk.accounts.dev')[0];
                logger.debug('Decoded base64 publishable key', { slug, decoded: cleanDomain, projectSlug });
                return `https://${projectSlug}.clerk.accounts.dev`;
              }
            } catch {
              // Not base64, use as-is
              logger.debug('Using raw slug from publishable key', { slug });
              return `https://${slug}.clerk.accounts.dev`;
            }
          }
        }

        // Fallback for fine-mullet-11 project
        return 'https://fine-mullet-11.clerk.accounts.dev';
      };

      const issuer = getClerkIssuer();
      
      logger.debug('Clerk verification attempt', { 
        issuer, 
        hasSecretKey: !!process.env.CLERK_SECRET_KEY,
        tokenLength: token.length
      });
      
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });
      
      if (!payload || !payload.sub) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      // Add user info to request
      req.auth = {
        userId: payload.sub,
        sessionId: payload.sid,
        claims: payload
      };

      next();
    } catch (verifyError) {
      logger.error('JWT verification failed', { 
        error: verifyError instanceof Error ? verifyError.message : String(verifyError)
      });
      
      // Check if this is a WebCrypto related error
      const isWebContainer = isWebContainerEnvironment();
      const isWebCryptoError = verifyError instanceof Error && 
                              (verifyError.message.includes('Invalid keyData') || 
                               verifyError.message.includes('DataError'));
      
      if (isWebContainer && isWebCryptoError) {
        logger.warn('WebCrypto API error detected in webcontainer - falling back to anonymous access');
      }
      
      // Fall back to anonymous access for development
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Falling back to anonymous access in development mode');
        req.auth = { 
          userId: null, 
          isAnonymous: true 
        };
        next();
        return;
      }
      
      res.status(401).json({ error: 'Authentication failed' });
    }
  } catch (error: unknown) {
    logger.error('Authentication failed', { message: error instanceof Error ? error.message : String(error) });
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Middleware to validate meeting access
export const validateMeetingAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.auth!;
    const { meetingId } = req.params;
    
    if (!meetingId) {
      res.status(400).json({ error: 'Meeting ID required' });
      return;
    }

    // Check if user is participant in meeting
    // This will be implemented with Supabase query
    const hasAccess = await checkMeetingParticipant(userId!, meetingId);
    
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to meeting' });
      return;
    }
    
    // Add meeting info to request
    req.meeting = { meetingId };
    
    next();
  } catch (error: unknown) {
    console.error('Meeting access validation error:', error);
    res.status(500).json({ error: 'Access validation failed' });
  }
};

// Helper function to check meeting access (considers both direct participation and project membership)
async function checkMeetingParticipant(userId: string, meetingId: string): Promise<boolean> {
  if (!userId) return false;
  
  // Get meeting details including project association
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('id, project_id')
    .eq('id', meetingId)
    .single();
  
  if (meetingError || !meeting) {
    return false;
  }
  
  // If meeting is associated with a project, check project membership
  if (meeting.project_id) {
    const { data: membership, error: memberError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', meeting.project_id)
      .eq('user_id', userId)
      .single();
    
    return !memberError && !!membership;
  }
  
  // For non-project meetings, check direct participation
  const { data: participation, error: participationError } = await supabase
    .from('meeting_participants')
    .select('user_id')
    .eq('meeting_id', meetingId)
    .eq('user_id', userId)
    .single();
  
  return !participationError && !!participation;
}

// Middleware for optional authentication (allows both authenticated and anonymous users)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth provided, continue as anonymous
      req.auth = { userId: null, isAnonymous: true };
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    // For development/testing, allow a special bypass token
    if (process.env.NODE_ENV === 'development' && token === 'dev-bypass-token') {
      logger.warn('Using development bypass token - INSECURE FOR PRODUCTION');
      req.auth = {
        userId: 'dev-user-id',
        isAnonymous: false
      };
      next();
      return;
    }

    // Handle webcontainer environments where JWT verification fails
    const isWebContainer = isWebContainerEnvironment();
    if (isWebContainer && (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)) {
      logger.warn('WebContainer environment detected in optionalAuth - falling back to anonymous');
      req.auth = { userId: null, isAnonymous: true };
      next();
      return;
    }
    
    try {
      // Extract issuer with base64 support (same logic as authenticateUser)
      const getClerkIssuer = (): string => {
        if (process.env.CLERK_ISSUER) {
          return process.env.CLERK_ISSUER;
        }

        const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
        if (publishableKey) {
          const parts = publishableKey.split('_');
          if (parts.length >= 3) {
            let slug = parts[2];
            
            try {
              const decoded = Buffer.from(slug, 'base64').toString('utf-8');
              const cleanDomain = decoded.replace(/\$$/, '');
              if (cleanDomain.includes('.clerk.accounts.dev')) {
                const projectSlug = cleanDomain.split('.clerk.accounts.dev')[0];
                return `https://${projectSlug}.clerk.accounts.dev`;
              }
            } catch {
              return `https://${slug}.clerk.accounts.dev`;
            }
          }
        }

        return 'https://fine-mullet-11.clerk.accounts.dev';
      };

      const issuer = getClerkIssuer();
      
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!
      });
      
      if (payload && payload.sub) {
        req.auth = {
          userId: payload.sub,
          sessionId: payload.sid,
          claims: payload,
          isAnonymous: false
        };
      } else {
        req.auth = { userId: null, isAnonymous: true };
      }
    } catch {
      // Invalid token, treat as anonymous
      req.auth = { userId: null, isAnonymous: true };
    }
    
    next();
  } catch (error: unknown) {
    console.error('Optional auth error:', error instanceof Error ? error.message : String(error));
    req.auth = { userId: null, isAnonymous: true };
    next();
  }
};
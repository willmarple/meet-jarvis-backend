import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

// Generate a secure random token
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create new invite token
router.post('/invite-tokens', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.auth!;
    const { email, role = 'judge', expiresInDays = 30, metadata } = req.body;
    
    // Validate role
    const validRoles = ['judge', 'admin', 'member'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be: judge, admin, or member' });
      return;
    }
    
    // Generate secure token
    const token = generateSecureToken();
    
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    console.log(`Creating invite token for role ${role}, expires: ${expiresAt.toISOString()}`);
    
    // Insert token
    const { data, error } = await supabase
      .from('invite_tokens')
      .insert([{
        token,
        email,
        role,
        created_by: userId,
        expires_at: expiresAt.toISOString(),
        metadata: metadata || { purpose: 'hackathon_judge_access' }
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating invite token:', error);
      res.status(500).json({ error: 'Failed to create invite token' });
      return;
    }
    
    // Return token without sensitive details
    res.status(201).json({
      id: data.id,
      token: data.token,
      email: data.email,
      role: data.role,
      expires_at: data.expires_at,
      created_at: data.created_at,
      metadata: data.metadata
    });
  } catch (error: unknown) {
    console.error('Invite token creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's created invite tokens
router.get('/invite-tokens', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.auth!;
    const { includeUsed = false } = req.query;
    
    console.log(`Fetching invite tokens for user ${userId}, includeUsed: ${includeUsed}`);
    
    let query = supabase
      .from('invite_tokens')
      .select('*')
      .eq('created_by', userId);
    
    // Optionally filter out used tokens
    if (includeUsed !== 'true') {
      query = query.is('used_at', null);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching invite tokens:', error);
      res.status(500).json({ error: 'Failed to fetch invite tokens' });
      return;
    }
    
    res.json(data || []);
  } catch (error: unknown) {
    console.error('Invite tokens fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate/update invite token
router.put('/invite-tokens/:tokenId', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tokenId } = req.params;
    const { userId } = req.auth!;
    const { is_active } = req.body;
    
    // Verify the token belongs to this user
    const { data: existingToken, error: fetchError } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('id', tokenId)
      .eq('created_by', userId)
      .single();
    
    if (fetchError || !existingToken) {
      res.status(404).json({ error: 'Invite token not found' });
      return;
    }
    
    console.log(`Updating invite token ${tokenId}, setting active: ${is_active}`);
    
    // Update the token
    const { data, error } = await supabase
      .from('invite_tokens')
      .update({ is_active })
      .eq('id', tokenId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating invite token:', error);
      res.status(500).json({ error: 'Failed to update invite token' });
      return;
    }
    
    res.json(data);
  } catch (error: unknown) {
    console.error('Invite token update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoints for token validation (no auth required)

// Validate invite token (public endpoint for signup flow)
router.post('/public/invite-tokens/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }
    
    console.log(`Validating invite token: ${token.substring(0, 8)}...`);
    
    // Check if token exists and is valid
    const { data, error } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !data) {
      res.status(400).json({ 
        valid: false, 
        error: 'Invalid, expired, or already used token' 
      });
      return;
    }
    
    // Return validation success with token details (no sensitive info)
    res.json({
      valid: true,
      email: data.email,
      role: data.role,
      expires_at: data.expires_at,
      metadata: data.metadata
    });
  } catch (error: unknown) {
    console.error('Token validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Consume invite token (mark as used)
router.post('/public/invite-tokens/consume', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, user_id } = req.body;
    
    if (!token || !user_id) {
      res.status(400).json({ error: 'Token and user_id are required' });
      return;
    }
    
    console.log(`Consuming invite token for user: ${user_id}`);
    
    // Verify token is still valid before consuming
    const { data: existingToken, error: fetchError } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (fetchError || !existingToken) {
      res.status(400).json({ 
        error: 'Invalid, expired, or already used token' 
      });
      return;
    }
    
    // Mark token as used
    const { data, error } = await supabase
      .from('invite_tokens')
      .update({
        used_at: new Date().toISOString(),
        used_by_user_id: user_id
      })
      .eq('token', token)
      .select()
      .single();
    
    if (error) {
      console.error('Error consuming invite token:', error);
      res.status(500).json({ error: 'Failed to consume invite token' });
      return;
    }
    
    res.json({
      success: true,
      role: data.role,
      used_at: data.used_at
    });
  } catch (error: unknown) {
    console.error('Token consumption error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../middleware/auth.js';
// import { validateMeetingAccess } from '../middleware/auth.js'; // TODO: Add meeting-level access control for production

const router = express.Router();

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

// NOTE: Meeting-level access control is available via validateMeetingAccess middleware from auth.js
// For hackathon version, we use open access (any authenticated user can access any meeting)
// TODO: Add validateMeetingAccess middleware to routes below for production security

// Create or get meeting
router.post('/meetings', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.auth!;
    const { id, name, host_id } = req.body;
    
    if (!id || !name) {
      res.status(400).json({ error: 'Meeting ID and name are required' });
      return;
    }
    
    // Try to get existing meeting first
    const { data: existingMeeting, error: fetchError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching meeting:', fetchError);
      res.status(500).json({ error: 'Failed to fetch meeting' });
      return;
    }
    
    if (existingMeeting) {
      // Meeting exists, return it
      res.json(existingMeeting);
    } else {
      // Create new meeting
      const { data, error } = await supabase
        .from('meetings')
        .insert([{
          id,
          name,
          host_id: host_id || userId,
          is_active: true
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating meeting:', error);
        res.status(500).json({ error: 'Failed to create meeting' });
        return;
      }
      
      res.json(data);
    }
  } catch (error: unknown) {
    console.error('Meeting creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get meeting by ID
router.get('/meetings/:meetingId', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;
    // User authentication verified by middleware
    
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Meeting not found' });
        return;
      }
      console.error('Error fetching meeting:', error);
      res.status(500).json({ error: 'Failed to fetch meeting' });
      return;
    }
    
    res.json(data);
  } catch (error: unknown) {
    console.error('Meeting fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add participant to meeting
router.post('/meetings/:meetingId/participants', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;
    const { userId } = req.auth!;
    const { user_name, user_id } = req.body;
    
    console.log('Adding participant to meeting:', {
      meetingId,
      authUserId: userId,
      requestUserId: user_id,
      userName: user_name
    });
    
    if (!user_name) {
      res.status(400).json({ error: 'User name is required' });
      return;
    }
    
    // Always use the authenticated user ID from JWT token for security
    const participantUserId = userId;
    
    console.log('Final participant data:', {
      meeting_id: meetingId,
      user_name,
      user_id: participantUserId,
      is_connected: true
    });
    
    // Upsert participant
    const { data, error } = await supabase
      .from('meeting_participants')
      .upsert([{
        meeting_id: meetingId,
        user_name,
        user_id: participantUserId,
        is_connected: true,
        joined_at: new Date().toISOString(),
        left_at: null
      }], {
        onConflict: 'meeting_id,user_id'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding participant:', error);
      res.status(500).json({ error: 'Failed to add participant' });
      return;
    }
    
    res.json(data);
  } catch (error: unknown) {
    console.error('Participant add error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update participant status
router.put('/meetings/:meetingId/participants/:userId/status', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId, userId: participantUserId } = req.params;
    const { userId: authUserId } = req.auth!;
    const { is_connected } = req.body;
    
    console.log('Participant status update attempt:', {
      meetingId,
      participantUserId,
      authUserId,
      is_connected,
      userIdMatch: authUserId === participantUserId
    });
    
    // Users can only update their own status
    if (authUserId !== participantUserId) {
      console.log('User ID mismatch - rejecting request');
      res.status(403).json({ error: 'Can only update your own status' });
      return;
    }
    
    // First, let's check if the participant exists
    const { data: existingParticipant, error: checkError } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('user_id', participantUserId)
      .maybeSingle();
    
    console.log('Existing participant check:', {
      found: !!existingParticipant,
      participant: existingParticipant,
      error: checkError
    });
    
    if (checkError) {
      console.error('Error checking for existing participant:', checkError);
      res.status(500).json({ error: 'Failed to check participant status' });
      return;
    }
    
    if (!existingParticipant) {
      console.log('Participant not found - cannot update status');
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    
    const updateData: { is_connected: boolean; left_at?: string } = { is_connected };
    if (!is_connected) {
      updateData.left_at = new Date().toISOString();
    }
    
    console.log('Updating participant with data:', updateData);
    
    const { data, error } = await supabase
      .from('meeting_participants')
      .update(updateData)
      .eq('meeting_id', meetingId)
      .eq('user_id', participantUserId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating participant status:', error);
      res.status(500).json({ error: 'Failed to update participant status' });
      return;
    }
    
    res.json(data);
  } catch (error: unknown) {
    console.error('Participant status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get meeting participants
router.get('/meetings/:meetingId/participants', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;
    
    const { data, error } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('is_connected', true)
      .order('joined_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching participants:', error);
      res.status(500).json({ error: 'Failed to fetch participants' });
      return;
    }
    
    res.json(data || []);
  } catch (error: unknown) {
    console.error('Participants fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
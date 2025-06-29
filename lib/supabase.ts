import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Some features may not work.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Database Types
export type Meeting = {
  id: string;
  name: string;
  host_id: string;
  created_at: string;
  is_active: boolean;
};

export type MeetingParticipant = {
  id: string;
  meeting_id: string;
  user_name: string;
  user_id: string;
  joined_at: string;
  left_at?: string;
  is_connected: boolean;
};

export type MeetingKnowledge = {
  id: string;
  meeting_id: string;
  content: string;
  content_type: 'fact' | 'context' | 'summary' | 'question' | 'answer';
  source: 'user' | 'ai' | 'document';
  created_at: string;
  updated_at: string;
};

// Meeting Management Functions
export const meetingService = {
  // Create a new meeting
  async createMeeting(meetingData: { id: string; name: string; host_id: string }) {
    const { data, error } = await supabase
      .from('meetings')
      .insert([meetingData])
      .select()
      .single();
    
    if (error) throw error;
    return data as Meeting;
  },

  // Get meeting by ID - returns null if not found instead of throwing error
  async getMeeting(meetingId: string): Promise<Meeting | null> {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle no results
    
    if (error) throw error;
    return data as Meeting | null;
  },

  // Update meeting status
  async updateMeetingStatus(meetingId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('meetings')
      .update({ is_active: isActive })
      .eq('id', meetingId)
      .select()
      .single();
    
    if (error) throw error;
    return data as Meeting;
  },

  // Add participant to meeting - uses upsert to handle existing participants
  async addParticipant(participantData: {
    meeting_id: string;
    user_name: string;
    user_id: string;
  }) {
    const { data, error } = await supabase
      .from('meeting_participants')
      .upsert([{
        ...participantData,
        is_connected: true,
        joined_at: new Date().toISOString(),
        left_at: null
      }], {
        onConflict: 'meeting_id,user_id'
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as MeetingParticipant;
  },

  // Update participant connection status - handles missing records gracefully
  async updateParticipantStatus(userId: string, meetingId: string, isConnected: boolean): Promise<void> {
    const updateData: { is_connected: boolean; left_at?: string } = { is_connected: isConnected };
    if (!isConnected) {
      updateData.left_at = new Date().toISOString();
    }

    const { count, error } = await supabase
      .from('meeting_participants')
      .update(updateData)
      .eq('user_id', userId)
      .eq('meeting_id', meetingId);
    
    if (error) throw error;
    
    if (count === 0) {
      console.warn(`No participant found for user ${userId} in meeting ${meetingId}`);
    }
  },

  // Get meeting participants
  async getMeetingParticipants(meetingId: string) {
    const { data, error } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('is_connected', true);
    
    if (error) throw error;
    return data as MeetingParticipant[];
  }
};

// Knowledge Base Functions
export const knowledgeService = {
  // Add knowledge to meeting
  async addKnowledge(knowledgeData: {
    meeting_id: string;
    content: string;
    content_type: MeetingKnowledge['content_type'];
    source: MeetingKnowledge['source'];
  }) {
    const { data, error } = await supabase
      .from('meeting_knowledge')
      .insert([{
        ...knowledgeData,
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data as MeetingKnowledge;
  },

  // Get meeting knowledge
  async getMeetingKnowledge(meetingId: string, contentType?: string) {
    let query = supabase
      .from('meeting_knowledge')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });
    
    if (contentType) {
      query = query.eq('content_type', contentType);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data as MeetingKnowledge[];
  },

  // Update knowledge
  async updateKnowledge(knowledgeId: string, updates: Partial<MeetingKnowledge>) {
    const { data, error } = await supabase
      .from('meeting_knowledge')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', knowledgeId)
      .select()
      .single();
    
    if (error) throw error;
    return data as MeetingKnowledge;
  },

  // Subscribe to knowledge updates
  subscribeToKnowledgeUpdates(meetingId: string, callback: (payload: { new?: MeetingKnowledge; old?: MeetingKnowledge; eventType: string }) => void) {
    return supabase
      .channel(`meeting_knowledge:${meetingId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'meeting_knowledge',
          filter: `meeting_id=eq.${meetingId}`
        },
        callback
      )
      .subscribe();
  }
};

// Real-time subscriptions
export const realtimeService = {
  // Subscribe to participant updates
  subscribeToParticipants(meetingId: string, callback: (payload: { new?: MeetingParticipant; old?: MeetingParticipant; eventType: string }) => void) {
    return supabase
      .channel(`meeting_participants:${meetingId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'meeting_participants',
          filter: `meeting_id=eq.${meetingId}`
        },
        callback
      )
      .subscribe();
  },

  // Subscribe to meeting updates
  subscribeToMeeting(meetingId: string, callback: (payload: { new?: unknown; old?: unknown; eventType: string }) => void) {
    return supabase
      .channel(`meeting:${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `id=eq.${meetingId}`
        },
        callback
      )
      .subscribe();
  }
};
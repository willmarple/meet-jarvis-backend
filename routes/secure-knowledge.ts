import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser, validateMeetingAccess } from '../middleware/auth.js';

const router = express.Router();

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

// Get meeting knowledge with proper authorization
router.get('/meetings/:meetingId/knowledge', 
  authenticateUser, 
  validateMeetingAccess, 
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { meetingId } = req.params;
      const { userId } = req.auth!;
      
      console.log(`Fetching knowledge for meeting ${meetingId}, user: ${userId}`);
      
      // Query knowledge with meeting isolation
      const { data, error } = await supabase
        .from('meeting_knowledge')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching meeting knowledge:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch meeting knowledge' 
        });
        return;
      }
      
      res.json({
        success: true,
        data: data || []
      });
    } catch (error: unknown) {
      console.error('Unexpected error in knowledge route:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

// Add new knowledge to meeting with proper authorization
router.post('/meetings/:meetingId/knowledge',
  authenticateUser,
  validateMeetingAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { meetingId } = req.params;
      const { userId } = req.auth!;
      const { content, content_type = 'fact', source = 'user' } = req.body;
      
      if (!content) {
        res.status(400).json({ 
          success: false, 
          error: 'Content is required' 
        });
        return;
      }
      
      console.log(`Adding knowledge to meeting ${meetingId}, user: ${userId}`);
      
      // Insert new knowledge with user attribution
      const { data, error } = await supabase
        .from('meeting_knowledge')
        .insert([{
          meeting_id: meetingId,
          content,
          content_type,
          source,
          creator_id: userId, // Add creator_id for security
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error adding meeting knowledge:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to add meeting knowledge' 
        });
        return;
      }
      
      res.status(201).json({
        success: true,
        data
      });
    } catch (error: unknown) {
      console.error('Unexpected error in knowledge creation route:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

// Execute AI tools with proper authentication
router.post('/meetings/:meetingId/ai-tools', 
  authenticateUser, 
  validateMeetingAccess, 
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { meetingId } = req.params;
      const { userId } = req.auth!;
      const { toolName, parameters } = req.body;
      
      console.log('🔐 Secure AI Tools - Request received:', {
        meetingId,
        userId,
        toolName,
        parameters,
        authContext: req.auth,
        timestamp: new Date().toISOString()
      });
      
      if (!toolName) {
        console.log('🔐 Secure AI Tools - Missing toolName parameter');
        res.status(400).json({ 
          success: false, 
          error: 'toolName parameter is required' 
        });
        return;
      }
      
      console.log(`🔐 Secure AI Tools - Executing tool "${toolName}" for meeting ${meetingId}, user: ${userId}`);
      
      // Import AI Tools Service
      const { createAIToolsService } = await import('../services/aiToolsService.js');
      console.log('🔐 Secure AI Tools - Creating AI tools service with userId:', userId);
      const aiToolsService = createAIToolsService(meetingId, userId || undefined);

      // Execute the tool with user context
      console.log('🔐 Secure AI Tools - Executing tool with parameters:', { toolName, parameters });
      const result = await aiToolsService.executeTool({
        name: toolName,
        parameters: parameters || {}
      });

      console.log('🔐 Secure AI Tools - Tool execution completed:', {
        toolName,
        success: result.success,
        hasData: !!result.data,
        resultPreview: result.success ? (result.data && typeof result.data === 'object' ? Object.keys(result.data) : 'simple_result') : result.error
      });

      res.json({ 
        success: true, 
        message: `AI tool "${toolName}" executed successfully`,
        result
      });
    } catch (error: unknown) {
      console.error('Secure AI tools execution failed:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      });
    }
  }
);

export default router;
import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

interface MembershipResult {
  hasAccess: boolean;
  membership: {
    role: string;
    project_id: string;
    user_id: string;
  } | null;
}

interface ProjectMember {
  role: string;
  joined_at: string;
  projects: {
    id: string;
    handle: string;
    name: string;
    description: string | null;
    owner_id: string;
    created_at: string;
    updated_at: string;
  } | null;
}

// Helper function to check project membership
async function checkProjectMembership(userId: string | null, projectId: string, requiredRole: string | null = null): Promise<MembershipResult> {
  if (!userId) return { hasAccess: false, membership: null };
  
  const { data, error } = await supabase
    .from('project_members')
    .select('role, project_id, user_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return { hasAccess: false, membership: null };
  }
  
  const hasAccess = requiredRole ? 
    ['owner', 'admin'].includes(data.role) || data.role === requiredRole :
    true;
  
  return { hasAccess, membership: data };
}

// Helper function to check if user can manage project (owner or admin)
async function checkProjectManagement(userId: string | null, projectId: string): Promise<boolean> {
  if (!userId) return false;
  
  const { data, error } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .single();
  
  return !error && !!data;
}

// Create new project
router.post('/projects', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.auth!;
    const { handle, name, description } = req.body;
    
    if (!handle || !name) {
      res.status(400).json({ error: 'Project handle and name are required' });
      return;
    }
    
    // Validate handle format (lowercase, alphanumeric, hyphens)
    const handleRegex = /^[a-z0-9-]+$/;
    if (!handleRegex.test(handle)) {
      res.status(400).json({ 
        error: 'Handle must contain only lowercase letters, numbers, and hyphens' 
      });
      return;
    }
    
    console.log(`Creating project: ${handle} by user ${userId}`);
    
    // Create project (trigger will automatically add owner as member)
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        handle,
        name,
        description,
        owner_id: userId
      }])
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: 'Project handle already exists' });
        return;
      }
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Failed to create project' });
      return;
    }
    
    res.status(201).json(data);
  } catch (error: unknown) {
    console.error('Project creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's projects
router.get('/projects', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.auth!;
    
    console.log(`Fetching projects for user ${userId}`);
    
    // Get projects where user is a member
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        role,
        joined_at,
        projects (
          id,
          handle,
          name,
          description,
          owner_id,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
      return;
    }
    
    // Transform the data to flatten the structure
    const projects = (data as unknown as ProjectMember[])
      .filter(item => item.projects !== null)
      .map((item) => ({
        ...item.projects!,
        user_role: item.role,
        joined_at: item.joined_at
      }));
    
    res.json(projects);
  } catch (error: unknown) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get project by handle
router.get('/projects/:handle', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle } = req.params;
    const { userId } = req.auth!;
    
    console.log(`Fetching project ${handle} for user ${userId}`);
    
    // Get project details
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('handle', handle)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user has access to this project
    const { membership } = await checkProjectMembership(userId, project.id);
    const userRole = membership?.role || null;
    
    // Add user's role to response
    const response = {
      ...project,
      user_role: userRole
    };
    
    res.json(response);
  } catch (error: unknown) {
    console.error('Project fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update project
router.put('/projects/:handle', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle } = req.params;
    const { userId } = req.auth!;
    const { name, description } = req.body;
    
    // Get project to check permissions
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('handle', handle)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user can manage this project
    const canManage = await checkProjectManagement(userId, project.id);
    if (!canManage) {
      res.status(403).json({ error: 'Insufficient permissions to update project' });
      return;
    }
    
    console.log(`Updating project ${handle} by user ${userId}`);
    
    const { data, error } = await supabase
      .from('projects')
      .update({ name, description })
      .eq('handle', handle)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating project:', error);
      res.status(500).json({ error: 'Failed to update project' });
      return;
    }
    
    res.json(data);
  } catch (error: unknown) {
    console.error('Project update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get project members
router.get('/projects/:handle/members', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle } = req.params;
    const { userId } = req.auth!;
    
    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user has access to this project
    const { hasAccess } = await checkProjectMembership(userId, project.id);
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to project' });
      return;
    }
    
    console.log(`Fetching members for project ${handle}`);
    
    const { data, error } = await supabase
      .from('project_members')
      .select('user_id, role, invited_by, joined_at')
      .eq('project_id', project.id)
      .order('joined_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching project members:', error);
      res.status(500).json({ error: 'Failed to fetch project members' });
      return;
    }
    
    res.json(data || []);
  } catch (error: unknown) {
    console.error('Project members fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add member to project
router.post('/projects/:handle/members', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle } = req.params;
    const { userId } = req.auth!;
    const { user_id, role = 'member' } = req.body;
    
    if (!user_id) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    
    // Validate role
    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    
    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user can manage this project
    const canManage = await checkProjectManagement(userId, project.id);
    if (!canManage) {
      res.status(403).json({ error: 'Insufficient permissions to add members' });
      return;
    }
    
    console.log(`Adding member ${user_id} to project ${handle} with role ${role}`);
    
    // Add member
    const { data, error } = await supabase
      .from('project_members')
      .insert([{
        project_id: project.id,
        user_id,
        role,
        invited_by: userId
      }])
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: 'User is already a member of this project' });
        return;
      }
      console.error('Error adding project member:', error);
      res.status(500).json({ error: 'Failed to add project member' });
      return;
    }
    
    res.status(201).json(data);
  } catch (error: unknown) {
    console.error('Project member add error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update member role
router.put('/projects/:handle/members/:memberId', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle, memberId } = req.params;
    const { userId } = req.auth!;
    const { role } = req.body;
    
    // Validate role
    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    
    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user can manage this project
    const canManage = await checkProjectManagement(userId, project.id);
    if (!canManage) {
      res.status(403).json({ error: 'Insufficient permissions to update member role' });
      return;
    }
    
    console.log(`Updating member ${memberId} role to ${role} in project ${handle}`);
    
    const { data, error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', project.id)
      .eq('user_id', memberId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating member role:', error);
      res.status(500).json({ error: 'Failed to update member role' });
      return;
    }
    
    res.json(data);
  } catch (error: unknown) {
    console.error('Member role update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove member from project
router.delete('/projects/:handle/members/:memberId', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle, memberId } = req.params;
    const { userId } = req.auth!;
    
    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user can manage this project or is removing themselves
    const canManage = await checkProjectManagement(userId, project.id);
    const isSelf = userId === memberId;
    
    if (!canManage && !isSelf) {
      res.status(403).json({ error: 'Insufficient permissions to remove member' });
      return;
    }
    
    console.log(`Removing member ${memberId} from project ${handle}`);
    
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', project.id)
      .eq('user_id', memberId);
    
    if (error) {
      console.error('Error removing project member:', error);
      res.status(500).json({ error: 'Failed to remove project member' });
      return;
    }
    
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Project member removal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get project meetings
router.get('/projects/:handle/meetings', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle } = req.params;
    const { userId } = req.auth!;
    
    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user has access to this project
    const { hasAccess } = await checkProjectMembership(userId, project.id);
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to project' });
      return;
    }
    
    console.log(`Fetching meetings for project ${handle}`);
    
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching project meetings:', error);
      res.status(500).json({ error: 'Failed to fetch project meetings' });
      return;
    }
    
    res.json(data || []);
  } catch (error: unknown) {
    console.error('Project meetings fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create meeting in project
router.post('/projects/:handle/meetings', authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { handle } = req.params;
    const { userId } = req.auth!;
    const { id, name } = req.body;
    
    if (!id || !name) {
      res.status(400).json({ error: 'Meeting ID and name are required' });
      return;
    }
    
    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (projectError) {
      if (projectError.code === 'PGRST116') {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }
    
    // Check if user has access to create meetings in this project
    const { hasAccess } = await checkProjectMembership(userId, project.id);
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied to create meetings in this project' });
      return;
    }
    
    console.log(`Creating meeting ${id} in project ${handle}`);
    
    // Create meeting with project association
    const { data, error } = await supabase
      .from('meetings')
      .insert([{
        id,
        name,
        host_id: userId,
        project_id: project.id,
        is_active: true
      }])
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: 'Meeting ID already exists' });
        return;
      }
      console.error('Error creating project meeting:', error);
      res.status(500).json({ error: 'Failed to create project meeting' });
      return;
    }
    
    res.status(201).json(data);
  } catch (error: unknown) {
    console.error('Project meeting creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

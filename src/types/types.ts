/**
 * Shared Types - Single Source of Truth
 * Used by both frontend (src/) and backend (server/)
 * Prevents type drift and deployment issues
 */

// ===========================
// UTILITY TYPES
// ===========================

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ===========================
// BASE API RESPONSE TYPES
// ===========================

export interface ApiResponse<T = JsonValue> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

// ===========================
// AI TOOLS TYPES
// ===========================

export interface ToolCall {
  name: string
  parameters: Record<string, JsonValue>
}

export interface ToolResult {
  success: boolean
  data?: JsonValue
  error?: string
}

export interface AITool {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, JsonValue>
    required: string[]
  }
}

// ===========================
// KNOWLEDGE BASE TYPES
// ===========================

export interface KnowledgeItem {
  id: string
  content: string
  content_type: 'fact' | 'context' | 'summary' | 'question' | 'answer'
  source: string
  similarity?: number
  created_at: string
  meeting_id: string
  embedding?: number[]
}

export interface SearchResult extends KnowledgeItem {
  similarity: number
  keyword_match?: boolean
}

// ===========================
// API PARAMETER TYPES
// ===========================

export interface SearchParams {
  query: string
  content_type?: string
  limit?: number
}

export interface RecallDecisionsParams {
  topic: string
}

export interface GetActionItemsParams {
  assignee?: string
  status?: 'pending' | 'completed' | 'all'
}

export interface SummarizeTopicParams {
  topic: string
  include_context?: boolean
}

export interface FindSimilarDiscussionsParams {
  reference_text: string
  scope?: 'current_meeting' | 'all_meetings'
}

// ===========================
// API RESPONSE DATA TYPES
// ===========================

export interface SearchKnowledgeResult {
  query: string
  results: SearchResult[]
  total_found: number
}

export interface RecallDecisionsResult {
  topic: string
  decisions: Array<{
    content: string
    created_at: string
    similarity: number
  }>
}

export interface ActionItemsResult {
  assignee?: string
  status: string
  action_items: Array<{
    content: string
    created_at: string
    similarity: number
  }>
}

export interface TopicSummaryResult {
  topic: string
  summary: string
  content_breakdown: {
    facts: number
    context: number
    summaries: number
    questions: number
    answers: number
  }
  key_points: string[]
  related_items: Array<{
    content: string
    type: string
    similarity: number
  }>
}

export interface SimilarDiscussionsResult {
  reference_text: string
  scope: string
  similar_discussions: Array<{
    content: string
    type: string
    meeting_id: string
    similarity: number
    created_at: string
  }>
}

// ===========================
// HEALTH CHECK & TESTING TYPES
// ===========================

export interface KnowledgeHealthResult {
  healthScore: string
  results: {
    database: {
      connectivity: boolean
      error?: string
    }
    embeddings: {
      total_with_embeddings: number
      valid_embeddings: number
      quality_score: number
      error?: string
    }
    search: {
      queries: Record<string, {
        success: boolean
        duration: number
        resultCount: number
        error?: string
      }>
    }
    functions: {
      hybrid_search: boolean
      error?: string
    }
  }
  recommendations: string[]
}

export interface ElevenLabsTestResult {
  summary: {
    totalTools: number
    successfulTools: number
    averageDuration: string
    allToolsWorking: boolean
  }
  results: Record<string, {
    success: boolean
    duration: number
    dataCount: number
    error?: string
  }>
}

// ===========================
// FRONTEND TYPES
// ===========================

export type AppState = 'home' | 'meeting';

export interface MeetingData {
  roomId: string;
  userName: string;
  userId: string;
}

export interface User {
  id: string;
  fullName?: string;
  firstName?: string;
  emailAddresses?: Array<{ emailAddress: string }>;
}

// ===========================
// BACKEND/SERVER TYPES
// ===========================

export interface ParticipantData {
  id: string;
  socketId: string;
  name: string;
  roomId: string;
  joinedAt: string;
}

export interface RoomData {
  id: string;
  name?: string;
  createdAt: string;
  participants: ParticipantData[];
}

export interface TestResult {
  success: boolean;
  duration: number;
  dataCount?: number;
  error?: string;
}

export interface DatabaseTestResult {
  connectivity: boolean;
  error: string | null;
  total_items: number;
  meeting_specific_items: number;
}

export interface EmbeddingsTestResult {
  total_with_embeddings: number;
  valid_embeddings: number;
  quality_score: number;
  error?: string | null;
}

export interface SearchTestResult {
  queries: Record<string, { 
    success: boolean; 
    duration?: number; 
    resultCount?: number; 
    error?: string | null 
  }>;
}

export interface FunctionsTestResult {
  vector_search_available: boolean;
  similarity_search_working: boolean;
  hybrid_search?: boolean;
  error?: string | null;
}

export interface ComprehensiveTestResults {
  database: DatabaseTestResult;
  embeddings: EmbeddingsTestResult;
  search: SearchTestResult;
  functions: FunctionsTestResult;
}

export interface KnowledgeStatItem {
  meeting_id: string;
  content_type: string;
  source: string;
  embedding: unknown;
}
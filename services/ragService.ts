import { supabase } from '../lib/supabase.js';
import { embeddingService } from './embeddingService.js';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';
// Local type definition to avoid path issues
interface SearchResult {
  id: string;
  content: string;
  content_type: 'fact' | 'context' | 'summary' | 'question' | 'answer';
  source: string;
  similarity: number;
  keyword_match?: boolean;
  created_at: string;
  meeting_id: string;
  embedding?: number[];
}

export class RAGService {
  // Create authenticated Supabase client for bypassing RLS
  private getAuthenticatedClient() {
    return createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
    );
  }

  // Debug method to check raw database access
  async debugCheckKnowledge(meetingId: string): Promise<any[]> {
    const authenticatedClient = this.getAuthenticatedClient();
    logger.debug('🔍 DEBUG - Checking raw knowledge access for meeting', { meetingId });
    
    const { data, error } = await authenticatedClient
      .from('meeting_knowledge')
      .select('*')
      .eq('meeting_id', meetingId);
      
    logger.debug('🔍 DEBUG - Raw query result', {
      dataCount: data?.length || 0,
      error: error,
      firstItem: data?.[0] ? {
        id: data[0].id,
        content: data[0].content.substring(0, 100) + '...',
        meeting_id: data[0].meeting_id,
        hasEmbedding: !!data[0].embedding,
        hasKeywords: !!data[0].keywords
      } : null
    });
    
    return data || [];
  }

  // Debug method to test hybrid_search function directly
  async debugTestHybridSearch(meetingId: string, queryEmbedding: number[], queryText: string): Promise<any> {
    const authenticatedClient = this.getAuthenticatedClient();
    logger.debug('🔍 DEBUG - Testing hybrid_search function directly', { 
      meetingId, 
      queryText,
      embeddingLength: queryEmbedding.length,
      embeddingPreview: queryEmbedding.slice(0, 5)
    });
    
    // Test with very low threshold to see if we get any results
    const { data, error } = await authenticatedClient.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      target_meeting_id: meetingId,
      match_threshold: 0.0,  // Very low threshold
      match_count: 10
    });
    
    logger.debug('🔍 DEBUG - hybrid_search direct test result', {
      dataCount: data?.length || 0,
      error: error,
      firstResult: data?.[0] ? {
        similarity: data[0].similarity,
        keyword_match: data[0].keyword_match,
        content: data[0].content?.substring(0, 100) + '...'
      } : null
    });
    
    // Also test without meeting ID filter
    const { data: globalData, error: globalError } = await authenticatedClient.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      target_meeting_id: null,  // No meeting filter
      match_threshold: 0.0,
      match_count: 10
    });
    
    logger.debug('🔍 DEBUG - hybrid_search global test result', {
      dataCount: globalData?.length || 0,
      error: globalError,
      firstResult: globalData?.[0] ? {
        similarity: globalData[0].similarity,
        keyword_match: globalData[0].keyword_match,
        meeting_id: globalData[0].meeting_id,
        content: globalData[0].content?.substring(0, 100) + '...'
      } : null
    });
    
    return { meetingFiltered: data, global: globalData };
  }

  async semanticSearch(
    query: string,
    meetingId?: string,
    options: {
      limit?: number;
      threshold?: number;
      includeKeywordMatch?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7 } = options;

    logger.debug('🔍 RAG Service - semanticSearch called', {
      query,
      meetingId,
      limit,
      threshold,
      timestamp: new Date().toISOString()
    });

    try {
      // Generate embedding for the query
      logger.debug('🔍 RAG Service - Generating embedding for query', { query });
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      if (queryEmbedding.length === 0) {
        logger.warn('🔍 RAG Service - No embedding generated, falling back to text search');
        return this.textSearch(query, meetingId, limit);
      }

      logger.debug('🔍 RAG Service - Embedding generated', { length: queryEmbedding.length });
      logger.debug('🔍 RAG Service - Calling hybrid_search RPC with params', {
        query_text: query,
        target_meeting_id: meetingId || null,
        match_threshold: threshold,
        match_count: limit,
        embedding_preview: queryEmbedding.slice(0, 5), // Show first 5 values
        usingServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });

      // Try with a much lower threshold to see if that's the issue
      const lowThreshold = 0.1;
      logger.debug('🔍 RAG Service - Trying with lower threshold', { lowThreshold });

      // Use authenticated client for hybrid search to bypass RLS
      const authenticatedClient = this.getAuthenticatedClient();
      logger.debug('🔍 RAG Service - Using authenticated client for hybrid_search');
      
      // First try without meeting ID filter to test if hybrid_search works at all
      logger.debug('🔍 RAG Service - Testing hybrid_search without meeting filter first');
      const { data: testData, error: testError } = await authenticatedClient.rpc('hybrid_search', {
        query_embedding: queryEmbedding,
        query_text: query,
        target_meeting_id: null, // No meeting filter for test
        match_threshold: threshold,
        match_count: limit
      });
      
      logger.debug('🔍 RAG Service - hybrid_search test (no meeting filter)', {
        dataCount: testData ? testData.length : 0,
        error: testError
      });

      // Now try with meeting ID filter  
      const { data, error } = await authenticatedClient.rpc('hybrid_search', {
        query_embedding: queryEmbedding,
        query_text: query,
        target_meeting_id: meetingId || null,
        match_threshold: threshold,
        match_count: limit
      });

      logger.debug('🔍 RAG Service - hybrid_search RPC response', {
        dataCount: data ? data.length : 0,
        error: error,
        data: data ? data.map((item: any) => ({ 
          id: item.id, 
          content_preview: item.content?.substring(0, 100) + '...', 
          similarity: item.similarity,
          meeting_id: item.meeting_id 
        })) : null
      });

      if (error) {
        logger.error('🔍 RAG Service - Semantic search error', { error });
        logger.debug('🔍 RAG Service - Falling back to text search due to error');
        return this.textSearch(query, meetingId, limit);
      }

      logger.debug('🔍 RAG Service - Returning results from semantic search', { 
        resultCount: data?.length || 0 
      });
      return data || [];
    } catch (error) {
      logger.error('🔍 RAG Service - Error in semantic search', { error });
      logger.debug('🔍 RAG Service - Falling back to text search due to exception');
      return this.textSearch(query, meetingId, limit);
    }
  }

  async textSearch(
    query: string,
    meetingId?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    console.log('🔍 RAG Service - textSearch called (fallback):', {
      query,
      meetingId,
      limit,
      timestamp: new Date().toISOString()
    });

    try {
      // Use authenticated client for text search to bypass RLS
      const authenticatedClient = this.getAuthenticatedClient();
      console.log('🔍 RAG Service - Using authenticated client for text search');
      
      let queryBuilder = authenticatedClient
        .from('meeting_knowledge')
        .select('*')
        .textSearch('content', query, { type: 'websearch' })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (meetingId) {
        queryBuilder = queryBuilder.eq('meeting_id', meetingId);
      }

      console.log('🔍 RAG Service - Executing text search query...');
      const { data, error } = await queryBuilder;

      console.log('🔍 RAG Service - textSearch response:', {
        dataCount: data ? data.length : 0,
        error: error,
        data: data ? data.map((item: any) => ({ 
          id: item.id, 
          content_preview: item.content?.substring(0, 100) + '...', 
          meeting_id: item.meeting_id 
        })) : null
      });

      if (error) {
        console.error('🔍 RAG Service - Text search error:', error);
        return [];
      }

      console.log('🔍 RAG Service - Returning', data?.length || 0, 'results from text search');
      return data || [];
    } catch (error) {
      console.error('🔍 RAG Service - Error in text search:', error);
      return [];
    }
  }

  async buildAIContext(
    query: string,
    meetingId?: string,
    maxTokens: number = 2000
  ): Promise<string> {
    try {
      // Get relevant knowledge
      const relevantKnowledge = await this.semanticSearch(query, meetingId, { limit: 15 });
      
      if (relevantKnowledge.length === 0) {
        return `Meeting Context: No relevant knowledge found for "${query}"`;
      }

      // Build context with token management (rough estimation)
      let context = `Meeting Context for: "${query}"\n\n`;
      let tokenCount = this.estimateTokens(context);

      for (const item of relevantKnowledge) {
        const itemText = `[${item.content_type.toUpperCase()}] ${item.content}\n`;
        const itemTokens = this.estimateTokens(itemText);
        
        if (tokenCount + itemTokens > maxTokens) break;
        
        context += itemText;
        tokenCount += itemTokens;
      }

      return context;
    } catch (error) {
      console.error('Error building AI context:', error);
      return `Meeting Context: Error retrieving context for "${query}"`;
    }
  }

  async findSimilarKnowledge(
    knowledgeId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      // Use authenticated client for similar knowledge search
      const authenticatedClient = this.getAuthenticatedClient();
      
      // Get the source knowledge item
      const { data: sourceItem, error: sourceError } = await authenticatedClient
        .from('meeting_knowledge')
        .select('*')
        .eq('id', knowledgeId)
        .single();

      if (sourceError || !sourceItem || !sourceItem.embedding) {
        console.error('Error getting source item or no embedding:', sourceError);
        return [];
      }

      // Find similar items using vector similarity
      const { data, error } = await authenticatedClient.rpc('hybrid_search', {
        query_embedding: sourceItem.embedding,
        query_text: sourceItem.content,
        target_meeting_id: null, // Search across all meetings
        match_threshold: 0.6,
        match_count: limit + 1 // +1 to exclude the source item
      });

      if (error) {
        console.error('Similar knowledge search error:', error);
        return [];
      }

      // Filter out the source item
      return (data || []).filter((item: SearchResult) => item.id !== knowledgeId);
    } catch (error) {
      console.error('Error finding similar knowledge:', error);
      return [];
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

export const ragService = new RAGService();
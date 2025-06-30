import { supabase } from '../lib/supabase.js';
import { embeddingService } from './embeddingService.js';
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

    try {
      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      if (queryEmbedding.length === 0) {
        console.warn('No embedding generated, falling back to text search');
        return this.textSearch(query, meetingId, limit);
      }

      // Use the hybrid search function
      const { data, error } = await supabase.rpc('hybrid_search', {
        query_embedding: queryEmbedding,
        query_text: query,
        target_meeting_id: meetingId || null,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) {
        console.error('Semantic search error:', error);
        return this.textSearch(query, meetingId, limit);
      }

      return data || [];
    } catch (error) {
      console.error('Error in semantic search:', error);
      return this.textSearch(query, meetingId, limit);
    }
  }

  async textSearch(
    query: string,
    meetingId?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      let queryBuilder = supabase
        .from('meeting_knowledge')
        .select('*')
        .textSearch('content', query, { type: 'websearch' })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (meetingId) {
        queryBuilder = queryBuilder.eq('meeting_id', meetingId);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        console.error('Text search error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in text search:', error);
      return [];
    }
  }

  async buildAIContext(
    query: string,
    meetingId: string,
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
      // Get the source knowledge item
      const { data: sourceItem, error: sourceError } = await supabase
        .from('meeting_knowledge')
        .select('*')
        .eq('id', knowledgeId)
        .single();

      if (sourceError || !sourceItem || !sourceItem.embedding) {
        console.error('Error getting source item or no embedding:', sourceError);
        return [];
      }

      // Find similar items using vector similarity
      const { data, error } = await supabase.rpc('hybrid_search', {
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
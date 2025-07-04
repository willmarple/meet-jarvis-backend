import { ragService } from './ragService.js';
import { embeddingService } from './embeddingService.js';
import { logger } from '../logger.js';
// Local type definitions to avoid path issues
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface ToolCall {
  name: string;
  parameters: Record<string, JsonValue>;
}

interface ToolResult {
  success: boolean;
  data?: JsonValue;
  error?: string;
}

interface AITool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, JsonValue>;
    required: string[];
  };
}

export class AIToolsService {
  private meetingId: string;
  private userId?: string;

  constructor(meetingId: string, userId?: string) {
    this.meetingId = meetingId;
    this.userId = userId;
  }

  // Define available tools for the AI agent
  getAvailableTools(): AITool[] {
    return [
      {
        name: 'search_meeting_knowledge',
        description: 'Search through meeting knowledge and context using semantic search',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query or question about meeting content'
            },
            content_type: {
              type: 'string',
              enum: ['fact', 'context', 'summary', 'question', 'answer'],
              description: 'Filter by specific content type (optional)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 5)',
              default: 5
            }
          },
          required: ['query']
        }
      },
      {
        name: 'recall_decisions',
        description: 'Recall specific decisions made in meetings',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'The topic or subject of the decision to recall'
            }
          },
          required: ['topic']
        }
      },
      {
        name: 'summarize_topic',
        description: 'Generate a summary of discussions on a specific topic',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'The topic to summarize'
            },
            include_context: {
              type: 'boolean',
              description: 'Include background context in summary (default: true)',
              default: true
            }
          },
          required: ['topic']
        }
      }
    ];
  }

  // Execute a tool call from the AI
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    try {
      console.log('🔧 Executing AI tool:', toolCall.name, toolCall.parameters);

      switch (toolCall.name) {
        case 'search_meeting_knowledge':
          return await this.searchMeetingKnowledge(toolCall.parameters);
        
        case 'recall_decisions':
          return await this.recallDecisions(toolCall.parameters);
        
        case 'summarize_topic':
          return await this.summarizeTopic(toolCall.parameters);
        
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolCall.name}`
          };
      }
    } catch (error) {
      console.error('Error executing tool:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  private async searchMeetingKnowledge(params: JsonValue): Promise<ToolResult> {
    const { query, content_type, limit = 5 } = params as { query: string; content_type?: string; limit?: number; };
    
    const results = await ragService.semanticSearch(query, undefined, {
      limit,
      threshold: 0.6
    });

    // Filter by content type if specified
    const filteredResults = content_type 
      ? results.filter(r => r.content_type === content_type)
      : results;

    return {
      success: true,
      data: {
        query,
        results: filteredResults.slice(0, limit).map(r => ({
          content: r.content,
          type: r.content_type,
          source: r.source,
          similarity: r.similarity,
          created_at: r.created_at
        })),
        total_found: filteredResults.length
      }
    };
  }

  private async recallDecisions(params: JsonValue): Promise<ToolResult> {
    const { topic } = params as { topic: string; };
    
    logger.debug('🔧 AI Tools - recallDecisions called', {
      topic,
      meetingId: this.meetingId,
      userId: this.userId,
      timestamp: new Date().toISOString()
    });
    
    // Search for decision-related content
    const decisionQuery = `decision about ${topic}`;
    // Debug: Check raw database access first
    console.log('IMMEDIATE DEBUG - About to call debugCheckKnowledge');
    logger.debug('🔧 AI Tools - Debug: Checking raw database access...');
    await ragService.debugCheckKnowledge(this.meetingId);
    console.log('IMMEDIATE DEBUG - debugCheckKnowledge completed');
    
    // Debug: Test hybrid_search function directly
    console.log('IMMEDIATE DEBUG - About to test hybrid_search directly');
    logger.debug('🔧 AI Tools - Debug: Testing hybrid_search function directly...');
    
    // Generate embedding for the decision query
    const queryEmbedding = await embeddingService.generateEmbedding(decisionQuery);
    if (queryEmbedding.length > 0) {
      await ragService.debugTestHybridSearch(this.meetingId, queryEmbedding, decisionQuery);
    } else {
      logger.debug('🔧 AI Tools - Debug: Could not generate embedding for query');
    }
    console.log('IMMEDIATE DEBUG - hybrid_search test completed');
    
    logger.debug('🔧 AI Tools - Calling ragService.semanticSearch with query', { query: decisionQuery });
    
    const results = await ragService.semanticSearch(decisionQuery, undefined, {
      limit: 10,
      threshold: 0.1  // Much lower threshold to test if similarity matching is the issue
    });

    logger.debug('🔧 AI Tools - RAG search results received', {
      resultCount: results.length,
      results: results.map(r => ({
        id: r.id,
        content_preview: r.content.substring(0, 100) + '...',
        content_type: r.content_type,
        similarity: r.similarity,
        meeting_id: r.meeting_id
      }))
    });

    // Filter for decision-type content and high relevance
    const decisions = results.filter(r => 
      r.content_type === 'summary' || 
      r.content.toLowerCase().includes('decision') ||
      r.content.toLowerCase().includes('decided') ||
      r.content.toLowerCase().includes('agreed')
    );

    logger.debug('🔧 AI Tools - After filtering for decision keywords', {
      filteredCount: decisions.length,
      decisions: decisions.map(d => ({
        content_preview: d.content.substring(0, 100) + '...',
        similarity: d.similarity,
        matchedKeyword: d.content_type === 'summary' ? 'summary_type' :
          d.content.toLowerCase().includes('decision') ? 'decision' :
          d.content.toLowerCase().includes('decided') ? 'decided' :
          d.content.toLowerCase().includes('agreed') ? 'agreed' : 'unknown'
      }))
    });

    const result = {
      success: true,
      data: {
        topic,
        decisions: decisions.map(d => ({
          content: d.content,
          created_at: d.created_at,
          similarity: d.similarity
        }))
      }
    };

    logger.debug('🔧 AI Tools - recallDecisions returning', {
      success: result.success,
      decisionCount: result.data.decisions.length,
      topic: result.data.topic
    });

    return result;
  }

  private async getActionItems(params: JsonValue): Promise<ToolResult> {
    const { assignee, status = 'all' } = params as { assignee?: string; status?: string; };
    
    // Search for action items and tasks
    const actionQuery = assignee 
      ? `action item task ${assignee}` 
      : 'action item task todo assignment';
    
    const results = await ragService.semanticSearch(actionQuery, undefined, {
      limit: 15,
      threshold: 0.4
    });

    // Filter for action-related content
    const actionItems = results.filter(r => {
      const content = r.content.toLowerCase();
      return content.includes('action') || 
             content.includes('task') || 
             content.includes('todo') ||
             content.includes('assignment') ||
             content.includes('responsible') ||
             content.includes('deadline');
    });

    return {
      success: true,
      data: {
        assignee: assignee || null,
        status,
        action_items: actionItems.map(item => ({
          content: item.content,
          created_at: item.created_at,
          similarity: item.similarity
        }))
      } as JsonValue
    };
  }

  private async summarizeTopic(params: JsonValue): Promise<ToolResult> {
    const { topic } = params as { topic: string };
    
    // Get comprehensive information about the topic
    const results = await ragService.semanticSearch(topic, undefined, {
      limit: 20,
      threshold: 0.3
    });

    if (results.length === 0) {
      return {
        success: true,
        data: {
          topic,
          summary: `No discussions found about "${topic}" in this meeting.`,
          related_items: []
        }
      };
    }

    // Group by content type
    const groupedContent = {
      facts: results.filter(r => r.content_type === 'fact'),
      context: results.filter(r => r.content_type === 'context'),
      summaries: results.filter(r => r.content_type === 'summary'),
      questions: results.filter(r => r.content_type === 'question'),
      answers: results.filter(r => r.content_type === 'answer')
    };

    return {
      success: true,
      data: {
        topic,
        summary: `Found ${results.length} items related to "${topic}"`,
        content_breakdown: {
          facts: groupedContent.facts.length,
          context: groupedContent.context.length,
          summaries: groupedContent.summaries.length,
          questions: groupedContent.questions.length,
          answers: groupedContent.answers.length
        },
        key_points: results.slice(0, 5).map(r => r.content),
        related_items: results.map(r => ({
          content: r.content,
          type: r.content_type,
          similarity: r.similarity
        }))
      }
    };
  }

  private async findSimilarDiscussions(params: JsonValue): Promise<ToolResult> {
    const { reference_text, scope = 'current_meeting' } = params as { reference_text: string; scope?: string; };
    
    const searchMeetingId = scope === 'current_meeting' ? this.meetingId : undefined;
    
    const results = await ragService.semanticSearch(reference_text, searchMeetingId, {
      limit: 10,
      threshold: 0.6
    });

    return {
      success: true,
      data: {
        reference_text,
        scope,
        similar_discussions: results.map(r => ({
          content: r.content,
          type: r.content_type,
          meeting_id: r.meeting_id,
          similarity: r.similarity,
          created_at: r.created_at
        }))
      }
    };
  }

  // Build context for AI conversations
  async buildConversationContext(userMessage: string): Promise<string> {
    try {
      // Get relevant context using RAG
      const context = await ragService.buildAIContext(userMessage, undefined, 1500);
      
      // Add tool information
      const toolsInfo = this.getAvailableTools()
        .map(tool => `- ${tool.name}: ${tool.description}`)
        .join('\n');

      return `${context}

Available Tools:
${toolsInfo}

You can use these tools to search and retrieve specific information from the meeting knowledge base. When users ask questions about the meeting, use the appropriate tools to provide accurate, contextual responses.`;
    } catch (error) {
      console.error('Error building conversation context:', error);
      return `Meeting Context: Error retrieving context for "${userMessage}"`;
    }
  }
}

export const createAIToolsService = (meetingId: string, userId?: string) => new AIToolsService(meetingId, userId);
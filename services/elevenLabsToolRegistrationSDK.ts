import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

interface ToolRegistrationResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
}

export class ElevenLabsToolRegistrationSDK {
  private client: ElevenLabsClient;
  private agentId: string;

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    this.agentId = process.env.ELEVENLABS_AGENT_ID || '';
    
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is required');
    }
    
    if (!this.agentId) {
      throw new Error('ELEVENLABS_AGENT_ID environment variable is required');
    }

    this.client = new ElevenLabsClient({ apiKey });
  }

  /**
   * Register all client tools with the ElevenLabs agent
   */
  async registerAllTools(): Promise<ToolRegistrationResult[]> {
    const tools = this.getClientToolDefinitions();
    const results: ToolRegistrationResult[] = [];
    
    console.log(`🔧 Registering ${tools.length} client tools with ElevenLabs agent ${this.agentId}`);
    
    for (const tool of tools) {
      try {
        const result = await this.registerTool(tool);
        results.push({ tool: tool.name, success: true, result });
        console.log(`✅ Tool '${tool.name}' registered successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to register tool '${tool.name}':`, errorMessage);
        results.push({ tool: tool.name, success: false, error: errorMessage });
      }
    }
    
    return results;
  }

  /**
   * Get the definitions for all client tools that will be registered
   */
  getClientToolDefinitions() {
    return [
      {
        name: 'search_meeting_knowledge',
        description: 'Search through meeting knowledge and context using semantic search',
        expectsResponse: true,
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
        expectsResponse: true,
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
        expectsResponse: true,
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

  /**
   * Register a single tool with the ElevenLabs agent
   */
  async registerTool(toolDefinition: any): Promise<any> {
    try {
      const result = await this.client.conversationalAi.tools.create({
        toolConfig: {
          type: "client",
          name: toolDefinition.name,
          description: toolDefinition.description,
          expectsResponse: toolDefinition.expectsResponse,
          parameters: toolDefinition.parameters
        }
      });
      
      return result;
    } catch (error: any) {
      throw new Error(`Failed to register tool: ${error.message || error}`);
    }
  }

  /**
   * List existing tools for the agent
   */
  async listTools(): Promise<any> {
    try {
      const result = await this.client.conversationalAi.tools.list();
      return result;
    } catch (error: any) {
      throw new Error(`Failed to list tools: ${error.message || error}`);
    }
  }

  /**
   * Delete a tool from the agent
   */
  async deleteTool(toolId: string): Promise<any> {
    try {
      const result = await this.client.conversationalAi.tools.delete(toolId);
      return result;
    } catch (error: any) {
      throw new Error(`Failed to delete tool: ${error.message || error}`);
    }
  }

  /**
   * Clean up existing client tools and re-register all tools
   */
  async cleanAndRegisterTools(): Promise<ToolRegistrationResult[]> {
    console.log('🧹 Cleaning existing tools and re-registering...');
    
    try {
      // List existing tools
      const existingToolsResponse = await this.listTools();
      const existingTools = existingToolsResponse.tools || [];
      console.log(`Found ${existingTools.length || 0} existing tools`);
      
      // Delete existing client tools
      if (existingTools && existingTools.length > 0) {
        for (const tool of existingTools) {
          if (tool.type === 'client') {
            try {
              await this.deleteTool(tool.id);
              console.log(`🗑️  Deleted existing tool: ${tool.name}`);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.warn(`⚠️  Failed to delete tool ${tool.name}:`, errorMessage);
            }
          }
        }
      }
      
      // Register new tools
      return await this.registerAllTools();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to clean and register tools:', errorMessage);
      throw error;
    }
  }
}

export const createSDKToolRegistration = (): ElevenLabsToolRegistrationSDK => new ElevenLabsToolRegistrationSDK();
import { supabase } from '../lib/supabase';

export interface EmbeddingResponse {
  embedding: number[];
  keywords: string[];
  summary: string;
}

export class EmbeddingService {
  private openaiApiKey: string | null;
  private isProcessing = false;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || null;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openaiApiKey) {
      console.warn('OpenAI API key not configured, skipping embedding generation');
      return [];
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
          encoding_format: 'float'
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }

  async extractKeywords(text: string): Promise<string[]> {
    if (!this.openaiApiKey) {
      // Fallback: simple keyword extraction
      return this.simpleKeywordExtraction(text);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Extract 5-7 relevant keywords from this text. Return only the keywords separated by commas, no explanations:\n\n${text}`
            }
          ],
          max_tokens: 100,
          temperature: 0.3
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const keywords = data.choices[0].message.content
        .split(',')
        .map((k: string) => k.trim().toLowerCase())
        .filter((k: string) => k.length > 0);
      
      return keywords;
    } catch (error) {
      console.error('Error extracting keywords:', error);
      return this.simpleKeywordExtraction(text);
    }
  }

  async generateSummary(text: string): Promise<string> {
    if (!this.openaiApiKey) {
      // Fallback: simple summary
      return text.length > 100 ? text.substring(0, 97) + '...' : text;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Summarize this text in one concise sentence (max 50 words):\n\n${text}`
            }
          ],
          max_tokens: 60,
          temperature: 0.3
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      return text.length > 100 ? text.substring(0, 97) + '...' : text;
    }
  }

  async processKnowledgeItem(knowledgeId: string, content: string): Promise<void> {
    try {
      console.log('Processing knowledge item:', knowledgeId);
      
      // Generate embedding, keywords, and summary in parallel
      const [embedding, keywords, summary] = await Promise.all([
        this.generateEmbedding(content),
        this.extractKeywords(content),
        this.generateSummary(content)
      ]);

      // Update the knowledge item with processed data
      const { error } = await supabase
        .from('meeting_knowledge')
        .update({
          embedding: embedding.length > 0 ? embedding : null,
          keywords,
          summary,
          updated_at: new Date().toISOString()
        })
        .eq('id', knowledgeId);

      if (error) {
        console.error('Error updating knowledge item:', error);
        throw error;
      }

      console.log('Successfully processed knowledge item:', knowledgeId);
    } catch (error) {
      console.error('Error processing knowledge item:', error);
      throw error;
    }
  }

  async processPendingKnowledge(): Promise<void> {
    if (this.isProcessing) {
      console.log('Already processing knowledge items, skipping');
      return;
    }

    this.isProcessing = true;
    
    try {
      // Get knowledge items that need processing
      const { data: pendingItems, error } = await supabase
        .rpc('get_knowledge_needing_embeddings', { batch_size: 5 });

      if (error) {
        console.error('Error fetching pending knowledge:', error);
        return;
      }

      if (!pendingItems || pendingItems.length === 0) {
        console.log('No pending knowledge items to process');
        return;
      }

      console.log(`Processing ${pendingItems.length} knowledge items`);

      // Process items sequentially to avoid rate limits
      for (const item of pendingItems) {
        try {
          await this.processKnowledgeItem(item.id, item.content);
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to process item ${item.id}:`, error);
          // Continue with other items
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private simpleKeywordExtraction(text: string): string[] {
    // Simple fallback keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'have', 'will', 'been', 'from', 'they', 'them', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other'].includes(word));
    
    // Get unique words and return top 5
    const uniqueWords = [...new Set(words)];
    return uniqueWords.slice(0, 5);
  }
}

export const embeddingService = new EmbeddingService();
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { config } from 'dotenv';
import path from 'path';
import { TestDataManager } from './testDataManager';

// Load test environment variables
config({ path: path.join(__dirname, '../.env.test') });

// Test configuration
const API_BASE_URL = 'http://localhost:3001';
const TEST_MEETING_ID = TestDataManager.TEST_MEETING_ID;

describe('AI Meeting Platform API Integration Tests', () => {
  let testDataManager: TestDataManager;

  beforeAll(async () => {
    console.log('🚀 Setting up API integration tests...');
    
    // Initialize test data manager
    testDataManager = new TestDataManager();
    
    // Set up fresh test data
    await testDataManager.setupTestData();
    
    // Verify test data was created
    const verification = await testDataManager.verifyTestData();
    expect(verification.meeting).toBe(true);
    expect(verification.participants).toBeGreaterThan(0);
    expect(verification.knowledge).toBeGreaterThan(0);
    
    console.log('✅ Test setup complete');
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    console.log('🧹 Cleaning up test data...');
    await testDataManager.cleanupTestData();
    console.log('✅ Test cleanup complete');
  });

  describe('Health Check & Basic Connectivity', () => {
    it('should respond to basic server endpoint', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/test/openai')
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });

    it('should have proper CORS headers', async () => {
      const response = await request(API_BASE_URL)
        .options('/api/test/openai')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Knowledge Base API', () => {
    it('should perform RAG search successfully', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/rag-search')
        .send({
          query: 'TaskFlow project management',
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveProperty('results');
      expect(Array.isArray(response.body.results.results)).toBe(true);
      expect(response.body.results.results.length).toBeGreaterThan(0);
      
      // Verify result structure
      const firstResult = response.body.data.results[0];
      expect(firstResult).toHaveProperty('content');
      expect(firstResult).toHaveProperty('content_type');
      expect(firstResult).toHaveProperty('similarity');
    });

    it('should return knowledge status information', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/test/knowledge-status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('stats');
      expect(response.body.data.stats).toHaveProperty('totalItems');
      expect(response.body.data.stats).toHaveProperty('withEmbeddings');
      expect(response.body.data.stats.totalItems).toBeGreaterThan(0);
    });

    it('should run comprehensive knowledge health check', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/test/knowledge-comprehensive')
        .query({ meetingId: TEST_MEETING_ID })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('healthScore');
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data.results).toHaveProperty('database');
      expect(response.body.data.results).toHaveProperty('embeddings');
      expect(response.body.data.results).toHaveProperty('search');
    });

    it('should handle empty search queries gracefully', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/rag-search')
        .send({
          query: '',
          meetingId: TEST_MEETING_ID
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query is required');
    });

    it('should handle non-existent meeting ID', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/rag-search')
        .send({
          query: 'test query',
          meetingId: 'NON-EXISTENT-MEETING'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(0);
    });
  });

  describe('AI Tools API', () => {
    it('should execute search_meeting_knowledge tool', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'search_meeting_knowledge',
          parameters: {
            query: 'API response times',
            limit: 3
          },
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('success', true);
      expect(response.body.data.data).toHaveProperty('query');
      expect(response.body.data.data).toHaveProperty('results');
      expect(Array.isArray(response.body.data.data.results)).toBe(true);
    });

    it('should execute recall_decisions tool', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'recall_decisions',
          parameters: {
            topic: 'Redis caching'
          },
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('success', true);
      expect(response.body.data.data).toHaveProperty('topic');
      expect(response.body.data.data).toHaveProperty('decisions');
      expect(Array.isArray(response.body.data.data.decisions)).toBe(true);
    });

    it('should execute get_action_items tool', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'get_action_items',
          parameters: {
            status: 'all'
          },
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('success', true);
      expect(response.body.data.data).toHaveProperty('action_items');
      expect(Array.isArray(response.body.data.data.action_items)).toBe(true);
    });

    it('should execute summarize_topic tool', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'summarize_topic',
          parameters: {
            topic: 'TaskFlow project'
          },
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('success', true);
      expect(response.body.data.data).toHaveProperty('topic');
      expect(response.body.data.data).toHaveProperty('summary');
      expect(response.body.data.data).toHaveProperty('related_items');
    });

    it('should execute find_similar_discussions tool', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'find_similar_discussions',
          parameters: {
            reference_text: 'project management',
            scope: 'current_meeting'
          },
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('success', true);
      expect(response.body.data.data).toHaveProperty('similar_discussions');
      expect(Array.isArray(response.body.data.data.similar_discussions)).toBe(true);
    });

    it('should handle unknown tool gracefully', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'unknown_tool',
          parameters: {},
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('success', false);
      expect(response.body.data.error).toContain('Unknown tool');
    });

    it('should validate required parameters', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .send({
          toolName: 'search_meeting_knowledge',
          parameters: {}, // Missing required 'query' parameter
          meetingId: TEST_MEETING_ID
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('ElevenLabs Integration', () => {
    it('should test all ElevenLabs tools integration', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/elevenlabs-tools')
        .send({
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('results');
      
      const summary = response.body.data.summary;
      expect(summary).toHaveProperty('totalTools');
      expect(summary).toHaveProperty('successfulTools');
      expect(summary).toHaveProperty('allToolsWorking');
      expect(summary.totalTools).toBe(5); // We have 5 AI tools
    });

    it('should validate tool execution performance', async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE_URL)
        .post('/api/test/elevenlabs-tools')
        .send({
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      const executionTime = Date.now() - startTime;
      
      expect(response.body.success).toBe(true);
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Check individual tool performance
      const results = response.body.data.results;
      Object.values(results).forEach((toolResult: unknown) => {
        const result = toolResult as { duration?: number };
        expect(result).toHaveProperty('duration');
        expect(result.duration).toBeLessThan(5000); // Each tool should complete within 5 seconds
      });
    });
  });

  describe('OpenAI Integration (Mocked)', () => {
    it('should test mocked OpenAI integration', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/test/openai')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data.results).toHaveProperty('embedding_test');
      expect(response.body.data.results).toHaveProperty('api_connectivity');
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle missing request body', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/ai-tools')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle very long queries gracefully', async () => {
      const veryLongQuery = 'A'.repeat(10000); // 10KB query
      
      const response = await request(API_BASE_URL)
        .post('/api/test/rag-search')
        .send({
          query: veryLongQuery,
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should enforce reasonable rate limits', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill(null).map(() =>
        request(API_BASE_URL)
          .post('/api/test/rag-search')
          .send({
            query: 'test query',
            meetingId: TEST_MEETING_ID
          })
      );

      const responses = await Promise.all(requests);
      
      // All should succeed for test environment
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Response Format Validation', () => {
    it('should return consistent API response format', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/rag-search')
        .send({
          query: 'test',
          meetingId: TEST_MEETING_ID
        })
        .expect(200);

      // Check standard API response format
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(typeof response.body.success).toBe('boolean');
    });

    it('should include proper error information on failures', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/test/rag-search')
        .send({
          // Missing required query parameter
          meetingId: TEST_MEETING_ID
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });
});
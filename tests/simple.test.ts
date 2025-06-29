import { describe, it, expect } from 'vitest';
import request from 'supertest';

const API_BASE_URL = 'http://localhost:3001';

describe('Simple API Tests', () => {
  it('should connect to server', async () => {
    const response = await request(API_BASE_URL)
      .get('/api/test/openai');

    console.log('Response status:', response.status);
    console.log('Response body:', response.body);
    
    expect(response.status).toBe(200);
  });

  it('should test rag search endpoint structure', async () => {
    const response = await request(API_BASE_URL)
      .post('/api/test/rag-search')
      .send({
        query: 'test',
        meetingId: 'TASKFLOW-DEMO'
      });

    console.log('RAG Search status:', response.status);
    console.log('RAG Search body:', response.body);
  });
});
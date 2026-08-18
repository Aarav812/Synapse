const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server.js');

describe('API Routes', () => {
  it('should return 404 and error message for undefined API routes', async () => {
    const response = await request(app).get('/api/invalid');
    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(response.body, { error: 'API route not found' });
  });

  after(() => {
    // Force process exit to avoid hanging tests (e.g. from open connections/rate limit intervals)
    process.exit(0);
  });
});

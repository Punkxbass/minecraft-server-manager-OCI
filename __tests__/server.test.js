const request = require('supertest');
const app = require('../server');

describe('GET /api/get-guide', () => {
  test('returns guide content', async () => {
    const res = await request(app).get('/api/get-guide').query({ file: 'guia_vps_oci.md' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.content).toContain('<h1');
  });

  test('rejects invalid file', async () => {
    const res = await request(app).get('/api/get-guide').query({ file: 'invalid.md' });
    expect(res.status).toBe(400);
  });
});

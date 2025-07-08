// Simple test for mock API
describe('Mock API', () => {
  test('API works', async () => {
    const response = await fetch('/api/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: [{ text: 'hello' }] }]
      })
    });
    
    expect(response.ok).toBe(true);
  });
});
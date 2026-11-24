import http from 'http';

// Minimal OpenAI-compatible mock. For any chat completion request, returns a fixed table
// derived from the user prompt so we can verify the extraction plumbing end-to-end.
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404); res.end(); return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const payload = JSON.parse(body);
    const userMsg = payload.messages?.find((m) => m.role === 'user')?.content ?? '';
    const pageMatch = userMsg.match(/Page number: (\d+)/);
    const page = pageMatch ? Number(pageMatch[1]) : 1;
    const content = JSON.stringify({
      tables: [{
        headers: ['MockHeader1', 'MockHeader2'],
        rows: [['mock-a', 'mock-b'], ['mock-c', 'mock-d']],
        confidence: 0.85,
      }],
    });
    console.log(`mock call: model=${payload.model} page=${page} promptChars=${userMsg.length}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'mock',
      choices: [{ message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }));
  });
});

server.listen(4099, '127.0.0.1', () => console.log('Mock LLM on http://127.0.0.1:4099/v1'));

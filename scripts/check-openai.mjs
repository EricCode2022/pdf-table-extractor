import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (name) => env.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim();
const key = get('LLM_API_KEY');
const base = get('LLM_BASE_URL') ?? 'https://api.openai.com/v1';
const model = get('LLM_MODEL') ?? 'gpt-4o-mini';

if (!key || key.startsWith('sk-在这里')) {
  console.log('KEY_NOT_CONFIGURED');
  process.exit(0);
}
console.log(`key prefix: ${key.slice(0, 6)}...${key.slice(-4)} (len=${key.length})`);
console.log(`base: ${base}`);
console.log(`model: ${model}`);

const started = Date.now();
try {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 10,
    }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status} in ${Date.now() - started}ms`);
  console.log('body:', text.slice(0, 500));
} catch (e) {
  console.log(`NETWORK_ERROR: ${e.message}`);
  console.log('This usually means api.openai.com is unreachable from this machine.');
}

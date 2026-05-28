/* 模型列表(来自 UserHooks.models.keys() 的模拟) */
window.NX = window.NX || {};
NX.models = [
  { key: 'deepseek-local', status: 'ok',   lastUsed: '2 分钟前', avgMs: 8200,  p95Ms: 23400, note: '本地 DeepSeek-V3 7B' },
  { key: 'qwen-local',     status: 'ok',   lastUsed: '12 分钟前', avgMs: 11800, p95Ms: 31200, note: '本地 Qwen2.5-7B-Instruct' },
  { key: 'llama-local',    status: 'fail', lastUsed: '昨天',     avgMs: 0,     p95Ms: 0,     note: '当前 endpoint 不可达' },
  { key: 'gpt-fast',       status: 'idle', lastUsed: '从未',     avgMs: 0,     p95Ms: 0,     note: '占位:未调用过' },
];

import { z } from 'zod';
import { decisionSchema, normalizeDecision } from './decision-config.mjs';
export { decisionPresets } from './decision-config.mjs';

export const providerPresets = {
  openai: { baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  xai: { baseUrl: 'https://api.x.ai/v1', apiKeyEnv: 'XAI_API_KEY' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY' },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', apiKeyEnv: null, local: true },
  lmstudio: { baseUrl: 'http://127.0.0.1:1234/v1', apiKeyEnv: null, local: true },
  'openai-compatible': { baseUrl: '', apiKeyEnv: 'SCAPE_MODEL_API_KEY' },
};
const text = (max) => z.string().min(1).max(max).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const schema = z.object({
  name: text(24),
  instructions: z.string().max(8000).default('Be a friendly world companion. Respond when addressed, respect requests for space, and use the handbook when explaining the world.'),
  avatar: z.object({ kind: z.enum(['emoji','image','glb','catalog']).default('emoji'),
    emoji: text(16).default('🤖'), asset: text(110).optional(), preset: text(64).optional() }).strict().default({kind:'emoji',emoji:'🤖'}),
  provider: z.object({ type: z.enum(Object.keys(providerPresets)),
    model: text(200), baseUrl: z.string().optional(), apiKeyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).nullable().optional(),
  }).strict().optional(),
  policy: z.string().min(1).optional(),
  decision: decisionSchema.optional(),
  memory: z.object({enabled:z.boolean().default(true)}).strict().prefault({}),
  behavior: z.object({
    enabled: z.boolean().default(true),
    explore: z.boolean().default(true),
    expressions: z.boolean().default(true),
    checkReplies: z.boolean().default(true),
    idleMs: z.number().int().min(10000).max(300000).default(30000),
    spaceDistance: z.number().int().min(2).max(16).default(12),
    quietMs: z.number().int().min(10000).max(600000).default(120000),
    greetingCooldownMs: z.number().int().min(60000).max(86400000).default(86400000),
    sleepAfterMs: z.number().int().min(10000).max(300000).default(30000),
    wakeIntervalMs: z.number().int().min(1000).max(60000).default(5000),
  }).strict().prefault({}),
  limits: z.object({
    turnTimeoutMs: z.number().int().min(1000).max(300000).default(60000),
    maxToolRounds: z.number().int().min(1).max(20).default(8),
    maxOutputTokens: z.number().int().min(128).max(16384).default(2048),
    historyTurns: z.number().int().min(0).max(20).default(4),
    maxModelCalls: z.number().int().min(1).max(100000).default(200),
    minTurnIntervalMs: z.number().int().min(500).max(60000).default(5000),
  }).strict().prefault({}),
}).strict();

export function validateEndpoint(value, originOnly = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use a valid provider URL or Scape origin.'); }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash
    || (originOnly && url.pathname !== '/')) throw new Error('Use HTTPS (or loopback HTTP), without credentials, query or fragment; Scape origins cannot include a path.');
  return url.href.replace(/\/$/, '');
}

export function parseAgentConfig(value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid scape.agent.json fields: ${parsed.error.issues.map(issue=>issue.path.join('.') || 'root').join(', ')}. Check the agent configuration guide.`);
  const config = parsed.data;
  if (config.decision) {
    if (config.policy || !config.behavior.enabled) throw new Error('The built-in decision model requires shared world behavior and no custom policy. Custom policies can use the decision adapter API directly.');
    normalizeDecision(config.decision, validateEndpoint);
  }
  if (!config.policy && !config.provider) throw new Error('Set provider and model, or a custom policy, in scape.agent.json.');
  if (config.avatar.kind === 'catalog' && !config.avatar.preset || ['image','glb'].includes(config.avatar.kind) && !config.avatar.asset) throw new Error('Set avatar.preset for catalog artwork or avatar.asset for image/GLB files.');
  if (config.provider) {
    const defaults = providerPresets[config.provider.type];
    config.provider.baseUrl = validateEndpoint(config.provider.baseUrl ?? defaults.baseUrl);
    if (defaults.local) config.provider.baseUrl = validateLocalEndpoint(config.provider.baseUrl);
    else if (config.provider.type !== 'openai-compatible' && config.provider.baseUrl !== defaults.baseUrl) throw new Error('Named providers use their official endpoint. Choose openai-compatible for a custom server.');
    config.provider.apiKeyEnv = config.provider.apiKeyEnv === undefined ? defaults.apiKeyEnv : config.provider.apiKeyEnv;
    if (['SCAPE_AGENT_TOKEN','SCAPE_AGENT_ASSET_DIR'].includes(config.provider.apiKeyEnv)) throw new Error('Use a dedicated provider key variable, not a Scape access variable.');
  }
  return config;
}

export function validateLocalEndpoint(value) {
  const url = new URL(validateEndpoint(value));
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) throw new Error('Local model presets connect only to this computer. Use openai-compatible with HTTPS for a remote server.');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  if (url.pathname !== '/v1') throw new Error('Use the local model server URL ending in /v1.');
  return url.href.replace(/\/$/, '');
}

import { z } from 'zod';

export const decisionPresets = {
  typesafe: { baseUrl: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', apiKeyEnv: 'TYPESAFE_API_KEY' },
  cloudflare: { baseUrl: 'https://api.cloudflare.com/client/v4/accounts', model: 'clef-flash', apiKeyEnv: 'CLOUDFLARE_API_TOKEN' },
  'system-one': { baseUrl: '', model: '', apiKeyEnv: 'SCAPE_DECISION_API_KEY' },
  'openai-compatible': { baseUrl: '', model: '', apiKeyEnv: 'SCAPE_DECISION_API_KEY' },
  custom: { apiKeyEnv: null },
};
export const decisionSchema = z.object({
  type: z.enum(Object.keys(decisionPresets)),
  model: z.string().min(1).max(200).regex(/^[^\p{Cc}\p{Cf}]+$/u).optional(),
  baseUrl: z.string().optional(),
  apiKeyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).nullable().optional(),
  accountId: z.string().regex(/^[a-fA-F0-9]{32}$/).optional(),
  adapter: z.string().min(1).max(4096).optional(),
  timeoutMs: z.number().int().min(250).max(30000).default(5000),
  maxRequests: z.number().int().min(1).max(100000).default(500),
  minIntervalMs: z.number().int().min(250).max(60000).default(1000),
}).strict();

export function normalizeDecision(config, validateEndpoint) {
  const defaults = decisionPresets[config.type];
  if (config.apiKeyEnv === undefined) config.apiKeyEnv = defaults.apiKeyEnv;
  if (config.apiKeyEnv?.startsWith('SCAPE_AGENT_')) throw new Error('Use a dedicated decision key variable, not a Scape access variable.');
  if (config.type === 'custom') {
    if (!config.adapter || /^[a-z][a-z\d+.-]*:/i.test(config.adapter)) throw new Error('Set decision.adapter to a trusted local JavaScript file.');
    if (config.baseUrl) config.baseUrl = validateEndpoint(config.baseUrl);
    return config;
  }
  if (config.adapter) throw new Error('decision.adapter requires the custom decision type.');
  config.model ??= defaults.model;
  if (!config.model) throw new Error('Set decision.model to a model supported by your endpoint.');
  config.baseUrl = validateEndpoint(config.baseUrl ?? defaults.baseUrl);
  if (['typesafe','cloudflare'].includes(config.type) && config.baseUrl !== defaults.baseUrl) throw new Error('Named decision providers use their official endpoint. Choose system-one for a custom server.');
  if (config.type === 'cloudflare') {
    if (!config.accountId) throw new Error('Set decision.accountId to your Cloudflare account ID.');
    if (!['clef','clef-flash'].includes(config.model)) throw new Error('Choose clef or clef-flash for the Cloudflare decision preset.');
  } else if (config.accountId) throw new Error('decision.accountId is only used by Cloudflare.');
  return config;
}

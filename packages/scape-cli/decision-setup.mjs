import path from 'node:path';
import { stat } from 'node:fs/promises';
import { decisionPresets, validateEndpoint } from '@scape-wtf/agent-mcp/runner';

const options = [
  { value: 'none', label: 'None · use shared rules and your conversation model' },
  { value: 'cloudflare', label: 'Cloudflare · Clef / Clef-flash' },
  { value: 'typesafe', label: 'TypeSafe · JEV' },
  { value: 'system-one', label: 'Another System One-compatible endpoint' },
  { value: 'openai-compatible', label: 'Structured-output model · Chat Completions endpoint' },
  { value: 'custom', label: 'Custom adapter · trusted local JavaScript file' },
];
const modelId = v => {
  if (!v || v.length > 200 || /[\p{Cc}\p{Cf}]/u.test(v))
    throw new Error('Use a model ID up to 200 characters without control characters.');
};
export async function configureDecision({ previous, ui, env = process.env, signal }) {
  const old = previous?.config.decision;
  const type = await ui.choose('Decision model', options, old?.type ?? 'none');
  if (type === 'none') return {};
  const preset = decisionPresets[type],
    sameType = old?.type === type;
  ui.line(
    'Decides attention and simple actions. Your conversation model still writes replies.',
    'muted',
  );
  let baseUrl = preset.baseUrl,
    model = preset.model,
    accountId,
    adapter;
  if (type === 'cloudflare') {
    accountId = await ui.ask('Cloudflare account ID', {
      value: sameType ? old.accountId : '',
      validate: v => {
        if (!/^[a-fA-F0-9]{32}$/.test(v))
          throw new Error('Use the 32-character account ID from your Cloudflare dashboard.');
      },
    });
    model = await ui.choose(
      'Cloudflare decision model',
      [
        { value: 'clef-flash', label: 'Clef-flash' },
        { value: 'clef', label: 'Clef' },
      ],
      sameType ? old.model : 'clef-flash',
    );
    ui.line('Use a token limited to Workers AI access for this account.', 'muted');
  } else if (type === 'custom') {
    ui.line(
      'This runs your chosen file with your user permissions. Only load code you trust.',
      'muted',
    );
    adapter = path.resolve(
      await ui.ask('Decision adapter file', {
        value: sameType ? old.adapter : '',
        validate: async v => {
          try {
            if (!/\.(mjs|js)$/.test(v) || !(await stat(path.resolve(v))).isFile())
              throw new Error();
          } catch {
            throw new Error('Choose a readable local .mjs or .js adapter file.');
          }
        },
      }),
    );
    model =
      (await ui.ask('Decision model ID (optional)', {
        value: sameType ? old.model : '',
        required: false,
        validate: v => {
          if (v) modelId(v);
        },
      })) || undefined;
    baseUrl =
      (await ui.ask('Decision endpoint (optional)', {
        value: sameType ? old.baseUrl : '',
        required: false,
        validate: v => {
          if (v) validateEndpoint(v);
        },
      })) || undefined;
    if (baseUrl) baseUrl = validateEndpoint(baseUrl);
  } else {
    if (type !== 'typesafe')
      baseUrl = validateEndpoint(
        await ui.ask(
          type === 'system-one'
            ? 'Decision API URL (full endpoint)'
            : 'Decision API base URL (without /chat/completions)',
          { value: sameType ? old.baseUrl : '', validate: validateEndpoint },
        ),
      );
    model = await ui.ask('Decision model ID', {
      value: sameType ? old.model : model,
      validate: modelId,
    });
  }
  const sameProvider =
    sameType && old.baseUrl === baseUrl && old.accountId === accountId && old.adapter === adapter;
  const savedKey = sameProvider ? previous.decisionKey : undefined;
  let apiKeyEnv = sameProvider ? old.apiKeyEnv : preset.apiKeyEnv,
    decisionKey;
  if (type === 'custom')
    apiKeyEnv =
      (await ui.ask('Decision key environment variable (optional)', {
        value: apiKeyEnv ?? '',
        required: false,
        validate: v => {
          if (v && !/^[A-Z_][A-Z0-9_]*$/.test(v))
            throw new Error('Use an uppercase environment variable name.');
        },
      })) || null;
  const keyOptions = [
    {
      value: 'enter',
      label: savedKey ? 'Keep or replace saved decision key' : 'Enter decision API key (hidden)',
    },
  ];
  if (apiKeyEnv && env[apiKeyEnv])
    keyOptions.push({ value: 'env', label: `Use ${apiKeyEnv} from the environment` });
  if (!['typesafe', 'cloudflare'].includes(type))
    keyOptions.push({ value: 'none', label: 'No authentication required' });
  const credentials = await ui.choose(
    'Decision credentials',
    keyOptions,
    savedKey
      ? 'enter'
      : apiKeyEnv && env[apiKeyEnv]
        ? 'env'
        : (sameProvider && old.apiKeyEnv === null) || (type === 'custom' && !apiKeyEnv)
          ? 'none'
          : 'enter',
  );
  if (credentials === 'none') apiKeyEnv = null;
  else if (credentials === 'enter') {
    apiKeyEnv ??= 'SCAPE_DECISION_API_KEY';
    ui.line(
      'Saved only on this computer with owner-only permissions; not encrypted at rest. Never included in world tools or prompts.',
      'muted',
    );
    decisionKey =
      (await ui.ask(
        savedKey ? 'Decision API key (hidden; Enter keeps saved key)' : 'Decision API key (hidden)',
        {
          secret: true,
          required: !savedKey,
          validate: v => {
            if (/[\s\p{Cc}\p{Cf}]/u.test(v) || v.length > 16384)
              throw new Error(
                'Enter the key without spaces or control characters, up to 16,384 characters.',
              );
          },
        },
      )) || savedKey;
  }
  const maxRequests = Number(
    await ui.ask('Maximum decision requests per run', {
      value: String(old?.maxRequests ?? 500),
      validate: v => {
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100000)
          throw new Error('Choose a whole number from 1 to 100000.');
      },
    }),
  );
  ui.line(
    'Decision requests have their own usage cost and limit. On failure or exhaustion, basic world behavior continues for this run.',
    'muted',
  );
  signal?.throwIfAborted();
  return {
    decision: {
      type,
      model,
      baseUrl,
      apiKeyEnv,
      ...(accountId ? { accountId } : {}),
      ...(adapter ? { adapter } : {}),
      maxRequests,
      ...(old ? { timeoutMs: old.timeoutMs, minIntervalMs: old.minIntervalMs } : {}),
    },
    decisionKey,
  };
}

import { providerPresets, validateEndpoint } from '@scape-wtf/agent-mcp/runner';
import { listLocalModels, validateLocalEndpoint } from '@scape-wtf/agent-mcp/providers';
import { Cancelled } from './terminal.mjs';

const providers = [
  { value: 'openai', label: 'OpenAI (API key)' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'xai', label: 'xAI · Grok (API key)' },
  { value: 'gemini', label: 'Google Gemini (API key)' },
  { value: 'ollama', label: 'Ollama · on this computer' },
  { value: 'lmstudio', label: 'LM Studio · on this computer' },
  { value: 'openai-compatible', label: 'Another OpenAI-compatible endpoint' },
];

export async function configureProvider({ previous, ui, env = process.env, signal, fetchImpl }) {
  const type = await ui.choose('Model provider', providers, previous?.config.provider?.type);
  const defaults = providerPresets[type];
  const sameType = previous?.config.provider?.type === type;
  let baseUrl = defaults.baseUrl;
  if (defaults.local || type === 'openai-compatible') {
    const validate = defaults.local ? validateLocalEndpoint : validateEndpoint;
    baseUrl = validate(
      await ui.ask('API base URL', {
        value: sameType ? previous.config.provider.baseUrl : baseUrl,
        validate,
      }),
    );
  }
  const sameProvider = sameType && previous.config.provider.baseUrl === baseUrl;
  const savedKey = sameProvider ? previous.providerKey : undefined;
  let providerKey,
    apiKeyEnv = defaults.local ? 'SCAPE_LOCAL_MODEL_KEY' : defaults.apiKeyEnv;
  const keyOptions = [];
  if (defaults.local)
    keyOptions.push({ value: 'none', label: 'No authentication (local server default)' });
  keyOptions.push({
    value: 'enter',
    label: savedKey ? 'Keep or replace saved API key' : 'Enter API key (hidden)',
  });
  if (env[apiKeyEnv])
    keyOptions.push({ value: 'env', label: `Use ${apiKeyEnv} from the environment` });
  if (type === 'openai-compatible')
    keyOptions.push({
      value: 'none',
      label: 'No authentication (my endpoint does not require a key)',
    });
  const keyChoice = await ui.choose(
    'Provider credentials',
    keyOptions,
    savedKey
      ? 'enter'
      : env[apiKeyEnv]
        ? 'env'
        : defaults.local || (sameProvider && previous.config.provider.apiKeyEnv === null)
          ? 'none'
          : 'enter',
  );
  if (keyChoice === 'none') apiKeyEnv = null;
  else if (keyChoice === 'enter') {
    ui.line('The key stays on this computer, outside model prompts and Scape tools.', 'muted');
    ui.line('Saved locally with owner-only file permissions; not encrypted at rest.', 'muted');
    const entered = await ui.ask(
      savedKey ? 'API key (hidden; Enter keeps saved key)' : 'API key (hidden)',
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
    );
    providerKey = entered || savedKey;
  }
  let model;
  if (defaults.local) {
    ui.line(
      type === 'ollama'
        ? 'Start Ollama and download a model that supports tools.'
        : 'Load a model that supports tools in LM Studio, then start its local server.',
      'muted',
    );
    ui.line(
      'Model discovery does not run inference. The model must support tool calling; being listed does not guarantee it.',
      'muted',
    );
    while (!model) {
      signal?.throwIfAborted();
      let models;
      try {
        ui.busy('Finding local models');
        models = await listLocalModels({
          type,
          baseUrl,
          apiKey: providerKey ?? (apiKeyEnv ? env[apiKeyEnv] : undefined),
          signal,
          fetchImpl,
        });
      } catch (error) {
        signal?.throwIfAborted();
        ui.line(error.message, 'warning');
      } finally {
        ui.clear();
      }
      if (models)
        model = await ui.choose(
          'Local model',
          models.map(value => ({ value, label: value })),
          sameProvider && models.includes(previous.config.provider.model)
            ? previous.config.provider.model
            : undefined,
        );
      else {
        const next = await ui.choose('Local server', [
          { value: 'retry', label: 'Retry after starting the server or loading a model' },
          { value: 'cancel', label: 'Cancel setup' },
        ]);
        if (next === 'cancel') throw new Cancelled();
      }
    }
  } else {
    model = await ui.ask('Tool-capable model ID', {
      value: sameType ? previous.config.provider.model : '',
      validate: v => {
        if (v.length > 200 || /[\p{Cc}\p{Cf}]/u.test(v))
          throw new Error('Use the model ID from your provider, up to 200 characters.');
      },
    });
  }
  signal?.throwIfAborted();
  return { provider: { type, baseUrl, model, apiKeyEnv }, providerKey };
}

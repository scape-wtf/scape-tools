import { validateLocalEndpoint, providerPresets } from './runner-config.mjs';
import { providerJSON } from './provider-http.mjs';
export { validateLocalEndpoint } from './runner-config.mjs';
export { providerJSON, readProviderJSON } from './provider-http.mjs';

export async function listLocalModels({ type, baseUrl, apiKey, signal, fetchImpl }) {
  if (!providerPresets[type]?.local)
    throw new Error('Choose Ollama or LM Studio for local discovery.');
  const endpoint = validateLocalEndpoint(baseUrl);
  const result = await providerJSON(endpoint + '/models', {
    signal,
    fetchImpl,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!Array.isArray(result?.data))
    throw new Error('The local server returned an invalid model list.');
  const models = [
    ...new Set(
      result.data
        .slice(0, 500)
        .map(item => item?.id)
        .filter(
          id =>
            typeof id === 'string' &&
            id.length > 0 &&
            id.length <= 200 &&
            !/[\p{Cc}\p{Cf}]/u.test(id),
        ),
    ),
  ];
  if (!models.length)
    throw new Error(
      type === 'ollama'
        ? 'No Ollama models found. Download a tool-capable model in Ollama, then retry.'
        : 'No LM Studio models found. Download and load a tool-capable model, then retry.',
    );
  return models;
}

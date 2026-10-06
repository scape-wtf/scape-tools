import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  parseAgentConfig,
  validateEndpoint,
  pairAgent,
  checkAgentAccess,
  runAgent,
} from '@scape-wtf/agent-mcp/runner';
import { configureProvider } from './provider-setup.mjs';
import { configureDecision } from './decision-setup.mjs';
import { terminal, Cancelled } from './terminal.mjs';
import {
  profileDirectory,
  readProfile,
  saveProfile,
  lockProfile,
  runningProfile,
} from './profile.mjs';

const defaultInstructions =
  'Be a friendly world companion. Respond when addressed, respect requests for space, and use the handbook when explaining the world.';

export async function configureProfile(options) {
  const { ui, directory } = options;
  const { profile, assetSource } = ui.wizard
    ? await ui.wizard(flow => collectProfile({ ...options, ui: flow }))
    : await collectProfile(options);
  options.signal?.throwIfAborted();
  if (assetSource) {
    const assets = path.join(directory, 'avatars');
    await mkdir(assets, { recursive: true, mode: 0o700 });
    await copyFile(assetSource, path.join(assets, profile.config.avatar.asset));
    profile.assetSource = assetSource;
    profile.assetDirectory = assets;
  }
  await saveProfile(directory, profile);
  ui.success('Settings saved. No project files or dependencies to manage.');
  return profile;
}

async function collectProfile({
  previous,
  directory,
  origin,
  ui,
  env = process.env,
  signal,
  fetchImpl,
}) {
  ui.step('01 / 03', 'Your agent');
  const name = await ui.ask('Name', {
    value: previous?.config.name || 'Scout',
    validate: v => {
      if (v.length > 24 || /[\p{Cc}\p{Cf}]/u.test(v))
        throw new Error('Use 1–24 characters without control characters.');
    },
  });
  const instructions = await ui.ask('Personality and instructions', {
    value: previous?.config.instructions || defaultInstructions,
    validate: v => {
      if (v.length > 8000) throw new Error('Keep instructions under 8,000 characters.');
    },
  });
  const previousBehavior = previous?.config.behavior;
  const style = await ui.choose(
    'World behavior',
    [
      { value: 'social', label: 'Social and curious · greet, explore and respond' },
      { value: 'stationary', label: 'Social, stay put · greet and respond' },
      { value: 'model', label: 'Model only · disable shared social behavior' },
    ],
    previousBehavior?.enabled === false
      ? 'model'
      : previousBehavior?.explore === false
        ? 'stationary'
        : 'social',
  );
  const behavior = { ...previousBehavior, enabled: style !== 'model', explore: style === 'social' };
  const memoryEnabled = await ui.choose(
    'Encounter memory',
    [
      { value: 'on', label: 'Remember encounters · on this computer, for 30 days' },
      { value: 'off', label: 'Temporary only · forget when this process ends' },
    ],
    previous?.config.memory?.enabled === false ? 'off' : 'on',
  );
  ui.line(
    'Remembers visits and greeting timing, never names or conversation transcripts. Shared behavior uses this memory.',
    'muted',
  );
  const kind = await ui.choose(
    'Appearance',
    [
      { value: 'emoji', label: 'Emoji' },
      { value: 'image', label: 'Custom image' },
      { value: 'glb', label: '3D file (static GLB)' },
    ],
    previous?.config.avatar.kind || 'emoji',
  );
  const emoji = await ui.ask(kind === 'emoji' ? 'Avatar emoji' : 'Fallback emoji', {
    value: previous?.config.avatar.emoji || '🤖',
    validate: v => {
      if (v.length > 16 || /[\p{Cc}\p{Cf}]/u.test(v))
        throw new Error('Use an emoji up to 16 characters.');
    },
  });
  let avatar = { kind, emoji },
    assetSource;
  if (kind !== 'emoji') {
    ui.line(
      'Choose a PNG, JPEG, WebP or static GLB up to 512 KiB. Scape validates the artwork when connecting.',
      'muted',
    );
    assetSource = await ui.ask('Avatar file', {
      value: previous?.assetSource || '',
      validate: async v => {
        const extension = path.extname(v).toLowerCase();
        if (
          !(kind === 'glb'
            ? extension === '.glb'
            : ['.png', '.jpg', '.jpeg', '.webp'].includes(extension))
        )
          throw new Error('Choose a file matching the selected appearance.');
        try {
          const info = await stat(path.resolve(v));
          if (!info.isFile() || info.size > 512 * 1024) throw new Error();
        } catch {
          throw new Error('Choose a readable file up to 512 KiB.');
        }
      },
    });
    assetSource = path.resolve(assetSource);
    avatar.asset = `avatar${path.extname(assetSource).toLowerCase()}`;
  }
  ui.step('02 / 03', 'Your models');
  const { provider, providerKey } = await configureProvider({
    previous,
    ui,
    env,
    signal,
    fetchImpl,
  });
  ui.line('Use 0 for unlimited conversation requests. Provider charges still apply.', 'muted');
  const maxModelCalls = Number(
    await ui.ask('Maximum model requests per run', {
      value: String(previous?.config.limits?.maxModelCalls ?? 200),
      validate: v => {
        if (!/^\d+$/.test(v) || Number(v) > 100000)
          throw new Error('Choose 0 for unlimited requests, or a whole number from 1 to 100000.');
      },
    }),
  );
  ui.line(
    ['ollama', 'lmstudio'].includes(provider.type)
      ? 'Your local model server handles inference. Each tool round can use another request.'
      : 'Your provider charges for model use. Each tool round can use another request.',
    'muted',
  );
  const { decision, decisionKey } = behavior.enabled
    ? await configureDecision({ previous, provider, providerKey, ui, env, signal })
    : {};
  ui.step('03 / 03', 'Your Scape connection');
  const gameOrigin = validateEndpoint(
    origin ||
      (await ui.ask('Scape URL', {
        value: previous?.origin || 'https://scape.wtf',
        validate: v => validateEndpoint(v, true),
      })),
    true,
  );
  const config = parseAgentConfig({
    name,
    instructions,
    avatar,
    provider,
    ...(decision ? { decision } : {}),
    behavior,
    memory: { enabled: memoryEnabled === 'on' },
    limits: { ...previous?.config.limits, maxModelCalls },
  });
  const grant =
    previous?.grant?.origin === gameOrigin && previous.grant.name === name
      ? previous.grant
      : undefined;
  const profile = {
    version: 1,
    origin: gameOrigin,
    config,
    ...(providerKey ? { providerKey } : {}),
    ...(decisionKey ? { decisionKey } : {}),
    ...(grant ? { grant } : {}),
  };
  ui.step('REVIEW', 'Ready to connect');
  ui.line(`Agent  ${name} · ${avatar.kind} avatar`);
  ui.line(
    `Behavior  ${style === 'model' ? 'Model only' : style === 'stationary' ? 'Social, stay put' : 'Social and curious'}`,
  );
  ui.line(`Conversation  ${provider.type} · ${provider.model}`);
  ui.line(
    `Decisions  ${decision ? `${decision.type} · ${decision.model || 'custom adapter'}` : 'Shared rules'}`,
  );
  ui.line(
    `Memory  ${config.memory.enabled && behavior.enabled ? 'Local encounters · 30 days' : 'Temporary only'}`,
  );
  ui.line(`Scape  ${gameOrigin}`);
  ui.line(
    `Request limits  ${maxModelCalls === 0 ? 'Unlimited' : maxModelCalls} conversation${decision ? ` · ${decision.maxRequests} decision` : ''}`,
    'muted',
  );
  ui.line(
    'Provider requests include private reply checks. API keys are never shown here.',
    'muted',
  );
  const action = await ui.choose(
    'Review settings',
    [
      { value: 'save', label: 'Save settings' },
      { value: 'identity', label: 'Change agent and appearance' },
      { value: 'models', label: 'Change models and request limits' },
      ...(!origin ? [{ value: 'connection', label: 'Change Scape connection' }] : []),
    ],
    'save',
  );
  if (action !== 'save')
    ui.jump?.({ identity: 'Name', models: 'Model provider', connection: 'Scape URL' }[action]);
  return { profile, assetSource };
}

async function ensureAccess(profile, directory, { ui, signal, force = false }) {
  if (
    !force &&
    profile.grant?.origin === profile.origin &&
    profile.grant.name === profile.config.name
  ) {
    ui.busy('Checking saved world access');
    const status = await checkAgentAccess({ origin: profile.origin, token: profile.grant.token });
    signal.throwIfAborted();
    ui.clear();
    if (status.approved) return profile;
    ui.line('Saved access has ended. Pair again to continue.', 'warning');
  }
  if (!ui.tty)
    throw new Error(
      'Pairing needs owner approval. Run scape agent login in an interactive terminal, then restart this command.',
    );
  ui.line('Pairing replaces your previous agent grant. Approve only the code shown here.', 'muted');
  ui.busy('Creating a pairing code');
  const access = await pairAgent({
    origin: profile.origin,
    name: profile.config.name,
    signal,
    onCode: pair => {
      ui.clear();
      ui.step('CONNECT', profile.config.name);
      if (ui.code) ui.code(pair.code);
      else ui.line(`Pairing code  ${pair.code}`, 'primary');
      ui.line(`Open ${profile.origin}`);
      ui.line('Settings → Developer → Agents → enter the code → choose your world.');
      ui.line('Select Connect agent. The code expires in five minutes.', 'muted');
      ui.busy('Waiting for your approval');
    },
  });
  profile = { ...profile, grant: { origin: profile.origin, name: profile.config.name, ...access } };
  await saveProfile(directory, profile);
  ui.success('World access saved. Next time, just run scape agent run.');
  return profile;
}

export async function managedAgent(
  command,
  { origin, ui = terminal(), directory = profileDirectory(), env = process.env } = {},
) {
  ui.heading(
    command === 'status'
      ? 'Agent status'
      : command === 'configure' || command === 'init'
        ? 'Make yourself at home.'
        : 'Persistent agents',
  );
  let release;
  const controller = new AbortController(),
    stop = () => {
      controller.abort();
      ui.cancel?.();
    };
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, stop);
  try {
    if (origin) origin = validateEndpoint(origin, true);
    if (command !== 'status') release = await lockProfile(directory);
    let profile = await readProfile(directory);
    if (command === 'status') {
      if (!profile) {
        ui.line('No agent configured. Start with scape agent run.');
        return;
      }
      const config = parseAgentConfig(profile.config);
      ui.line(
        `${config.name} · ${config.provider?.type || 'custom policy'} · ${config.provider?.model || ''}`,
      );
      ui.line(
        `Decisions  ${config.decision ? `${config.decision.type} · ${config.decision.model || 'custom adapter'}` : 'basic world behavior'}`,
      );
      if (config.decision)
        ui.line(
          `Decision key  ${profile.decisionKey ? 'saved locally' : config.decision.apiKeyEnv && env[config.decision.apiKeyEnv] ? 'available in environment' : config.decision.apiKeyEnv === null ? 'not required' : 'missing'}`,
        );
      ui.line(
        `Memory  ${config.memory.enabled && config.behavior.enabled ? 'Local encounters · 30 days' : 'Temporary only'} · scape agent memory list`,
      );
      ui.line(`Scape  ${profile.origin}`);
      ui.line(
        `Local process  ${(await runningProfile(directory)) ? 'active (running or configuring)' : 'stopped'}`,
      );
      ui.line(
        `Provider key  ${profile.providerKey ? 'saved locally' : config.provider?.apiKeyEnv && env[config.provider.apiKeyEnv] ? 'available in environment' : config.provider?.apiKeyEnv === null ? 'not required' : 'missing'}`,
      );
      if (profile.grant?.origin === profile.origin && profile.grant.name === config.name) {
        ui.busy('Checking world access');
        const access = await checkAgentAccess({
          origin: profile.origin,
          token: profile.grant.token,
        });
        ui.line(
          access.approved
            ? `World access  approved${access.room ? ` · ${access.room}` : ''}`
            : 'World access  expired or revoked; run scape agent login.',
        );
      } else ui.line('World access  not paired; run scape agent login.');
      ui.line('Status checks do not enter the world or call your model.', 'muted');
      return;
    }
    if (!profile || ['configure', 'init'].includes(command))
      profile = await configureProfile({
        previous: profile,
        directory,
        origin,
        ui,
        env,
        signal: controller.signal,
      });
    else if (origin && origin !== profile.origin) {
      // Never carry an existing bearer to a different origin.
      profile = { ...profile, origin, grant: undefined };
      await saveProfile(directory, profile);
    }
    controller.signal.throwIfAborted();
    if (['configure', 'init'].includes(command)) {
      ui.line('Start with scape agent run. Pairing happens before the agent enters.');
      return;
    }
    const config = parseAgentConfig(profile.config);
    const apiKey =
      profile.providerKey ??
      (config.provider?.apiKeyEnv ? env[config.provider.apiKeyEnv] : undefined);
    if (command === 'run' && config.provider?.apiKeyEnv && !apiKey)
      throw new Error(
        'The provider key is missing. Run scape agent configure or set its named environment variable.',
      );
    const decisionApiKey =
      profile.decisionKey ??
      (config.decision?.apiKeyEnv ? env[config.decision.apiKeyEnv] : undefined);
    if (command === 'run' && config.decision?.apiKeyEnv && !decisionApiKey)
      throw new Error(
        'The decision provider key is missing. Run scape agent configure or set its named environment variable.',
      );
    profile = await ensureAccess(profile, directory, {
      ui,
      signal: controller.signal,
      force: command === 'login',
    });
    if (command === 'login') return;
    await runAgent({
      origin: profile.origin,
      directory,
      config,
      apiKey,
      decisionApiKey,
      token: profile.grant.token,
      memoryDirectory: directory,
      assetDirectory: profile.assetDirectory,
      signal: controller.signal,
      log: text => ui.line(text),
      onState: state => {
        if (state === 'sleeping')
          ui.line('World is empty · sleeping until someone returns.', 'muted');
        else if (state === 'connecting') ui.busy('Entering your world');
        else if (state === 'thinking') ui.busy('Thinking · still listening to the world');
        else if (state === 'leaving') ui.busy('Leaving the world');
        else if (state === 'stopped')
          ui.line('Agent stopped. Run scape agent run to return.', 'muted');
        else ui.clear();
      },
    });
  } catch (error) {
    if (controller.signal.aborted || error instanceof Cancelled)
      ui.line('Stopped. Run scape agent run when you’re ready.');
    else throw error;
  } finally {
    ui.close();
    await release?.();
    for (const event of ['SIGINT', 'SIGTERM']) process.removeListener(event, stop);
  }
}

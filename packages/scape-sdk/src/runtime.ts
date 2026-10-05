import { validGizmoWorldEditor, validGizmoWorldDestination, resolveGizmoNavigation } from './navigation.js';
import { validGizmoLink, resolveGizmoTravel } from './travel.js';
import { resolveGizmoReaction, validGizmoInteraction, type GizmoReaction } from './reaction.js';
import { resolveGizmoSprite } from './sprite.js';
import { validGizmoConfiguration } from './configuration.js';
import { resolveGizmoSounds, gizmoPreviewError, type GizmoPreview } from './soundBank.js';
import { validObjectView } from './view.js';
import { resolveGizmoPush } from './push.js';
import { resolveGizmoLighting } from './lighting.js';
import { validateGizmoSteps } from './step.js';
import { gizmoLightError } from './light.js';
import { gizmoSequenceError } from './sequence.js';
import { gizmoGlowError } from './glow.js';
import { gizmoAmbienceError, gizmoSoundsError, gizmoAudioError } from './audio.js';
import { gizmoWorldText, validGizmoTextEditor } from './text.js';
import { validGizmoPresentation, validGizmoTimeline } from './presentation.js';
import { actorId, exactKeys, jsonData, ObjectActionError, objectId, record, type ObjectConfiguration, type ObjectAction, type ObjectContext, type ObjectDefinition, type ObjectInstance } from './api.js';
export const OBJECT_STATE_BYTE_LIMIT = 32_768;
/** Validate an opaque saved envelope without activating an uninstalled definition. */
export function isObjectEnvelope(value: unknown): value is ObjectInstance {
  if (!record(value) || !exactKeys(value, ['id', 'type', 'version', 'state', 'linkId']) || !objectId(value.id)
    || typeof value.type !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(value.type) || value.type.length > 80
    || (value.linkId !== undefined && (typeof value.linkId !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(value.linkId)))
    || !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !jsonData(value.state)) return false;
  return new TextEncoder().encode(JSON.stringify(value.state)).byteLength <= OBJECT_STATE_BYTE_LIMIT;
}
/** Account libraries may preserve configuration for a currently uninstalled gizmo. */
export function isObjectConfiguration(value: unknown): value is ObjectConfiguration {
  return record(value) && exactKeys(value, ['type', 'version', 'values'])
    && typeof value.type === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(value.type) && value.type.length <= 80
    && Number.isSafeInteger(value.version) && Number(value.version) >= 1
    && record(value.values) && jsonData(value.values)
    && new TextEncoder().encode(JSON.stringify(value.values)).byteLength <= 2048;
}
/** A disabled trusted definition, retained for host diagnostics without touching saved state. */
export interface GizmoFailure { type: string; emoji: string; label: string; message: string }

function validateDefinition(definition: ObjectDefinition): void {
  let field = 'definition';
  try {
    if (!definition || typeof definition.type !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(definition.type)
      || definition.type.length > 80 || !Number.isSafeInteger(definition.version) || definition.version < 1
      || typeof definition.emoji !== 'string' || !definition.emoji || typeof definition.label !== 'string'
      || !record(definition.actions)) throw new Error('Invalid gizmo metadata');
    for (const [name, action] of Object.entries(definition.actions)) {
      field = `actions.${name}`;
      if (!action || !['participant', 'editor', 'remover'].includes(action.permission) || typeof action.run !== 'function') throw new Error('Invalid action');
    }
    field = 'interaction';
    if (definition.interaction !== undefined && !validGizmoInteraction(definition.interaction, definition)) throw new Error('Invalid interaction');
    field = 'reaction';
    if (definition.react !== undefined && typeof definition.react !== 'function') throw new Error('Invalid reaction');
    if (definition.areaRemoval !== undefined && (!record(definition.areaRemoval) || !exactKeys(definition.areaRemoval, ['radiusCells']) || !Number.isInteger(definition.areaRemoval.radiusCells) || definition.areaRemoval.radiusCells < 0 || definition.areaRemoval.radiusCells > 3 || !definition.react)) throw new Error('Invalid area removal capability');
    field = 'previews';
    if (definition.previews !== undefined && (!record(definition.previews) || Object.keys(definition.previews).length > 16
      || Object.entries(definition.previews).some(([name, preview]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(name)
        || !preview || !['participant', 'editor'].includes(preview.permission) || typeof preview.run !== 'function'))) throw new Error('Invalid local previews');
    field = 'initial';
    const state = definition.initial();
    if (!isObjectEnvelope({ id: 'catalog-validation', type: definition.type, version: definition.version, state })) throw new Error('Invalid initial gizmo state');
    field = 'valid';
    if (definition.valid(structuredClone(state)) !== true) throw new Error('Invalid initial gizmo state');
    field = 'view';
    if (definition.view) {
      for (const canEdit of [false, true]) {
        if (!validObjectView(definition.view(structuredClone(state), { actorId: 'catalog-viewer', canEdit }))) throw new Error('Invalid gizmo controls');
      }
    }
    field = 'sounds';
    const soundError = definition.sounds !== undefined ? gizmoSoundsError(definition.sounds) : null;
    if (soundError) throw new Error(soundError);
    field = 'soundBank';
    if (definition.soundBank !== undefined && (typeof definition.soundBank !== 'function' || definition.sounds || definition.ambience)) throw new Error('Use a soundBank callback without static sounds or ambience');
    const sounds = resolveGizmoSounds(definition, state);
    field = 'audio';
    if (definition.audio) {
      const error = gizmoAudioError(definition.audio(structuredClone(state), structuredClone(state)), sounds);
      if (error) throw new Error(error);
    }
    field = 'light';
    const lightError = definition.light !== undefined ? gizmoLightError(definition.light) : null;
    if (lightError) throw new Error(lightError);
    field = 'glow';
    const glowError = definition.glow !== undefined ? gizmoGlowError(definition.glow) : null;
    if (glowError) throw new Error(glowError);
    field = 'lighting';
    resolveGizmoLighting(definition, state);
    field = 'link';
    if (definition.link !== undefined && !validGizmoLink(definition.link)) throw new Error('Invalid link grouping');
    field = 'travel';
    if (definition.travel !== undefined && typeof definition.travel !== 'function') throw new Error('travel must be a callback');
    resolveGizmoTravel(definition, state);
    field = 'spin';
    if (definition.spin !== undefined && (!Number.isFinite(definition.spin) || Math.abs(definition.spin) > 4)) throw new Error('spin must be within -4 to 4 radians per second');
    if (definition.link) resolveGizmoLighting(definition, state, { linked: true });
    field = 'worldEditor';
    if (definition.worldEditor !== undefined) {
      const editor = definition.worldEditor;
      if (!validGizmoWorldEditor(editor) || definition.textEditor || definition.presentation || definition.view
        || definition.actions[editor.action]?.permission !== 'editor' || !record(state)
        || state[editor.field] !== null && !validGizmoWorldDestination(state[editor.field])) throw new Error('Invalid world editor');
    }
    field = 'worldTextRange';
    if (definition.worldTextRange !== undefined && (!definition.worldText || !Number.isFinite(definition.worldTextRange) || definition.worldTextRange <= 0 || definition.worldTextRange > 32)) throw new Error('World text range must be within 0–32 cells');
    field = 'navigate';
    if (definition.navigate !== undefined && typeof definition.navigate !== 'function') throw new Error('navigate must be a callback');
    resolveGizmoNavigation(definition, state);
    field = 'walkable';
    if (definition.walkable !== undefined && typeof definition.walkable !== 'boolean') throw new Error('walkable must be boolean');
    field = 'push';
    if (definition.push !== undefined && (typeof definition.push !== 'function' || definition.walkable !== true)) throw new Error('push requires a callback and walkable: true');
    resolveGizmoPush(definition, state);
    field = 'sprite';
    if (definition.sprite !== undefined && (typeof definition.sprite !== 'function' || definition.presentation)) throw new Error('Sprite callback cannot also declare a model presentation');
    resolveGizmoSprite(definition, state);
    field = 'step';
    if (definition.step !== undefined && typeof definition.step !== 'function') throw new Error('step must be a callback');
    validateGizmoSteps(definition, state);
    field = 'ambience';
    const ambienceError = definition.ambience !== undefined ? gizmoAmbienceError(definition.ambience, definition.sounds ?? {}) : null;
    if (ambienceError) throw new Error(ambienceError);
    field = 'sequence';
    if (definition.ambience && 'mode' in definition.ambience) {
      if (!definition.sequence) throw new Error('Sequence ambience requires a sequence callback');
      const result=definition.sequence({step:0,sources:[{x:0,y:0,gain:1,pan:0}]}),error=gizmoSequenceError(result,1);
      if(error)throw new Error(error);
    } else if (definition.sequence) throw new Error('Sequence callback requires sequence ambience');
    field = 'editPolicy';
    if (definition.editPolicy !== undefined && !['placer', 'placer-admin'].includes(definition.editPolicy)) throw new Error('Invalid gizmo edit policy');
    field = 'textEditor';
    if (definition.textEditor && (!validGizmoTextEditor(definition.textEditor) || definition.presentation || definition.actions[definition.textEditor.action]?.permission !== 'editor')) throw new Error('Invalid gizmo text editor');
    if (definition.textEditor && (!record(state) || typeof state[definition.textEditor.field] !== 'string')) throw new Error('Invalid gizmo text field');
    field = 'configuration';
    if (definition.configuration && (!validGizmoConfiguration(definition.configuration) || definition.textEditor
      || definition.actions[definition.configuration.action]?.permission !== 'editor' || !record(state)
      || definition.configuration.fields.some(field => !Object.hasOwn(state, field)))) throw new Error('Invalid gizmo configuration');
    field = 'worldText';
    if (definition.worldText) gizmoWorldText(definition, structuredClone(state));
    field = 'presentation';
    if (definition.presentation && (!validGizmoPresentation(definition.presentation) || !definition.animate || !definition.actions[definition.presentation.tap.name])) throw new Error('Invalid gizmo presentation');
    field = 'animate';
    if (definition.presentation && !validGizmoTimeline(definition.animate!(structuredClone(state), structuredClone(state)))) throw new Error('Invalid gizmo animation');
  } catch (error) {
    throw new Error(`${definition?.type ?? 'Unknown gizmo'}: ${field}: ${error instanceof Error ? error.message : 'Definition failed'}`);
  }
}

export class ObjectRegistry {
  private definitions = new Map<string, ObjectDefinition>();
  private emojis = new Map<string, ObjectDefinition>();
  private disabled: GizmoFailure[] = [];
  /** Isolation is for trusted bundled catalogs only. Uploaded projects must remain atomic. */
  constructor(definitions: readonly ObjectDefinition[], options: { isolateInvalidDefinitions?: boolean } = {}) {
    const types = new Set<string>(), emojis = new Set<string>();
    for (const definition of definitions) {
      try {
        if (types.has(definition?.type) || emojis.has(definition?.emoji)) throw new Error(`${definition?.type}: Duplicate gizmo registration`);
        types.add(definition?.type); emojis.add(definition?.emoji);
        validateDefinition(definition);
        this.definitions.set(definition.type, definition); this.emojis.set(definition.emoji, definition);
      } catch (error) {
        if (!options.isolateInvalidDefinitions) throw error;
        this.recordFailure(definition, error);
      }
    }
  }
  failures(): readonly GizmoFailure[] { return this.disabled.map(failure => ({ ...failure })); }
  private recordFailure(definition: ObjectDefinition, error: unknown): void {
    this.disabled.push({ type: definition?.type ?? 'unknown', emoji: definition?.emoji ?? '', label: definition?.label ?? 'Gizmo',
      message: error instanceof Error ? error.message : String(error) });
  }
  /** Host preparation may reject one model without revalidating unrelated definitions. */
  disable(definition: ObjectDefinition, message: string): void {
    if (this.definitions.get(definition.type) !== definition) return;
    this.definitions.delete(definition.type); this.emojis.delete(definition.emoji);
    this.recordFailure(definition, new Error(`${definition.type}: ${message}`));
  }
  /** Atomically install a complete catalog while preserving host references. */
  reset(definitions: readonly ObjectDefinition[]): void {
    const next = new ObjectRegistry(definitions);
    this.definitions = next.definitions;
    this.emojis = next.emojis;
    this.disabled = this.disabled.filter(failure => !next.definitions.has(failure.type) && !next.emojis.has(failure.emoji));
  }
  /** A separate host catalog keeps unavailable built-ins and their placement guard. */
  fork(additional: readonly ObjectDefinition[] = []): ObjectRegistry {
    for (const definition of additional) {
      if (this.disabled.some(failure => failure.type === definition.type || failure.emoji === definition.emoji)) throw new Error(`${definition.type}: Duplicate gizmo registration`);
    }
    const next = new ObjectRegistry([...this.all(), ...additional]);
    next.disabled = this.failures().map(failure => ({ ...failure }));
    return next;
  }
  all(): ObjectDefinition[] { return [...this.definitions.values()]; }
  forEmoji(emoji: string): ObjectDefinition | undefined { return this.emojis.get(emoji); }
  definition(instance: ObjectInstance): ObjectDefinition {
    const definition = this.definitions.get(instance.type);
    if (!definition || instance.version !== definition.version) throw new ObjectActionError(409, 'This gizmo version is not supported');
    return definition;
  }
  validate(value: unknown): value is ObjectInstance {
    if (!isObjectEnvelope(value)) return false;
    const definition = this.definitions.get(value.type);
    if (!definition || value.version !== definition.version) return false;
    try {
      const editor = definition.worldEditor;
      return (!value.linkId || !!definition.link) && definition.valid(value.state)
        && (!editor || record(value.state) && (value.state[editor.field] === null || validGizmoWorldDestination(value.state[editor.field])));
    } catch { return false; }
  }

  create(emoji: string, id: string): ObjectInstance | undefined {
    const definition = this.forEmoji(emoji);
    if (!definition) {
      const failure = this.disabled.find(item => item.emoji === emoji);
      if (failure) throw new ObjectActionError(409, `This gizmo is unavailable. ${failure.message}`);
      return;
    }
    const instance = { id, type: definition.type, version: definition.version, state: definition.initial() };
    if (!this.validate(instance)) throw new ObjectActionError(400, 'Invalid initial gizmo state');
    return instance;
  }
  /** Copy declared configuration only, never unrelated runtime state. */
  configuration(instance: ObjectInstance): ObjectConfiguration | undefined {
    if (!this.validate(instance)) throw new ObjectActionError(409, 'This gizmo version is not supported');
    const definition = this.definition(instance), editor = definition.textEditor;
    const fields = definition.configuration?.fields ?? (editor ? [editor.field] : undefined);
    if (!fields) return;
    if (!record(instance.state) || fields.some(field => !Object.hasOwn(instance.state as object, field))) throw new ObjectActionError(400, 'Invalid gizmo configuration fields');
    const state = instance.state;
    const configuration = { type: instance.type, version: instance.version, values: Object.fromEntries(fields.map(field => [field, structuredClone(state[field])])) };
    if (!isObjectConfiguration(configuration)) throw new ObjectActionError(400, 'Invalid gizmo configuration');
    return configuration;
  }
  /** Restore portable values through the normal reducer and host-derived editing authority. */
  configure(instance: ObjectInstance, configuration: unknown, context: ObjectContext): ObjectInstance {
    if (!isObjectConfiguration(configuration)) throw new ObjectActionError(400, 'Invalid gizmo configuration');
    if (configuration.type !== instance.type || configuration.version !== instance.version)
      throw new ObjectActionError(409, 'This gizmo configuration version is not supported');
    const definition = this.definition(instance), editor = definition.textEditor;
    const recipe = definition.configuration ?? (editor ? { action: editor.action, fields: [editor.field] } : undefined);
    if (!recipe || !exactKeys(configuration.values, recipe.fields) || recipe.fields.some(field => !Object.hasOwn(configuration.values, field)))
      throw new ObjectActionError(400, 'Invalid gizmo configuration fields');
    if (!this.validate(instance)) throw new ObjectActionError(400, 'Invalid gizmo state');
    const state = instance.state;
    // Copying unchanged defaults does not grant editing authority or execute a reducer.
    if (record(state) && recipe.fields.every(field => JSON.stringify(state[field]) === JSON.stringify(configuration.values[field]))) return instance;
    return this.act(instance, { name: recipe.action, payload: configuration.values }, context);
  }
  /** Evaluate local audition data without applying state or sending any network action. */
  preview(instance: ObjectInstance, action: ObjectAction, viewer: { actorId: string; canEdit: boolean }): GizmoPreview {
    if (!this.validate(instance) || !actorId(viewer.actorId)) throw new ObjectActionError(400, 'Invalid gizmo preview');
    if (!record(action) || typeof action.name !== 'string' || !record(action.payload) || !jsonData(action.payload)
      || JSON.stringify(action.payload).length > 2048) throw new ObjectActionError(400, 'Invalid gizmo preview');
    const previews = this.definition(instance).previews;
    const handler = previews && Object.hasOwn(previews, action.name) ? previews[action.name] : undefined;
    if (!handler || handler.permission === 'editor' && !viewer.canEdit) throw new ObjectActionError(403, 'You cannot preview this gizmo');
    const result = handler.run(structuredClone(instance.state), structuredClone(action.payload)), error = gizmoPreviewError(result);
    if (error) throw new ObjectActionError(400, error);
    return structuredClone(result);
  }
  act(instance: ObjectInstance, action: ObjectAction, context: ObjectContext): ObjectInstance {
    return this.execute(instance, action, context).instance;
  }
  execute(instance: ObjectInstance, action: ObjectAction, context: ObjectContext): { instance: ObjectInstance; reaction: GizmoReaction | null } {
    if (!this.validate(instance)) throw new ObjectActionError(400, 'Invalid gizmo state');
    if (!record(action) || !exactKeys(action, ['name', 'payload']) || typeof action.name !== 'string' || !record(action.payload) || !jsonData(action.payload)
      || new TextEncoder().encode(JSON.stringify(action.payload)).byteLength > 2048) throw new ObjectActionError(400, 'Invalid gizmo action');
    const definition = this.definition(instance);
    const handler = Object.prototype.hasOwnProperty.call(definition.actions, action.name) ? definition.actions[action.name] : undefined;
    if (!handler) throw new ObjectActionError(400, 'Unknown gizmo action');
    if (!actorId(context.actorId) || handler.permission === 'editor' && !context.canEdit || handler.permission === 'remover' && !context.canRemove) throw new ObjectActionError(403, 'You cannot perform this gizmo action');
    const next = { ...instance, state: handler.run(structuredClone(instance.state), structuredClone(action.payload), context) };
    if (!this.validate(next)) throw new ObjectActionError(400, 'Invalid gizmo result');
    resolveGizmoLighting(definition, next.state);
    resolveGizmoPush(definition, next.state);
    resolveGizmoTravel(definition, next.state);
    resolveGizmoNavigation(definition, next.state);
    if (definition.worldEditor && (!record(next.state) || next.state[definition.worldEditor.field] !== null && !validGizmoWorldDestination(next.state[definition.worldEditor.field]))) throw new ObjectActionError(400, 'Invalid world destination');
    resolveGizmoSounds(definition, next.state);
    resolveGizmoSprite(definition, next.state);
    validateGizmoSteps(definition, next.state);
    if (definition.audio) {
      const timeline = definition.audio(structuredClone(next.state), structuredClone(instance.state));
      const error = gizmoAudioError(timeline, resolveGizmoSounds(definition, next.state));
      if (error) throw new ObjectActionError(400, `${definition.type}: ${error}`);
    }
    return { instance: next, reaction: resolveGizmoReaction(definition, next.state, instance.state, action, context.now) };
  }
}

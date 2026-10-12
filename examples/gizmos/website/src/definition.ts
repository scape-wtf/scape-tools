/** Website owns the shared embed address; Scape supplies isolation, context and popover lifetime. */
import {
  defineObject,
  exactKeys,
  ObjectActionError,
  record,
  requirePayload,
  validGizmoWebUrl,
} from '@scape-wtf/sdk';

export const website = defineObject<{ url: string }>({
  type: 'scape.website',
  version: 1,
  emoji: '🌐',
  label: 'Website',
  hint: 'open a shared website',
  initial: () => ({ url: '' }),
  valid: (state): state is { url: string } =>
    record(state) && exactKeys(state, ['url']) && (state.url === '' || validGizmoWebUrl(state.url)),
  configuration: { action: 'configure', fields: ['url'] },
  actions: {
    configure: {
      permission: 'editor',
      run: (_state, payload) => {
        requirePayload(payload, ['url']);
        if (payload.url !== '' && !validGizmoWebUrl(payload.url))
          throw new ObjectActionError(400, 'Enter an HTTPS embed URL');
        return { url: payload.url as string };
      },
    },
  },
  view: (state, viewer) => ({
    title: 'Website',
    description: '',
    web: state.url
      ? { title: 'Shared website', url: state.url, context: true }
      : {
          title: 'Set up a website',
          html: '<style>body{font:16px system-ui;padding:24px;background:#202020;color:white}</style><h1>Website</h1><p>Configure this gizmo with an HTTPS embed URL. Use the same match URL to play together.</p>',
        },
    fields: viewer.canEdit
      ? [{ id: 'url', label: 'Website embed URL', value: state.url, maxLength: 2048 }]
      : [],
    controls: viewer.canEdit
      ? [
          {
            id: 'configure',
            label: 'Save website',
            action: { name: 'configure', payload: {} },
            fields: ['url'],
          },
        ]
      : [],
  }),
});

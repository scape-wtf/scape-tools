import { ACTION_ICONS, ACTION_BUTTON_PRESETS } from './actionButtons.js';
import { exactKeys, jsonData, record, type ObjectField, type ObjectView } from './api.js';

/** The same bounded view contract is used for bundled and uploaded definitions. */
export function validObjectView(value: unknown): value is ObjectView {
  if (
    !record(value) ||
    typeof value.title !== 'string' ||
    value.title.length > 240 ||
    typeof value.description !== 'string' ||
    value.description.length > 4096 ||
    !Array.isArray(value.controls) ||
    value.controls.length > 32
  )
    return false;
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
  const text = (v: unknown) => typeof v === 'string' && v.length <= 240;
  if (
    value.fields !== undefined &&
    (!Array.isArray(value.fields) ||
      value.fields.length > 16 ||
      !Array.from(value.fields).every(field => {
        if (
          !record(field) ||
          !id(field.id) ||
          !text(field.label) ||
          typeof field.value !== 'string'
        )
          return false;
        if (field.kind === 'select') {
          if (
            !exactKeys(field, ['id', 'label', 'value', 'kind', 'options']) ||
            !Array.isArray(field.options) ||
            field.options.length < 1 ||
            field.options.length > 64
          )
            return false;
          return (
            Array.from(field.options).every(
              option =>
                record(option) &&
                exactKeys(option, ['value', 'label']) &&
                typeof option.value === 'string' &&
                option.value.length > 0 &&
                option.value.length <= 128 &&
                text(option.label),
            ) &&
            new Set(field.options.map(option => option.value)).size === field.options.length &&
            field.options.some(option => option.value === field.value)
          );
        }
        return (
          (field.kind === undefined || field.kind === 'text') &&
          exactKeys(field, ['id', 'label', 'value', 'kind', 'maxLength']) &&
          field.value.length <= 4096 &&
          Number.isInteger(field.maxLength) &&
          Number(field.maxLength) >= 1 &&
          Number(field.maxLength) <= 4096
        );
      }))
  )
    return false;
  const fields = (value.fields ?? []) as ObjectField[];
  const changedFields = value.controls
    .filter(control => record(control) && control.trigger === 'change')
    .flatMap(control => control.fields ?? []);
  if (new Set(changedFields).size !== changedFields.length) return false;
  return (
    new Set(fields.map(field => field.id)).size === fields.length &&
    new Set(value.controls.map(control => control?.id)).size === value.controls.length &&
    Array.from(value.controls).every(
      control =>
        record(control) &&
        id(control.id) &&
        text(control.label) &&
        record(control.action) &&
        id(control.action.name) &&
        record(control.action.payload) &&
        jsonData(control.action.payload) &&
        (control.fields === undefined ||
          (Array.isArray(control.fields) &&
            new Set(control.fields).size === control.fields.length &&
            control.fields.every(id => fields.some(field => field.id === id)))) &&
        (control.button === undefined ||
          (record(control.button) &&
            ((exactKeys(control.button, ['preset']) &&
              typeof control.button.preset === 'string' &&
              Object.hasOwn(ACTION_BUTTON_PRESETS, control.button.preset)) ||
              (exactKeys(control.button, ['icon']) &&
                typeof control.button.icon === 'string' &&
                (ACTION_ICONS as readonly string[]).includes(control.button.icon))) &&
            typeof control.confirm === 'string' &&
            control.confirm.trim().length > 0 &&
            typeof control.label === 'string' &&
            control.label.trim().length > 0 &&
            control.icon === undefined &&
            control.placement === undefined &&
            control.trigger === undefined &&
            control.kind === undefined &&
            control.pressed === undefined)) &&
        (control.icon === undefined ||
          (control.icon === 'toggle' &&
            typeof control.pressed === 'boolean' &&
            (control.fields === undefined ||
              (Array.isArray(control.fields) && control.fields.length === 0)))) &&
        (control.placement === undefined ||
          (control.placement === 'action' && control.trigger === undefined)) &&
        (control.trigger === undefined ||
          (control.trigger === 'change' &&
            control.confirm === undefined &&
            control.icon === undefined &&
            control.kind === undefined &&
            Array.isArray(control.fields) &&
            control.fields.length > 0 &&
            control.fields.every(id =>
              fields.some(field => field.id === id && field.kind === 'select'),
            ))) &&
        (control.kind === undefined ||
          (control.kind === 'preview' &&
            control.preview === undefined &&
            control.icon === undefined &&
            control.confirm === undefined)) &&
        (control.preview === undefined || id(control.preview)) &&
        (control.confirm === undefined || text(control.confirm)) &&
        (control.disabled === undefined || typeof control.disabled === 'boolean') &&
        (control.pressed === undefined || typeof control.pressed === 'boolean'),
    )
  );
}

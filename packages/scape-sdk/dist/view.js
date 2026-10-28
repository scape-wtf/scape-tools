import { ACTION_ICONS, ACTION_BUTTON_PRESETS } from './actionButtons.js';
import { boundedJsonData, exactKeys, jsonData, record, } from './api.js';
/** The same bounded view contract is used for bundled and uploaded definitions. */
export function validObjectView(value) {
    if (!record(value) ||
        Object.hasOwn(value, 'web') ||
        (value.webData !== undefined &&
            (!record(value.webData) || !boundedJsonData(value.webData, 8192))) ||
        typeof value.title !== 'string' ||
        value.title.length > 240 ||
        typeof value.description !== 'string' ||
        value.description.length > 4096 ||
        !Array.isArray(value.controls) ||
        value.controls.length > 32)
        return false;
    const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
    if (value.items !== undefined &&
        (!Array.isArray(value.items) ||
            value.items.length > 32 ||
            !Array.from(value.items).every(item => record(item) &&
                exactKeys(item, ['id', 'title', 'description']) &&
                id(item.id) &&
                typeof item.title === 'string' &&
                item.title.trim().length > 0 &&
                item.title.length <= 240 &&
                (item.description === undefined ||
                    (typeof item.description === 'string' && item.description.length <= 4096))) ||
            new Set(value.items.map(item => item.id)).size !== value.items.length ||
            value.items.reduce((total, item) => total + item.title.length + (item.description?.length ?? 0), 0) > 16384))
        return false;
    const text = (v) => typeof v === 'string' && v.length <= 240;
    if (value.fields !== undefined &&
        (!Array.isArray(value.fields) ||
            value.fields.length > 16 ||
            !Array.from(value.fields).every(validObjectField)))
        return false;
    const fields = (value.fields ?? []);
    if (value.rows !== undefined) {
        if (!Array.isArray(value.rows) || value.rows.length > 32)
            return false;
        const rows = new Set(), referenced = new Set();
        for (const row of value.rows) {
            if (!record(row) ||
                !exactKeys(row, ['id', 'label', 'sizing', 'elements']) ||
                !id(row.id) ||
                rows.has(row.id) ||
                (row.label !== undefined &&
                    (typeof row.label !== 'string' || !row.label.trim() || row.label.length > 240)) ||
                (row.sizing !== undefined && row.sizing !== 'equal' && row.sizing !== 'content') ||
                !Array.isArray(row.elements) ||
                row.elements.length < 1 ||
                row.elements.length > 8)
                return false;
            rows.add(row.id);
            for (const element of row.elements) {
                if (!record(element))
                    return false;
                const singular = element.kind === 'title' || element.kind === 'description';
                if (!exactKeys(element, singular ? ['kind'] : ['kind', 'id']) ||
                    (!singular && !id(element.id)))
                    return false;
                const exists = singular ||
                    (element.kind === 'field' && fields.some(field => field.id === element.id)) ||
                    (element.kind === 'item' &&
                        Array.isArray(value.items) &&
                        value.items.some(item => item.id === element.id)) ||
                    (element.kind === 'control' &&
                        value.controls.some(control => record(control) && control.id === element.id && control.trigger !== 'change'));
                const key = `${element.kind}:${singular ? '' : element.id}`;
                if (!exists || referenced.has(key))
                    return false;
                referenced.add(key);
            }
        }
    }
    const changedFields = value.controls
        .filter(control => record(control) && control.trigger === 'change')
        .flatMap(control => control.fields ?? []);
    if (new Set(changedFields).size !== changedFields.length)
        return false;
    return (new Set(fields.map(field => field.id)).size === fields.length &&
        new Set(value.controls.map(control => control?.id)).size === value.controls.length &&
        Array.from(value.controls).every(control => record(control) &&
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
                            ACTION_ICONS.includes(control.button.icon))) &&
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
                ((control.icon === 'toggle' || control.icon === 'tab') &&
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
                    control.fields.every(id => fields.some(field => field.id === id && field.kind !== undefined && field.kind !== 'text')))) &&
            (control.kind === undefined ||
                (control.kind === 'preview' &&
                    control.preview === undefined &&
                    control.icon === undefined &&
                    control.confirm === undefined)) &&
            (control.preview === undefined || id(control.preview)) &&
            (control.confirm === undefined || text(control.confirm)) &&
            (control.disabled === undefined || typeof control.disabled === 'boolean') &&
            (control.pressed === undefined || typeof control.pressed === 'boolean')));
}
const calendarDate = (value) => {
    if (typeof value !== 'string' ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
        value.startsWith('0000'))
        return false;
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return (month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]);
};
const clockTime = (value) => typeof value === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value);
/** Validate submitted typed values again in actions; view validation is not authorization. */
export function validObjectFieldValue(field, value) {
    switch (field.kind) {
        case 'emoji':
            // Hosts enforce their curated library. The SDK remains independent of game catalogs.
            return (typeof value === 'string' &&
                value.length > 0 &&
                value.length <= 16 &&
                /^(?:\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u.test(value));
        case 'boolean':
            return typeof value === 'boolean';
        case 'slider':
        case 'number': {
            if (typeof value !== 'number' ||
                !Number.isFinite(value) ||
                value < field.min ||
                value > field.max)
                return false;
            const steps = (value - field.min) / field.step;
            return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) <= 1e-8;
        }
        case 'date':
        case 'time':
            return (value === '' ||
                (typeof value === 'string' &&
                    (field.kind === 'date' ? calendarDate(value) : clockTime(value)) &&
                    (field.min === undefined || value >= field.min) &&
                    (field.max === undefined || value <= field.max)));
        case 'color':
            return color(value);
        case 'select':
        case 'radio':
            return field.options.some(option => option.value === value);
        case 'checklist':
            return (Array.isArray(value) &&
                value.length <= field.options.length &&
                new Set(value).size === value.length &&
                Array.from(value).every(selected => field.options.some(option => option.value === selected)));
        default:
            return typeof value === 'string' && value.length <= field.maxLength;
    }
}
function validObjectField(field) {
    if (!record(field) ||
        typeof field.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(field.id) ||
        typeof field.label !== 'string' ||
        field.label.length > 240)
        return false;
    const base = ['id', 'label', 'value', 'kind'];
    switch (field.kind) {
        case 'emoji':
            return exactKeys(field, base) && validObjectFieldValue(field, field.value);
        case 'boolean':
            return exactKeys(field, base) && typeof field.value === 'boolean';
        case 'slider':
        case 'number':
            return (exactKeys(field, [...base, 'min', 'max', 'step']) &&
                [field.min, field.max, field.step].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) &&
                Number(field.min) <= Number(field.max) &&
                Number(field.step) > 0 &&
                validObjectFieldValue(field, field.value));
        case 'date':
        case 'time': {
            const valid = field.kind === 'date' ? calendarDate : clockTime;
            return (exactKeys(field, [...base, 'min', 'max']) &&
                (field.min === undefined || valid(field.min)) &&
                (field.max === undefined || valid(field.max)) &&
                (field.min === undefined ||
                    field.max === undefined ||
                    String(field.min) <= String(field.max)) &&
                validObjectFieldValue(field, field.value));
        }
        case 'color':
            return (exactKeys(field, [...base, 'palette']) &&
                color(field.value) &&
                (field.palette === undefined ||
                    (Array.isArray(field.palette) &&
                        field.palette.length >= 1 &&
                        field.palette.length <= 32 &&
                        Array.from(field.palette).every(color) &&
                        new Set(field.palette).size === field.palette.length)));
        case 'select':
        case 'radio':
        case 'checklist':
            return (exactKeys(field, [...base, 'options']) &&
                Array.isArray(field.options) &&
                field.options.length >= 1 &&
                field.options.length <= 64 &&
                Array.from(field.options).every(option => record(option) &&
                    exactKeys(option, ['value', 'label']) &&
                    typeof option.value === 'string' &&
                    option.value.length > 0 &&
                    option.value.length <= 128 &&
                    typeof option.label === 'string' &&
                    option.label.length <= 240) &&
                new Set(field.options.map(option => option.value)).size === field.options.length &&
                validObjectFieldValue(field, field.value));
        default:
            // Preserve legacy text values up to 4096 even when maxLength is smaller.
            return ((field.kind === undefined || field.kind === 'text') &&
                exactKeys(field, [...base, 'maxLength', 'multiline']) &&
                typeof field.value === 'string' &&
                field.value.length <= 4096 &&
                Number.isInteger(field.maxLength) &&
                Number(field.maxLength) >= 1 &&
                Number(field.maxLength) <= 4096 &&
                (field.multiline === undefined || typeof field.multiline === 'boolean'));
    }
}

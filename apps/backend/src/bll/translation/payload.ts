import { TranslationError } from './registry.js';
import type { FrameField, FrameReport, FrameShape } from '../../types/chat.js';

export type JsonRecord = Readonly<Record<string, unknown>>;

/** The end of a streamed answer. Every protocol here ends with it or with an empty frame. */
export const STREAM_DONE = '[DONE]';

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The shape a value arrived in, named from a closed list so nothing of the value itself can travel. */
export function shapeOf(value: unknown): FrameShape {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  return typeof value === 'boolean' ? 'boolean' : 'other';
}

/** Reads a payload that must be an object. The message names what was expected, never what arrived. */
export function asRecord(value: unknown, what: string): JsonRecord {
  if (!isRecord(value)) {
    throw new TranslationError('invalid_frame', `${what} is not a JSON object`);
  }

  return value;
}

export function readText(source: JsonRecord, key: string): string | null {
  const value = source[key];

  return typeof value === 'string' ? value : null;
}

export function readCount(source: JsonRecord, key: string): number | null {
  const value = source[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readItems(source: JsonRecord, key: string): readonly unknown[] {
  const value = source[key];

  return Array.isArray(value) ? value : [];
}

/**
 * One streamed frame, turned into the object the protocol describes. A frame the transport already parsed
 * arrives as an object; a raw `data:` line arrives as text, because the translator must not depend on who
 * parsed the SSE. An empty frame and the `[DONE]` sentinel carry nothing and answer `null`.
 *
 * A payload that carries something and is not an object does not vanish: it is reported through `report`
 * with the shape that arrived, never with its content, and answers `null` so a stray frame does not break
 * a stream that is otherwise readable. Spec 014.
 */
export function parseFrame(payload: unknown, report?: FrameReport): JsonRecord | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === 'string') {
    const text = payload.trim();

    if (text === '' || text === STREAM_DONE) {
      return null;
    }

    return parseFrameText(text, report);
  }

  if (isRecord(payload)) {
    return payload;
  }

  report?.('frame_dropped', { reason: 'not_an_object', shape: shapeOf(payload) });

  return null;
}

function parseFrameText(text: string, report?: FrameReport): JsonRecord | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TranslationError('invalid_frame', 'a stream frame is not valid JSON');
  }

  if (isRecord(parsed)) {
    return parsed;
  }

  report?.('frame_dropped', { reason: 'parsed_not_an_object', shape: shapeOf(parsed) });

  return null;
}

/**
 * The first element of an array that holds a record, reporting the element it cannot read. The array is
 * handed over already read, so no caller reads a field twice: the audit of spec 019 measured that the
 * double read spec 018 fixed in one place was alive in three callers. Spec 020.
 */
export function firstRecord(
  items: readonly unknown[],
  field: FrameField,
  report?: FrameReport,
): JsonRecord | null {
  const [first] = items;

  if (first === undefined) {
    return null;
  }

  if (!isRecord(first)) {
    report?.('frame_dropped', { reason: 'unexpected_field_shape', field, shape: shapeOf(first) });

    return null;
  }

  return first;
}

/**
 * Reads the first element of an array field when it holds a record. An absent field, or an empty array,
 * carries nothing for the client and says nothing; a field that is present with a shape the codec does
 * not model is a frame it could not read, and is reported as such. Spec 016.
 *
 * The field is read once: the audit of spec 018 measured that reading it twice let a value that answers
 * differently on each read decide the outcome, and the audit of spec 019 measured the same shape in three
 * callers, which spec 020 fixed by handing the array over instead of the field name. Specs 019 and 020.
 */
export function readFirst(source: JsonRecord, key: FrameField, report?: FrameReport): JsonRecord | null {
  const value = source[key];

  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    report?.('frame_dropped', { reason: 'unexpected_field_shape', field: key, shape: shapeOf(value) });

    return null;
  }

  return firstRecord(value, key, report);
}

/** Reads an object field. Absent carries nothing; present with another shape is a drop. */
export function readRecord(source: JsonRecord, key: FrameField, report?: FrameReport): JsonRecord | null {
  const value = source[key];

  if (value === undefined) {
    return null;
  }

  if (isRecord(value)) {
    return value;
  }

  report?.('frame_dropped', { reason: 'unexpected_field_shape', field: key, shape: shapeOf(value) });

  return null;
}

/**
 * Reads an array field whose elements are objects. A present field that is not an array, and an element
 * that is not an object, are both drops; an absent field carries nothing. Spec 016.
 */
export function readRecordArray(
  source: JsonRecord,
  key: FrameField,
  report?: FrameReport,
): readonly JsonRecord[] {
  const value = source[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    report?.('frame_dropped', { reason: 'unexpected_field_shape', field: key, shape: shapeOf(value) });

    return [];
  }

  const records: JsonRecord[] = [];

  for (const item of value) {
    if (isRecord(item)) {
      records.push(item);
    } else {
      report?.('frame_dropped', { reason: 'unexpected_field_shape', field: key, shape: shapeOf(item) });
    }
  }

  return records;
}

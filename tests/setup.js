import { deserialize, serialize } from 'node:v8';
import 'fake-indexeddb/auto';
// jsdom does not expose structuredClone; IndexedDB uses the native clone algorithm.
globalThis.structuredClone ??= value => deserialize(serialize(value));

import { canonicalize, ContractInputError } from "./canonicalize.js";
import type { JsonValue } from "./canonicalize.js";

/** Parses JSON text without silently accepting duplicate object members. */
export function parseJson(text: string): JsonValue {
  if (typeof text !== "string") throw new ContractInputError("invalid_json_text");
  let position = 0;
  const fail = (): never => { throw new ContractInputError("invalid_json_text"); };
  function whitespace() {
    while (position < text.length && /[\x20\t\r\n]/.test(text[position]!)) position++;
  }
  function string(): string {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === "\\") { position++; continue; }
      if (char === '"') {
        try { return JSON.parse(text.slice(start, position)) as string; }
        catch { return fail(); }
      }
    }
    return fail();
  }
  function value(): JsonValue {
    whitespace();
    const first = text[position];
    if (first === '"') return string();
    if (first === "{") {
      position++; whitespace();
      const object: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
      if (text[position] === "}") { position++; return object; }
      while (position < text.length) {
        whitespace();
        if (text[position] !== '"') return fail();
        const key = string();
        if (Object.hasOwn(object, key)) throw new ContractInputError("duplicate_json_key");
        whitespace();
        if (text[position++] !== ":") return fail();
        object[key] = value(); whitespace();
        const delimiter = text[position++];
        if (delimiter === "}") return object;
        if (delimiter !== ",") return fail();
      }
      return fail();
    }
    if (first === "[") {
      position++; whitespace();
      const array: JsonValue[] = [];
      if (text[position] === "]") { position++; return array; }
      while (position < text.length) {
        array.push(value()); whitespace();
        const delimiter = text[position++];
        if (delimiter === "]") return array;
        if (delimiter !== ",") return fail();
      }
      return fail();
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(position))?.[0];
    if (!token) return fail();
    position += token.length;
    return JSON.parse(token) as JsonValue;
  }
  try {
    const parsed = value();
    whitespace();
    if (position !== text.length) return fail();
    canonicalize(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ContractInputError) throw error;
    return fail();
  }
}

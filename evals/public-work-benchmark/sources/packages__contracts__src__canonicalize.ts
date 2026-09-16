export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** An input failure. Messages never contain caller-supplied values or property names. */
export class ContractInputError extends TypeError {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ContractInputError";
    this.code = code;
  }
}

function validString(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new ContractInputError("invalid_unicode");
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new ContractInputError("invalid_unicode");
    }
  }
}

/**
 * RFC 8785-compatible canonical JSON for JSON data values.
 * Does not invoke getters/toJSON or normalize Unicode. Treat live objects/Proxies
 * from untrusted code as executable; parse text at an untrusted input boundary.
 */
export function canonicalize(input: unknown): string {
  const active = new Set<object>();
  function visit(value: unknown): string {
    if (value === null) return "null";
    switch (typeof value) {
      case "boolean": return value ? "true" : "false";
      case "string":
        validString(value);
        return JSON.stringify(value);
      case "number":
        if (!Number.isFinite(value)) throw new ContractInputError("non_finite_number");
        return JSON.stringify(value);
      case "object": break;
      default: throw new ContractInputError("non_json_value");
    }
    if (active.has(value)) throw new ContractInputError("cyclic_value");
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value) as unknown;
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
      throw new ContractInputError("non_json_object");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key === "symbol")) throw new ContractInputError("non_json_property");
    active.add(value);
    try {
      if (array) {
        const length = value.length;
        if (keys.length !== length + 1) throw new ContractInputError("non_json_array");
        const items: string[] = [];
        for (let i = 0; i < length; i++) {
          const descriptor = descriptors[String(i)];
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw new ContractInputError("non_json_array");
          }
          items.push(visit(descriptor.value));
        }
        return "[" + items.join(",") + "]";
      }
      return "{" + (keys as string[]).sort().map(key => {
        validString(key);
        const descriptor = descriptors[key]!;
        if (!("value" in descriptor) || !descriptor.enumerable) {
          throw new ContractInputError("non_json_property");
        }
        return JSON.stringify(key) + ":" + visit(descriptor.value);
      }).join(",") + "}";
    } finally {
      active.delete(value);
    }
  }
  return visit(input);
}

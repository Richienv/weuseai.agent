// Hand-rolled JSON Schema subset validator for workflow parameters.
//
// We deliberately avoid pulling in ajv or similar — this is a small
// surface area (<10 schema features used across the 3 pilot workflows)
// and a 200-line custom validator beats taking on a dependency in the
// _shared/ folder that has to satisfy both Deno and Node imports.
//
// Supported features (deliberately minimal — extend as new workflows
// need more):
//   - type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
//   - required: string[]   (object only)
//   - properties: {...}    (object only)
//   - items: schema        (array only)
//   - enum: any[]
//   - minimum / maximum    (number/integer)
//   - minLength / maxLength (string)
//   - minItems / maxItems  (array)
//   - format: 'date'       (YYYY-MM-DD)
//   - pattern: regex source (string)
//
// NOT supported (intentionally): $ref, allOf, oneOf, dependencies,
// patternProperties, additionalProperties enforcement. Schemas in our
// pilots don't need them. If a future workflow does, extend this file
// and add tests.
//
// Output is the same tagged ok/err shape used elsewhere in _shared/ —
// callers always discriminate via .ok rather than catch.

export type ValidateOk = { ok: true; value: unknown }
export type ValidateErr = { ok: false; errors: string[] }
export type ValidateResult = ValidateOk | ValidateErr

type Schema = Record<string, unknown>

/**
 * Validate `value` against `schema`. Returns ok+value (with defaults
 * applied for missing optional fields) or err+errors (path-prefixed
 * messages). Coerces nothing — `"5"` is NOT a valid number.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: Schema,
): ValidateResult {
  const errors: string[] = []
  const result = validateNode(value, schema, '', errors)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: result }
}

function validateNode(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): unknown {
  // Default before type check — applies even when value is undefined.
  if (value === undefined && 'default' in schema) {
    value = schema.default
  }

  // Undefined value with no default = treat as "field absent". The
  // caller's required-field check in validateObject is the gate for
  // missing-required; type validation should not fire on undefined for
  // optional fields (e.g. ManifestSkill.tier post-2E-2 migration).
  if (value === undefined) {
    return undefined
  }

  const type = schema.type as string | undefined

  if (type === 'string') {
    return validateString(value, schema, path, errors)
  }
  if (type === 'integer') {
    return validateInteger(value, schema, path, errors)
  }
  if (type === 'number') {
    return validateNumber(value, schema, path, errors)
  }
  if (type === 'boolean') {
    return validateBoolean(value, path, errors)
  }
  if (type === 'array') {
    return validateArray(value, schema, path, errors)
  }
  if (type === 'object') {
    return validateObject(value, schema, path, errors)
  }

  // Untyped node — only enum check applies.
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      errors.push(`${pathOrRoot(path)}: must be one of ${JSON.stringify(schema.enum)}`)
    }
  }
  return value
}

function validateString(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): unknown {
  if (typeof value !== 'string') {
    errors.push(`${pathOrRoot(path)}: expected string, got ${typeName(value)}`)
    return value
  }
  const minLength = schema.minLength as number | undefined
  if (typeof minLength === 'number' && value.length < minLength) {
    errors.push(`${pathOrRoot(path)}: length ${value.length} < minLength ${minLength}`)
  }
  const maxLength = schema.maxLength as number | undefined
  if (typeof maxLength === 'number' && value.length > maxLength) {
    errors.push(`${pathOrRoot(path)}: length ${value.length} > maxLength ${maxLength}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pathOrRoot(path)}: must be one of ${JSON.stringify(schema.enum)}`)
  }
  if (typeof schema.pattern === 'string') {
    let re: RegExp
    try {
      re = new RegExp(schema.pattern)
    } catch {
      errors.push(`${pathOrRoot(path)}: schema pattern is invalid regex`)
      return value
    }
    if (!re.test(value)) {
      errors.push(`${pathOrRoot(path)}: does not match pattern ${schema.pattern}`)
    }
  }
  if (schema.format === 'date') {
    // ISO-8601 calendar date YYYY-MM-DD. Don't accept full timestamps.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`${pathOrRoot(path)}: must be YYYY-MM-DD format`)
    } else {
      const d = new Date(value + 'T00:00:00Z')
      if (Number.isNaN(d.getTime())) {
        errors.push(`${pathOrRoot(path)}: not a valid calendar date`)
      }
    }
  }
  return value
}

function validateInteger(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): unknown {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push(`${pathOrRoot(path)}: expected integer, got ${typeName(value)}`)
    return value
  }
  return checkNumberBounds(value, schema, path, errors)
}

function validateNumber(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${pathOrRoot(path)}: expected number, got ${typeName(value)}`)
    return value
  }
  return checkNumberBounds(value, schema, path, errors)
}

function checkNumberBounds(
  value: number,
  schema: Schema,
  path: string,
  errors: string[],
): number {
  const minimum = schema.minimum as number | undefined
  if (typeof minimum === 'number' && value < minimum) {
    errors.push(`${pathOrRoot(path)}: ${value} < minimum ${minimum}`)
  }
  const maximum = schema.maximum as number | undefined
  if (typeof maximum === 'number' && value > maximum) {
    errors.push(`${pathOrRoot(path)}: ${value} > maximum ${maximum}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pathOrRoot(path)}: must be one of ${JSON.stringify(schema.enum)}`)
  }
  return value
}

function validateBoolean(value: unknown, path: string, errors: string[]): unknown {
  if (typeof value !== 'boolean') {
    errors.push(`${pathOrRoot(path)}: expected boolean, got ${typeName(value)}`)
  }
  return value
}

function validateArray(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): unknown {
  if (!Array.isArray(value)) {
    errors.push(`${pathOrRoot(path)}: expected array, got ${typeName(value)}`)
    return value
  }
  const minItems = schema.minItems as number | undefined
  if (typeof minItems === 'number' && value.length < minItems) {
    errors.push(`${pathOrRoot(path)}: length ${value.length} < minItems ${minItems}`)
  }
  const maxItems = schema.maxItems as number | undefined
  if (typeof maxItems === 'number' && value.length > maxItems) {
    errors.push(`${pathOrRoot(path)}: length ${value.length} > maxItems ${maxItems}`)
  }
  const itemSchema = schema.items as Schema | undefined
  if (itemSchema) {
    const out: unknown[] = []
    for (let i = 0; i < value.length; i++) {
      out[i] = validateNode(value[i], itemSchema, `${path}[${i}]`, errors)
    }
    return out
  }
  return value
}

function validateObject(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${pathOrRoot(path)}: expected object, got ${typeName(value)}`)
    return value
  }
  const v = value as Record<string, unknown>
  const props = (schema.properties as Record<string, Schema> | undefined) ?? {}
  const required = (schema.required as string[] | undefined) ?? []

  for (const key of required) {
    if (!(key in v) || v[key] === undefined) {
      errors.push(`${pathOrRoot(path)}: missing required property "${key}"`)
    }
  }

  // Apply per-property validation (and defaults).
  const out: Record<string, unknown> = { ...v }
  for (const [key, propSchema] of Object.entries(props)) {
    const subPath = path ? `${path}.${key}` : key
    if (key in out || 'default' in (propSchema as Schema)) {
      out[key] = validateNode(out[key], propSchema, subPath, errors)
    }
  }
  return out
}

function pathOrRoot(path: string): string {
  return path === '' ? '<root>' : path
}

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

// ─── Required-only field extraction ─────────────────────────────────────
//
// Used by workflow-execute (and originally workflow-discover, removed
// in the 2026-05-08 pivot) to identify required params. Returns the
// array of `required` property names from the top-level object schema,
// or [] if the schema doesn't have one.

export function requiredFieldsOf(schema: Schema): string[] {
  if (schema.type !== 'object') return []
  const required = schema.required
  if (!Array.isArray(required)) return []
  return required.filter((x): x is string => typeof x === 'string')
}

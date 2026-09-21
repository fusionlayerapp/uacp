// Minimal JSON Schema (2020-12) evaluator covering the keywords used by the
// kind body schemas in schema/v1/kinds. Annotation-only keywords (title,
// description, default, format) are ignored, as they are by default in ajv.

type Schema = Record<string, unknown> | boolean

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (isObject(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v)
}

function typeMatches(type: string, v: unknown): boolean {
  switch (type) {
    case 'object': return isObject(v)
    case 'array': return Array.isArray(v)
    case 'string': return typeof v === 'string'
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'integer': return typeof v === 'number' && Number.isInteger(v)
    case 'boolean': return typeof v === 'boolean'
    case 'null': return v === null
    default: return false
  }
}

function resolveRef(ref: string, root: Record<string, unknown>): Schema {
  const match = /^#\/\$defs\/(.+)$/.exec(ref)
  const defs = root.$defs
  if (!match || !isObject(defs) || !(match[1] in defs)) throw new Error(`unsupported $ref ${ref}`)
  return defs[match[1]] as Schema
}

export function checkSchema(schema: Schema, value: unknown, path: string, root: Record<string, unknown>, errors: string[]): void {
  if (schema === true) return
  if (schema === false) { errors.push(`${path}: not allowed`); return }

  if (typeof schema.$ref === 'string') checkSchema(resolveRef(schema.$ref, root), value, path, root, errors)
  if (Array.isArray(schema.allOf)) for (const sub of schema.allOf) checkSchema(sub as Schema, value, path, root, errors)
  if (schema.if !== undefined) {
    const probe: string[] = []
    checkSchema(schema.if as Schema, value, path, root, probe)
    const branch = probe.length === 0 ? schema.then : schema.else
    if (branch !== undefined) checkSchema(branch as Schema, value, path, root, errors)
  }
  if ('const' in schema && canonical(value) !== canonical(schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(e => canonical(e) === canonical(value))) {
    errors.push(`${path}: must be one of ${schema.enum.map(e => JSON.stringify(e)).join(', ')}`)
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type as string[] : [schema.type as string]
    if (!types.some(t => typeMatches(t, value))) {
      errors.push(`${path}: must be of type ${types.join(' or ')}`)
      return
    }
  }

  if (typeof value === 'string') {
    const length = Array.from(value).length
    if (typeof schema.minLength === 'number' && length < schema.minLength) errors.push(`${path}: must be at least ${schema.minLength} characters`)
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) errors.push(`${path}: must not exceed ${schema.maxLength} characters`)
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: must match pattern ${schema.pattern}`)
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`)
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: must contain at least ${schema.minItems} items`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: must not contain more than ${schema.maxItems} items`)
    if (schema.uniqueItems === true && new Set(value.map(canonical)).size !== value.length) errors.push(`${path}: items must be unique`)
    if (schema.items !== undefined) value.forEach((item, i) => checkSchema(schema.items as Schema, item, `${path}[${i}]`, root, errors))
  }

  if (isObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in value)) errors.push(`${path}.${key}: required`)
      }
    }
    const properties = isObject(schema.properties) ? schema.properties : {}
    for (const [key, item] of Object.entries(value)) {
      if (key in properties) {
        checkSchema(properties[key] as Schema, item, `${path}.${key}`, root, errors)
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unknown property '${key}'`)
      } else if (isObject(schema.additionalProperties)) {
        checkSchema(schema.additionalProperties, item, `${path}.${key}`, root, errors)
      }
    }
  }
}

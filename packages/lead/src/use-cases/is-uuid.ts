// Basic RFC 4122 UUID shape check. Postgres throws on a malformed uuid literal,
// so use cases short-circuit on a non-UUID leadId before issuing any query
// (mirrors the guard in get-lead-detail.ts).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

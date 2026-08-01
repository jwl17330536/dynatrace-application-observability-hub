/**
 * Build DQL snippets that extract CMDB application_id from entity tags / fields
 * using Setup-configured EntityJoinSource entries (no hardcoded keys).
 */
import type { EntityJoinAppliesTo, EntityJoinSource } from "@utils/documentStore";
import { normalizeEntityJoinSources } from "@utils/documentStore";

function sanitizeKey(key: string): string {
  return key.replace(/[`"'\\\n\r]/g, "").trim();
}

function isSimpleFieldKey(value: string): boolean {
  const key = sanitizeKey(value);
  return Boolean(key) && !key.includes("(") && !key.includes(" ");
}

/**
 * Ordered tag keys to try for a given entity family:
 * 1) primary Setup expression (when it is a simple field/tag key)
 * 2) configured classic_tag / grail_field sources that apply to this family
 */
export function orderedTagKeysFor(
  sources: EntityJoinSource[] | undefined,
  primaryExpression: string,
  appliesTo: EntityJoinAppliesTo
): string[] {
  const keys: string[] = [];
  if (isSimpleFieldKey(primaryExpression)) {
    keys.push(sanitizeKey(primaryExpression));
  }
  const normalized = normalizeEntityJoinSources(sources, primaryExpression).filter((s) =>
    s.appliesTo.includes(appliesTo)
  );
  for (const source of normalized) {
    if (source.kind === "classic_tag" || source.kind === "grail_field") {
      const key = sanitizeKey(source.key);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * Given entity rows that already have a `tags` array field, emit a DQL expression
 * that resolves CMDB app id from classic-style `key:value` tags.
 */
export function buildClassicTagAppIdExpression(
  sources: EntityJoinSource[] | undefined,
  primaryExpression: string,
  appliesTo: EntityJoinAppliesTo
): string {
  const allTagKeys = orderedTagKeysFor(sources, primaryExpression, appliesTo);

  if (!allTagKeys.length) {
    return `""`;
  }

  const parts = allTagKeys.map(
    (key) =>
      `arrayLast(arrayRemoveNulls(iCollectArray(if(contains(tags[], "${key}:"), arrayLast(splitString(tags[], ":"))))))`
  );
  if (parts.length === 1) {
    return parts[0];
  }
  return parts.slice(1).reduce((acc, part) => `coalesce(${acc}, ${part})`, parts[0]);
}

/** Primary Grail tag field reference for telemetry (primary_tags.{key}). */
export function buildGrailTagFieldRefs(
  sources: EntityJoinSource[] | undefined,
  primaryExpression: string,
  appliesTo: EntityJoinAppliesTo
): string[] {
  return normalizeEntityJoinSources(sources, primaryExpression)
    .filter((s) => s.kind === "grail_tag" && s.appliesTo.includes(appliesTo))
    .map((s) => sanitizeKey(s.key))
    .filter(Boolean)
    .map((key) => `primary_tags.${key}`);
}

export function listJoinSourcesFor(
  sources: EntityJoinSource[] | undefined,
  primaryExpression: string,
  appliesTo: EntityJoinAppliesTo
): EntityJoinSource[] {
  return normalizeEntityJoinSources(sources, primaryExpression).filter((s) => s.appliesTo.includes(appliesTo));
}

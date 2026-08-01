/**
 * Dynatrace UI deep links for hub tables.
 * Entity pages use the stable /ui/nav/{id} redirect.
 * Problems app requires the internal event.id UUID (not display_id alone).
 *
 * Absolute links must use the environment URL — not window.location.origin —
 * because Dynatrace apps run in an iframe whose origin is `{hash}--{env}…`.
 */
import React from "react";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

const CLASSIC_ENTITY_ID =
  /^(HOST|APPLICATION|FRONTEND|SERVICE|PROCESS_GROUP|PROCESS_GROUP_INSTANCE|SYNTHETIC_TEST|HTTP_CHECK|HTTP_MONITOR|BROWSER|BROWSER_MONITOR|CLOUD_APPLICATION|KUBERNETES_CLUSTER|KUBERNETES_NODE|MOBILE_APPLICATION|CUSTOM_APPLICATION)-[A-F0-9]+$/i;

/** Davis problem id: UUID or human display id (P-…). */
const PROBLEM_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|P-\d+)$/i;

export function isClassicEntityId(value: string): boolean {
  return CLASSIC_ENTITY_ID.test(value.trim());
}

export function isProblemEventId(value: string): boolean {
  return PROBLEM_ID.test(value.trim());
}

/** Platform/environment origin (not the app iframe origin). */
export function getPlatformOrigin(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const fromSdk = (getEnvironmentUrl() || "").replace(/\/$/, "");
    if (fromSdk && !fromSdk.includes("dynatrace.com/") && fromSdk !== "https://dynatrace.com") {
      return fromSdk;
    }
  } catch {
    // fall through
  }
  // Strip app-instance prefix: {hash}--oei3894h.hard2.sprint… → oei3894h.hard2.sprint…
  const host = window.location.hostname;
  if (host.includes("--")) {
    return `${window.location.protocol}//${host.replace(/^[^.]+\-\-/, "")}`;
  }
  return window.location.origin;
}

function absoluteUiPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") {
    return normalized;
  }
  const origin = getPlatformOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}

/** Stable entity navigation: HOST-…, APPLICATION-…, FRONTEND-…, SYNTHETIC_TEST-…, etc. */
export function generateEntityNavLink(entityId: string): string {
  const id = entityId.trim();
  return absoluteUiPath(`/ui/nav/${encodeURIComponent(id)}`);
}

/** Davis Problems app deep link (requires event.id UUID). */
export function generateProblemLink(eventId: string): string {
  const id = eventId.trim();
  return absoluteUiPath(`/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(id)}`);
}

/** Resolve a navigable URL from an id string, or null if unknown. */
export function resolveDynatraceOpenUrl(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }
  const trimmed = id.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }
  if (isClassicEntityId(trimmed)) {
    return generateEntityNavLink(trimmed);
  }
  if (isProblemEventId(trimmed)) {
    return generateProblemLink(trimmed);
  }
  return null;
}

export function openInDynatrace(id: string | null | undefined): boolean {
  const url = resolveDynatraceOpenUrl(id);
  if (!url || typeof window === "undefined") {
    return false;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Visible underlined link that opens Dynatrace (new tab). Falls back to plain text. */
export function DynatraceLink({
  id,
  children,
  style,
}: {
  id: string | null | undefined;
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  const url = resolveDynatraceOpenUrl(id);
  if (!url) {
    return <span style={style}>{children}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      style={{
        color: "var(--dt-colors-theme-primary-90, #1496ff)",
        textDecoration: "underline",
        ...style,
      }}
      title="Open in Dynatrace"
    >
      {children}
    </a>
  );
}

/** @deprecated Prefer generateEntityNavLink */
export function generateEntityLink(entityId: string): string {
  return generateEntityNavLink(entityId);
}

/** @deprecated Prefer generateEntityNavLink with HOST- id */
export function generateHostDetailLink(hostName: string): string {
  return absoluteUiPath(`/ui/entity/list?query=${encodeURIComponent(hostName)}`);
}

/** @deprecated Prefer generateEntityNavLink with APPLICATION- id */
export function generateApplicationDetailLink(appName: string): string {
  return absoluteUiPath(`/ui/entity/list?query=${encodeURIComponent(appName)}`);
}

// Keep app state in the fragment so browsers omit it from HTTP requests.
const STATE_PARAMETERS = [
  "theme", "rugged", "endless", "multipliers", "auto",
  "autoIntervalSeconds", "autoInterval", "autoRemainingSeconds",
  "started", "round", "completed", "deck", "draw", "room", "sync",
];

export function readUrlState() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const legacy = new URLSearchParams(window.location.search);
  for (const name of STATE_PARAMETERS) {
    if (!params.has(name) && legacy.has(name)) {
      params.set(name, legacy.get(name));
    }
  }
  return params;
}

export function buildStateUrl(params) {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(params);
  // The sync host is connection configuration, separate from workout snapshots.
  const sync = readUrlState().get("sync");
  if (sync && !fragment.has("sync")) fragment.set("sync", sync);
  for (const name of STATE_PARAMETERS) url.searchParams.delete(name);
  url.hash = fragment.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function migrateLegacyUrlState() {
  const query = new URLSearchParams(window.location.search);
  if (STATE_PARAMETERS.some((name) => query.has(name))) {
    history.replaceState(null, "", buildStateUrl(readUrlState()));
  }
}

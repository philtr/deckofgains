const DEV_LOG_PREFIX = "[Deck of Gains analytics]";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function createUmamiAdapter(umami) {
  return {
    kind: "umami",

    identify(id) {
      if (typeof umami.identify !== "function") {
        return Promise.resolve();
      }
      return Promise.resolve(umami.identify(id));
    },

    track(event, data) {
      return Promise.resolve(umami.track(event, data));
    },

    trackView(url) {
      return Promise.resolve(
        umami.track((properties) => ({ ...properties, url })),
      );
    },
  };
}

function createConsoleAdapter() {
  return {
    kind: "console",

    identify() {
      return Promise.resolve();
    },

    track(event, data) {
      console.log(DEV_LOG_PREFIX, { type: "event", name: event, data });
      return Promise.resolve();
    },

    trackView(url) {
      console.log(DEV_LOG_PREFIX, { type: "pageview", url });
      return Promise.resolve();
    },
  };
}

export function createAnalyticsAdapter() {
  if (typeof window.umami?.track === "function") {
    return createUmamiAdapter(window.umami);
  }

  if (LOCAL_HOSTNAMES.has(window.location.hostname)) {
    return createConsoleAdapter();
  }

  return null;
}

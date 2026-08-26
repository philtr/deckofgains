const ANALYTICS_ID_KEY = "deckOfGains:analyticsId";
const UMAMI_WEBSITE_ID = "7c8cf4cd-5d6b-4bd3-968a-b5699e36b980";
const UMAMI_RECORDER_URL = "/analytics/recorder.js";
const ANALYTICS_UNAVAILABLE_WARNING =
  "[Deck of Gains] Analytics unavailable; usage will not be tracked.";
const UTM_PARAMETERS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

let initialized = false;
let trackingDisabled = false;
let lastTrackedView = null;
let initialUtmParameters = new URLSearchParams();
let workoutCompletionTracked = false;

function isDoNotTrackEnabled() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const value =
    window.doNotTrack ?? navigator.doNotTrack ?? navigator.msDoNotTrack;
  return value === 1 || value === "1" || value === "yes";
}

function createAnonymousId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

function getOrCreateAnonymousId() {
  try {
    const existing = window.localStorage.getItem(ANALYTICS_ID_KEY);
    if (existing) {
      return existing;
    }

    const id = createAnonymousId();
    window.localStorage.setItem(ANALYTICS_ID_KEY, id);
    return id;
  } catch (error) {
    return null;
  }
}

function captureInitialUtmParameters() {
  const source = new URLSearchParams(window.location.search);
  const captured = new URLSearchParams();
  UTM_PARAMETERS.forEach((name) => {
    const value = source.get(name);
    if (value) {
      captured.set(name, value);
    }
  });
  return captured;
}

function loadRecorder() {
  if (document.querySelector(`script[src="${UMAMI_RECORDER_URL}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_RECORDER_URL;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  document.head.appendChild(script);
}

function buildVirtualUrl(view) {
  const params = new URLSearchParams();
  params.set("view", view);
  UTM_PARAMETERS.forEach((name) => {
    const value = initialUtmParameters.get(name);
    if (value) {
      params.set(name, value);
    }
  });
  return `${window.location.pathname}?${params.toString()}`;
}

function track(event, data) {
  if (trackingDisabled || typeof window.umami?.track !== "function") {
    return Promise.resolve();
  }

  return Promise.resolve(window.umami.track(event, data));
}

const Analytics = {
  initialize() {
    if (initialized) {
      return;
    }
    initialized = true;
    trackingDisabled = isDoNotTrackEnabled();
    if (trackingDisabled) {
      return;
    }
    if (typeof window.umami?.track !== "function") {
      trackingDisabled = true;
      console.warn(ANALYTICS_UNAVAILABLE_WARNING);
      return;
    }

    loadRecorder();
    initialUtmParameters = captureInitialUtmParameters();
    const anonymousId = getOrCreateAnonymousId();
    if (anonymousId && typeof window.umami?.identify === "function") {
      window.umami.identify(anonymousId);
    }
  },

  trackView(view) {
    if (
      trackingDisabled ||
      lastTrackedView === view ||
      typeof window.umami?.track !== "function"
    ) {
      return Promise.resolve();
    }

    lastTrackedView = view;
    const url = buildVirtualUrl(view);
    return Promise.resolve(
      window.umami.track((properties) => ({ ...properties, url })),
    );
  },

  workoutStarted(data) {
    workoutCompletionTracked = false;
    return track("workout_started", data);
  },

  workoutResumed(data) {
    workoutCompletionTracked = false;
    return track("workout_resumed", data);
  },

  roundDrawn(data) {
    return track("round_drawn", data);
  },

  workoutCompleted(data) {
    if (workoutCompletionTracked) {
      return Promise.resolve();
    }
    workoutCompletionTracked = true;
    return track("workout_completed", data);
  },

  newSetStarted(data) {
    return track("new_set_started", data);
  },

  roomJoinRequested() {
    return track("room_join_requested");
  },
};

export default Analytics;

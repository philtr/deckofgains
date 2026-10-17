import { readUrlState, buildStateUrl } from "./urlState.js";

function serializeSyncState(state) {
  return JSON.stringify(state ?? null);
}

function normalizeRoomCodeInput(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function createRoomSyncController({
  resolveRoomCode,
  createRoomSync,
}) {
  let syncSession = null;
  let syncRoomCode = null;
  let syncSuppressOutbound = false;
  let lastSyncedSerialized = null;
  let syncHasRemoteState = false;
  let syncEnabled = true;

  function resolveRoomCodeFromLocation() {
    return resolveRoomCode(readUrlState());
  }

  function updateRoomControls(roomCode) {
    const controls = document.querySelector(".group-join-controls");
    const active = document.getElementById("room-active");
    const activeName = document.getElementById("room-active-name");
    const hasRoom = Boolean(roomCode);

    if (controls) {
      controls.style.display = hasRoom ? "none" : "flex";
    }
    if (active) {
      active.style.display = hasRoom ? "flex" : "none";
    }
    if (activeName) {
      activeName.textContent = roomCode ?? "";
    }
  }

  function updateRoomParam(roomCode) {
    const params = readUrlState();
    if (roomCode) {
      params.set("room", roomCode);
    } else {
      params.delete("room");
    }
    const url = buildStateUrl(params);
    history.replaceState(null, "", url);
    updateRoomControls(roomCode);
  }

  function getRoomInputValue() {
    const roomInput = document.getElementById("room-code");
    const roomCode = normalizeRoomCodeInput(roomInput?.value);
    if (roomInput) {
      roomInput.value = roomCode ?? "";
    }
    return roomCode;
  }

  function setControlsEnabled(enabled) {
    const groupJoin = document.getElementById("group-join");
    if (groupJoin) {
      groupJoin.style.display = enabled ? "" : "none";
    }
    if (enabled) {
      updateRoomControls(resolveRoomCodeFromLocation());
    }
  }

  function stopSession() {
    if (syncSession) {
      syncSession.stop();
    }
    syncSession = null;
    syncRoomCode = null;
    lastSyncedSerialized = null;
    syncHasRemoteState = false;
  }

  function setEnabled(enabled) {
    syncEnabled = Boolean(enabled);
    if (!syncEnabled) {
      stopSession();
    }
  }

  function isEnabled() {
    return syncEnabled;
  }

  function hasRemoteState() {
    return syncHasRemoteState;
  }

  function markRemoteStateReceived() {
    syncHasRemoteState = true;
  }

  function rememberSyncedState(state) {
    lastSyncedSerialized = serializeSyncState(state);
  }

  function sendState(state) {
    if (!syncSession || syncSuppressOutbound) {
      return;
    }

    const serialized = serializeSyncState(state);
    if (serialized === lastSyncedSerialized) {
      return;
    }

    lastSyncedSerialized = serialized;
    syncSession.sendState(state);
  }

  function suppressOutbound(callback) {
    syncSuppressOutbound = true;
    try {
      callback();
    } finally {
      syncSuppressOutbound = false;
    }
  }

  async function ensureSession(roomCode, onRemoteState) {
    if (!syncEnabled) {
      stopSession();
      return { remoteState: null };
    }

    if (!roomCode) {
      stopSession();
      return { remoteState: null };
    }

    if (syncSession && syncRoomCode === roomCode) {
      return { remoteState: null };
    }

    stopSession();
    syncRoomCode = roomCode;
    syncSession = createRoomSync({
      roomCode,
      onRemoteState,
    });

    const remoteState = await syncSession.fetchState();
    if (remoteState) {
      syncHasRemoteState = true;
    }
    syncSession.startStream();
    return { remoteState };
  }

  async function syncToRoom(roomCode, onRemoteState) {
    if (!roomCode) {
      stopSession();
      return null;
    }

    const { remoteState } = await ensureSession(roomCode, onRemoteState);
    return remoteState;
  }

  function getSession() {
    return syncSession;
  }

  return {
    ensureSession,
    getRoomInputValue,
    getSession,
    hasRemoteState,
    isEnabled,
    markRemoteStateReceived,
    rememberSyncedState,
    resolveRoomCodeFromLocation,
    sendState,
    setControlsEnabled,
    setEnabled,
    stopSession,
    suppressOutbound,
    syncToRoom,
    updateRoomControls,
    updateRoomParam,
  };
}

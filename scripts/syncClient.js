import { Socket } from './vendor/phoenix.mjs';

function buildRoomUrl(roomCode, suffix = '') {
  const encodedRoom = encodeURIComponent(roomCode);
  return `${resolveSyncBaseUrl()}/api/rooms/${encodedRoom}${suffix}`;
}

function isUsableState(state) {
  return state && typeof state === 'object' && !Array.isArray(state);
}

export function createRoomSync({ roomCode, onRemoteState }) {
  let socket = null;
  let channel = null;
  let closed = false;

  function stop() {
    closed = true;
    if (channel) {
      channel.leave();
      channel = null;
    }
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  async function fetchState() {
    if (closed) {
      return null;
    }

    try {
      const response = await fetch(buildRoomUrl(roomCode));
      if (!response.ok) {
        return null;
      }
      const record = await response.json();
      if (isUsableState(record?.state)) {
        return record.state;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function startStream() {
    if (closed || socket) {
      return;
    }

    const SocketConstructor = resolveSocketConstructor();
    socket = new SocketConstructor(buildSocketUrl());
    socket.connect();

    channel = socket.channel(`room:${roomCode}`);
    channel.on('state', record => {
      if (closed) {
        return;
      }

      if (isUsableState(record?.state)) {
        onRemoteState(record.state);
      }
    });

    channel
      .join()
      .receive('ok', record => {
        if (closed) {
          return;
        }
        if (isUsableState(record?.state)) {
          onRemoteState(record.state);
        }
      })
      .receive('error', () => {
        // Ignore join failures; the next update can retry.
      });
  }

  async function sendState(state) {
    if (closed || !isUsableState(state)) {
      return;
    }

    try {
      if (!socket) {
        startStream();
      }
      if (!channel) {
        return;
      }
      channel.push('state:update', { state });
    } catch (error) {
      // Skip failed sync; next local update will retry.
    }
  }

  return {
    fetchState,
    startStream,
    sendState,
    stop
  };
}

function buildSocketUrl() {
  const baseUrl = resolveSyncBaseUrl();
  if (baseUrl.startsWith('https://')) {
    return baseUrl.replace('https://', 'wss://') + '/socket';
  }
  if (baseUrl.startsWith('http://')) {
    return baseUrl.replace('http://', 'ws://') + '/socket';
  }
  return `${baseUrl}/socket`;
}

function resolveSocketConstructor() {
  if (typeof globalThis !== 'undefined' && globalThis.__deckOfGainsSocket) {
    return globalThis.__deckOfGainsSocket;
  }
  return Socket;
}

function resolveSyncBaseUrl() {
  if (typeof window === 'undefined') {
    return 'https://sync.deck.fitness';
  }

  const params = new URLSearchParams(window.location.search);
  const override = params.get('sync');
  if (override) {
    return normalizeSyncBaseUrl(override);
  }

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }

  return 'https://sync.deck.fitness';
}

function normalizeSyncBaseUrl(candidate) {
  if (typeof candidate !== 'string') {
    return 'https://sync.deck.fitness';
  }
  const trimmed = candidate.trim().replace(/\/+$/, '');
  return trimmed || 'https://sync.deck.fitness';
}

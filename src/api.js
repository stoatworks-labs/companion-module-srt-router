import WebSocket from "ws";
import { InstanceStatus } from "@companion-module/base";

// Two channels, and they carry different things:
//
//   /ws          the crosspoint state, pushed. The router re-snapshots at 5 Hz
//                and sends only when the serialised form changed, so this
//                covers routing AND membership — a source added through the
//                management API shows up here without a separate poll.
//   HTTP         commands, and the transport KIND of each entity, which the
//                state object does not carry.
//
// The kinds matter because the router refuses a route between incompatible
// payloads. Fetching them lets the dropdowns say "cam1 (srt)" rather than
// leaving an operator to discover the refusal by pressing a button on air.

const RECONNECT_MS = 3000;

function baseUrl(self) {
  return `http://${self.config.host}:${self.config.port}`;
}

async function getJson(self, path) {
  const res = await fetch(`${baseUrl(self)}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Route one output to one source.
 *
 * The router answers **HTTP 200 with `{ok:false}`** for a rejected route, not a
 * 4xx — checking only the status code would report every refusal as a success.
 * And when the crosspoint itself refuses (an id that does not exist) the body
 * carries `ok:false` with **no error string at all**, so the message has to be
 * supplied here or the operator gets an empty failure.
 */
export async function route(self, output, source) {
  const res = await fetch(`${baseUrl(self)}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ output, source }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(
      body.error ||
        `Router refused "${source}" to "${output}" — check both still exist.`,
    );
  }
  return body;
}

export async function fetchState(self) {
  return getJson(self, "/api/state");
}

/** Transport kinds, keyed by id, for both directions. Best-effort: a router
 *  built without the management API still routes perfectly, so a failure here
 *  degrades the dropdown labels rather than the module. */
export async function fetchKinds(self) {
  const kinds = { sources: {}, outputs: {}, transports: [] };
  try {
    const [sources, outputs, transports] = await Promise.all([
      getJson(self, "/api/manage/sources"),
      getJson(self, "/api/manage/outputs"),
      getJson(self, "/api/manage/transports"),
    ]);
    for (const s of sources ?? []) kinds.sources[s.id] = s.kind;
    for (const o of outputs ?? []) kinds.outputs[o.id] = o.kind;
    kinds.transports = transports ?? [];
  } catch (e) {
    self.log("debug", `Management API unavailable: ${e.message}`);
  }
  return kinds;
}

export async function addEntity(self, which, body) {
  const res = await fetch(`${baseUrl(self)}/api/manage/${which}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Add ${which} failed: HTTP ${res.status} ${text}`.trim());
  }
  return res.json().catch(() => ({}));
}

/** Removal genuinely tears the listener down and frees its port — this is not a
 *  registry delete. There is no undo, and a config-defined entity is exactly as
 *  removable as one added at runtime. */
export async function removeEntity(self, which, id) {
  const res = await fetch(
    `${baseUrl(self)}/api/manage/${which}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(`Remove ${which}/${id} failed: HTTP ${res.status}`);
  }
  return true;
}

export const socket = {
  ws: null,
  reconnectTimer: null,
  closing: false,

  connect(self) {
    this.closing = false;
    const url = `ws://${self.config.host}:${self.config.port}/ws`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      self.updateStatus(InstanceStatus.ConnectionFailure, e.message);
      this.scheduleReconnect(self);
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      self.log("info", `Connected to srt-router at ${self.config.host}`);
      self.updateStatus(InstanceStatus.Ok);
      // Kinds are not in the pushed state, and they only change when something
      // is added or removed — fetch once per connection rather than per push.
      fetchKinds(self).then((kinds) => {
        self.kinds = kinds;
        self.rebuild();
      });
    });

    ws.on("message", (data) => {
      let state;
      try {
        state = JSON.parse(data.toString());
      } catch (e) {
        self.log("warn", `Unparseable state from router: ${e.message}`);
        return;
      }
      self.applyState(state);
    });

    ws.on("close", () => {
      if (this.closing) return;
      self.updateStatus(InstanceStatus.Disconnected, "Router disconnected");
      this.scheduleReconnect(self);
    });

    ws.on("error", (err) => {
      // A refused connection fires 'error' then 'close'; reconnection is
      // scheduled from 'close' so it is not scheduled twice here.
      self.updateStatus(InstanceStatus.ConnectionFailure, err.message);
    });
  },

  scheduleReconnect(self) {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(self);
    }, RECONNECT_MS);
  },

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        // Closing a socket that never opened throws; nothing to recover.
      }
      this.ws = null;
    }
  },
};

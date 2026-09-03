// Drives the srt-router module's real source against a fake router: a real HTTP
// server for /api/route and the management endpoints, and a real WebSocket
// pushing crosspoint state. Verifies definition shapes, generated crosspoint
// presets, tally feedbacks, and that a 200-with-ok:false is treated as failure.
import http from "node:http";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";

const watchdog = setTimeout(() => {
  console.error("\nTIMED OUT — no completion within 30s.");
  process.exit(2);
}, 30000);
watchdog.unref?.();

const MOD = new URL("../src/", import.meta.url).pathname;
const UpdateActions = (await import(`${MOD}actions.js`)).default;
const UpdateFeedbacks = (await import(`${MOD}feedbacks.js`)).default;
const UpdateVariables = (await import(`${MOD}variables.js`)).default;
const UpdatePresets = (await import(`${MOD}presets.js`)).default;
const { socket } = await import(`${MOD}api.js`);
const { safeId } = await import(`${MOD}main.js`);

// --- the fake router ------------------------------------------------------
const routerState = {
  sources: ["cam1", "cam2", "slate", "ndi-remote"],
  outputs: ["program", "preview"],
  routes: { program: "cam1", preview: "cam2" },
};
const kinds = {
  sources: { cam1: "srt", cam2: "srt", slate: "media", "ndi-remote": "ndi" },
  outputs: { program: "srt", preview: "srt" },
};
const routeCalls = [];
const manageCalls = [];

const body = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === "/api/state") return send(200, routerState);
  if (url.pathname === "/api/manage/transports")
    return send(200, ["srt", "media", "ndi"]);
  if (url.pathname === "/api/manage/sources" && req.method === "GET")
    return send(
      200,
      routerState.sources.map((id) => ({ id, kind: kinds.sources[id] })),
    );
  if (url.pathname === "/api/manage/outputs" && req.method === "GET")
    return send(
      200,
      routerState.outputs.map((id) => ({ id, kind: kinds.outputs[id] })),
    );

  if (url.pathname === "/api/route" && req.method === "POST") {
    const req_ = JSON.parse(await body(req));
    routeCalls.push(req_);
    const classOf = (k) => (k === "srt" || k === "media" ? "raw-ts" : k);
    const ok =
      routerState.outputs.includes(req_.output) &&
      routerState.sources.includes(req_.source);
    if (!ok) {
      // The real router answers 200 with ok:false and NO error string when the
      // crosspoint refuses an unknown id. That is the case worth reproducing.
      return send(200, { ok: false });
    }
    if (
      classOf(kinds.sources[req_.source]) !==
      classOf(kinds.outputs[req_.output])
    ) {
      return send(200, {
        ok: false,
        error: `can't route a ${kinds.sources[req_.source]} source to a ${kinds.outputs[req_.output]} output without transcoding`,
      });
    }
    routerState.routes[req_.output] = req_.source;
    return send(200, { ok: true });
  }

  if (url.pathname.startsWith("/api/manage/")) {
    manageCalls.push(`${req.method} ${url.pathname}`);
    if (req.method === "POST") {
      const parsed = JSON.parse((await body(req)) || "{}");
      const which = url.pathname.endsWith("sources") ? "sources" : "outputs";
      routerState[which].push(parsed.id);
      kinds[which][parsed.id] = parsed.transport;
      return send(200, { ok: true });
    }
    if (req.method === "DELETE") {
      const [, , , which, id] = url.pathname.split("/");
      routerState[which] = routerState[which].filter(
        (x) => x !== decodeURIComponent(id),
      );
      return send(200, { ok: true });
    }
  }
  send(404, { error: "not found" });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify(routerState));
  ws.on("close", () => clients.delete(ws));
});
const push = () => {
  for (const ws of clients) ws.send(JSON.stringify(routerState));
};

// --- the fake instance -----------------------------------------------------
let actions = {};
let feedbacks = {};
let variables = {};
let presetStructure = null;
let presetDefs = null;
const variableValues = {};

const self = {
  config: { host: "127.0.0.1", port: String(PORT), presetlimit: 400 },
  state: { sources: [], outputs: [], routes: {} },
  kinds: { sources: {}, outputs: {}, transports: [] },
  log: (level, msg) => {
    if (level === "error") lastError = msg;
  },
  updateStatus: () => {},
  checkFeedbacks: () => {},
  checkAllFeedbacks: () => {},
  setActionDefinitions: (d) => (actions = d),
  setFeedbackDefinitions: (d) => (feedbacks = d),
  setVariableDefinitions: (d) => (variables = d),
  setPresetDefinitions: (s, p) => {
    presetStructure = s;
    presetDefs = p;
  },
  setVariableValues: (v) => Object.assign(variableValues, v),
  // No parseVariablesInString stub: base 2.x has no such method, so stubbing it
  // here is what let the fleet-wide bug ship green. A reintroduced call now
  // throws in this fixture exactly as it does in Companion.
  //
  // `label` is a STRING, as InstanceBase's `get label()` returns — not the
  // id-annotating helper, which is `entityLabel`. Modelling it the other way
  // round is what hid the shadowing bug from this suite.
  label: "srt-router",
  routedSource(output) {
    return this.state.routes?.[output] ?? "";
  },
  outputsFedBy(source) {
    return this.state.outputs.filter((o) => this.routedSource(o) === source);
  },
  entityLabel(kind, id) {
    const t = this.kinds?.[kind]?.[id];
    return t ? `${id} (${t})` : id;
  },
  rebuild() {
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariables(this);
    UpdatePresets(this);
    this.refreshVariableValues();
  },
  refreshVariableValues() {
    const values = {
      source_count: this.state.sources.length,
      output_count: this.state.outputs.length,
      connection_status:
        socket.ws && socket.ws.readyState === 1 ? "Connected" : "Disconnected",
    };
    for (const o of this.state.outputs)
      values[`routed_${safeId(o)}`] = this.routedSource(o) || "None";
    for (const s of this.state.sources)
      values[`onair_${safeId(s)}`] = this.outputsFedBy(s).length;
    this.setVariableValues(values);
  },
  applyState(state) {
    this.state = {
      sources: state?.sources ?? [],
      outputs: state?.outputs ?? [],
      routes: state?.routes ?? {},
    };
    this.rebuild();
  },
};
let lastError = "";

socket.connect(self);
await new Promise((r) => setTimeout(r, 400));

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}\n       ${e.message}`);
  }
};
const wait = () => new Promise((r) => setTimeout(r, 150));
const fire = (id, options = {}) => actions[id].callback({ options });
const fb = (id, options = {}) => feedbacks[id].callback({ options }, {});

console.log("\n== connection ==");
await check("state arrived over the WebSocket", () => {
  assert.deepEqual(self.state.sources, routerState.sources);
  assert.equal(self.state.routes.program, "cam1");
});
await check("transport kinds were fetched over HTTP", () => {
  assert.equal(self.kinds.sources.slate, "media");
  assert.deepEqual(self.kinds.transports, ["srt", "media", "ndi"]);
});
await check("dropdown labels carry the transport kind", () => {
  assert.equal(self.entityLabel("sources", "slate"), "slate (media)");
});

console.log("\n== definitions ==");
await check("9 actions registered", () =>
  assert.equal(Object.keys(actions).length, 9),
);
await check("5 feedbacks registered", () =>
  assert.equal(Object.keys(feedbacks).length, 5),
);
await check("a variable per output and per source", () => {
  assert.ok(variables.routed_program, "routed_program");
  assert.ok(variables.onair_cam1, "onair_cam1");
  assert.ok(variables.onair_ndi_remote, "onair_ndi_remote (sanitised)");
});
await check("every action has a callback + options array", () => {
  for (const [id, a] of Object.entries(actions)) {
    assert.equal(typeof a.callback, "function", `${id} callback`);
    assert.ok(Array.isArray(a.options), `${id} options`);
  }
});

console.log("\n== presets ==");
await check("a section per output, generated from live state", () => {
  const ids = presetStructure.map((s) => s.id);
  assert.ok(ids.includes("output-program"), ids.join(","));
  assert.ok(ids.includes("output-preview"));
  assert.ok(ids.includes("sources"));
});
await check("a crosspoint preset per output x source", () => {
  for (const o of routerState.outputs)
    for (const s of routerState.sources)
      assert.ok(presetDefs[`xpt_${safeId(o)}_${safeId(s)}`], `${o}/${s}`);
});
await check("every preset is 2.x 'simple' with steps + feedbacks", () => {
  for (const [id, p] of Object.entries(presetDefs)) {
    assert.equal(p.type, "simple", `${id} type`);
    assert.ok(Array.isArray(p.steps) && Array.isArray(p.feedbacks), id);
  }
});
await check("every structure reference resolves to a definition", () => {
  for (const s of presetStructure)
    for (const g of s.definitions)
      for (const ref of g.presets)
        assert.ok(presetDefs[ref], `${s.id} -> ${ref}`);
});
await check("every defined preset is referenced by the structure", () => {
  const referenced = new Set(
    presetStructure.flatMap((s) => s.definitions.flatMap((g) => g.presets)),
  );
  for (const id of Object.keys(presetDefs))
    assert.ok(referenced.has(id), `${id} defined but in no section`);
});
await check("every preset action/feedback id exists", () => {
  for (const [id, p] of Object.entries(presetDefs)) {
    for (const st of p.steps)
      for (const a of st.down)
        assert.ok(actions[a.actionId], `${id} -> ${a.actionId}`);
    for (const f of p.feedbacks)
      assert.ok(feedbacks[f.feedbackId], `${id} -> ${f.feedbackId}`);
  }
});
await check("the preset cap truncates whole outputs, not half a row", () => {
  self.config.presetlimit = 5; // < 4 sources x 2 outputs
  UpdatePresets(self);
  const xptSections = presetStructure.filter((s) => s.id.startsWith("output-"));
  assert.equal(xptSections.length, 1, "one whole output fits in a budget of 5");
  self.config.presetlimit = 400;
  UpdatePresets(self);
});

console.log("\n== tally feedbacks ==");
await check("outputRouted lights on the routed pair", () =>
  assert.equal(fb("outputRouted", { output: "program", source: "cam1" }), true),
);
await check("outputRouted is dark for another source", () =>
  assert.equal(
    fb("outputRouted", { output: "program", source: "cam2" }),
    false,
  ),
);
await check("sourceOnAir lights for a source in use", () =>
  assert.equal(fb("sourceOnAir", { source: "cam1" }), true),
);
await check("sourceOnAir is dark for an unused source", () =>
  assert.equal(fb("sourceOnAir", { source: "slate" }), false),
);
await check("outputUnrouted is dark while routed", () =>
  assert.equal(fb("outputUnrouted", { output: "program" }), false),
);
await check("connected is true", () => assert.equal(fb("connected"), true));

console.log("\n== taking ==");
await check("route takes the source", async () => {
  await fire("route", { output: "program", source: "cam2" });
  push();
  await wait();
  assert.equal(self.routedSource("program"), "cam2");
});
await check("a refused route is logged, not swallowed", async () => {
  lastError = "";
  await fire("route", { output: "program", source: "ndi-remote" });
  await wait();
  assert.match(lastError, /transcoding/);
});
await check(
  "ok:false with no error string still reports something",
  async () => {
    lastError = "";
    await fire("route", { output: "program", source: "nope" });
    await wait();
    assert.match(lastError, /refused/);
  },
);
await check("cycle steps to the next compatible source", async () => {
  // program is on cam2; compatible sources are cam1, cam2, slate (srt+media).
  await fire("routeCycle", {
    output: "program",
    direction: "next",
    compatibleonly: true,
  });
  push();
  await wait();
  assert.equal(self.routedSource("program"), "slate");
});
await check(
  "cycle skips the incompatible NDI source when wrapping",
  async () => {
    await fire("routeCycle", {
      output: "program",
      direction: "next",
      compatibleonly: true,
    });
    push();
    await wait();
    assert.equal(self.routedSource("program"), "cam1");
  },
);
await check("cycle previous walks back", async () => {
  await fire("routeCycle", {
    output: "program",
    direction: "previous",
    compatibleonly: true,
  });
  push();
  await wait();
  assert.equal(self.routedSource("program"), "slate");
});
await check("salvo takes every output it can", async () => {
  await fire("routeAll", { source: "cam1" });
  push();
  await wait();
  assert.equal(self.routedSource("program"), "cam1");
  assert.equal(self.routedSource("preview"), "cam1");
});
await check("salvo to several outputs", async () => {
  await fire("routeMany", { outputs: ["preview"], source: "cam2" });
  push();
  await wait();
  assert.equal(self.routedSource("preview"), "cam2");
  assert.equal(self.routedSource("program"), "cam1");
});
await check("sourceOnOutputCount catches a source on 2+ outputs", async () => {
  await fire("routeAll", { source: "cam1" });
  push();
  await wait();
  assert.equal(fb("sourceOnOutputCount", { source: "cam1", count: 2 }), true);
});

console.log("\n== management ==");
await check("adding a source rebuilds the choice lists", async () => {
  await fire("addSource", {
    body: '{"id":"cam9","transport":"srt","mode":"listener","bind":"0.0.0.0:5009"}',
  });
  push();
  await wait();
  assert.ok(self.state.sources.includes("cam9"));
  assert.ok(presetDefs[`xpt_program_cam9`], "a crosspoint preset appeared");
});
await check("removing a source rebuilds the choice lists", async () => {
  await fire("removeSource", { id: "cam9" });
  push();
  await wait();
  assert.ok(!self.state.sources.includes("cam9"));
  assert.ok(!presetDefs[`xpt_program_cam9`], "its preset went away");
});

console.log("\n== variables ==");
await check("routed_/onair_ variables track the crosspoint", () => {
  self.refreshVariableValues();
  assert.equal(variableValues.routed_program, "cam1");
  assert.equal(variableValues.onair_cam1, 2);
  assert.equal(variableValues.onair_slate, 0);
  assert.equal(variableValues.connection_status, "Connected");
});

console.log("\n== teardown ==");
await check("close() settles", async () => {
  socket.close();
  await wait();
  assert.equal(socket.ws, null);
});

wss.close();
server.close();
console.log("\n== the checkFeedbacks trap ==");
// InstanceBase.checkFeedbacks(type, ...rest) requires AT LEAST ONE type: with no
// arguments it forwards [undefined] to the host, which checks a feedback type
// called "undefined" — i.e. nothing at all. Every feedback then sits frozen at
// whatever it last evaluated to, with no error anywhere. checkAllFeedbacks() is
// the correct call for "re-evaluate everything".
await check("no bare checkFeedbacks() survives in src/", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../src/", import.meta.url).pathname;
  const offenders = [];
  for (const f of readdirSync(dir)) {
    if (!/\.(js|ts)$/.test(f)) continue;
    const body = readFileSync(dir + f, "utf8");
    if (/[^A-Za-z]checkFeedbacks\(\s*\)/.test(body)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "use checkAllFeedbacks() instead");
});

// --- the two base-2.x traps -------------------------------------------------
// `parseVariablesInString` / `parseVariablesInField` were removed in
// @companion-module/base 2.x — they are not on the callback context, not on
// InstanceBase, not exported anywhere in the package. Companion expands a
// `useVariables` option itself before invoking the callback, so the call is
// redundant as well as fatal: it throws "... is not a function" the moment that
// one action fires, while the module still loads and every other path keeps
// working. The fixture above no longer stubs them, which catches any path the
// suite exercises; this grep is the backstop for the paths it does not. It
// matches the call form only, so prose naming the functions stays legal.
const srcFiles = async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../src/", import.meta.url).pathname;
  return readdirSync(dir)
    .filter((f) => /\.(js|ts)$/.test(f))
    .map((f) => [f, readFileSync(dir + f, "utf8")]);
};

await check(
  "no parseVariablesInString/Field call survives in src/",
  async () => {
    const bad = (await srcFiles())
      .filter(([, body]) => /parseVariablesIn(String|Field)\s*\(/.test(body))
      .map(([f]) => f);
    assert.deepEqual(
      bad,
      [],
      "read the already-resolved event.options value instead",
    );
  },
);

// InstanceBase defines `get label()`. An own method of the same name sits
// earlier in the prototype chain and replaces it, so `self.label` becomes the
// function and every `$(${self.label}:var)` in presets.js stringifies its
// source. The id-annotating helper is `entityLabel` for exactly this reason.
await check(
  "ModuleInstance does not shadow InstanceBase's label getter",
  async () => {
    const bad = (await srcFiles())
      .filter(([, body]) => /^\s{2}label\s*\(/m.test(body))
      .map(([f]) => f);
    assert.deepEqual(
      bad,
      [],
      "name it entityLabel — `label` is the connection's",
    );
  },
);

// The symptom the shadowing produced, asserted directly: a preset whose text
// carries a variable reference must name the connection, not a function body.
await check(
  "preset variable references resolve to the connection label",
  () => {
    const withVars = Object.entries(presetDefs).filter(([, p]) =>
      /\$\(/.test(p.style?.text ?? ""),
    );
    assert.ok(
      withVars.length > 0,
      "expected at least one preset with a variable",
    );
    for (const [id, p] of withVars) {
      const text = p.style.text;
      assert.ok(
        !/=>|\bfunction\b|\breturn\b/.test(text),
        `${id}: preset text contains a stringified function: ${text}`,
      );
      assert.ok(
        text.includes(`$(${self.label}:`),
        `${id}: expected $(${self.label}:...), got ${text}`,
      );
    }
  },
);

// Companion keys an installed module on id + version and discards a reinstall
// whose pair it already has. If companion/manifest.json lags package.json, every
// release after the manifest's version is silently refused by any Companion that
// already has the module — the update appears to work and changes nothing.
await check(
  "companion/manifest.json version matches package.json",
  async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p) =>
      JSON.parse(readFileSync(new URL(p, import.meta.url).pathname, "utf8"));
    assert.equal(
      read("../companion/manifest.json").version,
      read("../package.json").version,
      "bump both, or the release never reaches an existing install",
    );
  },
);

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

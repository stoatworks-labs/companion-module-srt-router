import { InstanceBase, Regex, InstanceStatus } from "@companion-module/base";
import { UpgradeScripts } from "./upgrades.js";
import UpdateActions from "./actions.js";
import UpdateFeedbacks from "./feedbacks.js";
import UpdateVariableDefinitions from "./variables.js";
import UpdatePresets from "./presets.js";
import { socket } from "./api.js";

/** Companion variable ids allow only [a-zA-Z0-9_]. Router ids come from a TOML
 *  config written by hand, so they can contain anything — "cam-1" and "cam.1"
 *  are both plausible and both illegal here. Collisions after sanitising are
 *  possible in principle ("cam-1" and "cam.1" both become "cam_1"); the router
 *  guarantees unique ids, not unique sanitised ids, so the last one written
 *  wins. Rename the router's ids if that ever bites. */
export function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, "_");
}

function defaultState() {
  return { sources: [], outputs: [], routes: {} };
}

export default class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.state = defaultState();
    this.kinds = { sources: {}, outputs: {}, transports: [] };
  }

  async init(config) {
    this.config = config;
    this.state = defaultState();
    this.updateStatus(InstanceStatus.Connecting);
    this.rebuild();
    socket.connect(this);
  }

  async destroy() {
    socket.close();
  }

  async configUpdated(config) {
    this.config = config;
    socket.close();
    this.state = defaultState();
    this.kinds = { sources: {}, outputs: {}, transports: [] };
    this.updateStatus(InstanceStatus.Connecting);
    socket.connect(this);
  }

  getConfigFields() {
    return [
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Connection",
        value:
          "Point this at the address in the router's <code>[web] bind</code>. <b>There is no authentication</b> — anyone who can reach the port can re-route any output and remove sources. Keep it on a management interface.",
      },
      {
        type: "textinput",
        id: "host",
        label: "Router host",
        width: 8,
        default: "127.0.0.1",
        regex: Regex.HOSTNAME,
      },
      {
        type: "textinput",
        id: "port",
        label: "Port",
        width: 4,
        default: "8080",
        regex: Regex.PORT,
      },
      {
        type: "static-text",
        id: "presetinfo",
        width: 12,
        label: "Presets",
        value:
          "Crosspoint presets are generated from whatever the router currently has, one section per output. A router with a large matrix is capped (see the limit below) so the preset list stays usable.",
      },
      {
        type: "number",
        id: "presetlimit",
        label: "Max crosspoint presets",
        width: 6,
        min: 0,
        max: 2000,
        default: 400,
      },
    ];
  }

  /**
   * Take a pushed state object and fan the consequences out.
   *
   * Membership changes (a source added or removed) have to re-register actions,
   * feedbacks, variables and presets, because all four are built from the live
   * lists. A routing-only change does not — and routing changes are by far the
   * more frequent, so distinguishing them keeps a busy router from rebuilding
   * every definition several times a second.
   */
  applyState(state) {
    const next = {
      sources: Array.isArray(state?.sources) ? state.sources : [],
      outputs: Array.isArray(state?.outputs) ? state.outputs : [],
      routes: state?.routes ?? {},
    };
    const membershipChanged =
      JSON.stringify(next.sources) !== JSON.stringify(this.state.sources) ||
      JSON.stringify(next.outputs) !== JSON.stringify(this.state.outputs);

    this.state = next;
    this.updateStatus(InstanceStatus.Ok);

    if (membershipChanged) {
      this.rebuild();
    } else {
      this.refreshVariableValues();
      this.checkAllFeedbacks();
    }
  }

  /** Re-register everything derived from the router's current entity lists. */
  rebuild() {
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariableDefinitions(this);
    UpdatePresets(this);
    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  /** The source currently feeding an output, or "" when unrouted. */
  routedSource(output) {
    return this.state.routes?.[output] ?? "";
  }

  /** Every output this source is currently feeding. A source may feed many
   *  outputs; an output has exactly one source. That asymmetry is the
   *  crosspoint model and it drives the two tally feedbacks. */
  outputsFedBy(source) {
    return this.state.outputs.filter((o) => this.routedSource(o) === source);
  }

  label(kind, id) {
    const transport = this.kinds?.[kind]?.[id];
    return transport ? `${id} (${transport})` : id;
  }

  refreshVariableValues() {
    const values = {
      source_count: this.state.sources.length,
      output_count: this.state.outputs.length,
      connection_status:
        socket.ws && socket.ws.readyState === 1 ? "Connected" : "Disconnected",
    };
    for (const output of this.state.outputs) {
      values[`routed_${safeId(output)}`] = this.routedSource(output) || "None";
    }
    for (const source of this.state.sources) {
      values[`onair_${safeId(source)}`] = this.outputsFedBy(source).length;
    }
    this.setVariableValues(values);
  }
}

export { UpgradeScripts };

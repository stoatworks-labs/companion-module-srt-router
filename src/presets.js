// Variable references in preset text use `self.label`, the CONNECTION's label,
// not the module id. Companion resolves $(label:variable) against whatever the
// operator named this connection — hardcoding the module id produces buttons
// that render the raw $(...) text on any connection that has been renamed, and
// on a second instance of the same module.
import { safeId } from "./main.js";

// Crosspoint presets are GENERATED from the router's live entity lists, not
// hand-written, because a router's sources and outputs are its whole
// configuration — a fixed preset list would be wrong for every installation.
//
// The cost is that presets appear only once the module has connected and
// received a state push. Before that the list is just the salvo and status
// buttons, which is the honest position: the module does not yet know what
// outputs exist, and offering "Route Output 1" when there may be no Output 1
// invites a button that quietly routes nothing.
//
// Section per output, preset per source — the layout a router control panel
// already has, so a row of buttons is one section dragged out.

const WHITE = 0xffffff;
const BLACK = 0x000000;
const RED = 0xcc0000;
const GREY = 0x333333;
const AMBER = 0xcc7a00;
const DARKGREEN = 0x003300;
const BRIGHTGREEN = 0x00ff00;

function preset({
  name,
  text,
  size = "14",
  color = WHITE,
  bgcolor = GREY,
  actions = [],
  feedbacks = [],
}) {
  return {
    type: "simple",
    name,
    style: { text, size, color, bgcolor, show_topbar: false },
    steps: [{ down: actions, up: [] }],
    feedbacks,
  };
}

export default function UpdatePresets(self) {
  const presets = {};
  const structure = [];

  const outputs = self.state.outputs;
  const sources = self.state.sources;

  // The cap exists because a 32x32 router would otherwise generate 1024 preset
  // definitions, which makes the preset browser unusable and slows every
  // rebuild. Outputs are kept whole rather than truncated mid-row: half a
  // crosspoint row is more confusing than a missing one.
  const limit = Number(self.config?.presetlimit ?? 400);
  let budget = Number.isFinite(limit) && limit >= 0 ? limit : 400;
  let truncated = false;

  for (const output of outputs) {
    if (sources.length === 0) break;
    if (budget < sources.length) {
      truncated = true;
      break;
    }
    budget -= sources.length;

    const refs = [];
    for (const source of sources) {
      const id = `xpt_${safeId(output)}_${safeId(source)}`;
      presets[id] = preset({
        name: `${output} <- ${source}`,
        text: `${source}`,
        bgcolor: BLACK,
        actions: [{ actionId: "route", options: { output, source } }],
        feedbacks: [
          {
            feedbackId: "outputRouted",
            options: { output, source },
            style: { bgcolor: RED, color: WHITE },
          },
        ],
      });
      refs.push(id);
    }

    const cycleNext = `cycle_next_${safeId(output)}`;
    const cyclePrev = `cycle_prev_${safeId(output)}`;
    presets[cycleNext] = preset({
      name: `${output}: next source`,
      text: `${output}\nNEXT`,
      actions: [
        {
          actionId: "routeCycle",
          options: { output, direction: "next", compatibleonly: true },
        },
      ],
    });
    presets[cyclePrev] = preset({
      name: `${output}: previous source`,
      text: `${output}\nPREV`,
      actions: [
        {
          actionId: "routeCycle",
          options: { output, direction: "previous", compatibleonly: true },
        },
      ],
    });

    const display = `routed_${safeId(output)}`;
    presets[display] = preset({
      name: `${output}: what is on it (no action)`,
      text: `${output}\n$(${self.label}:routed_${safeId(output)})`,
      bgcolor: BLACK,
      color: AMBER,
      feedbacks: [
        {
          feedbackId: "outputUnrouted",
          options: { output },
          style: { bgcolor: 0x666666, color: WHITE },
        },
      ],
    });

    structure.push({
      id: `output-${safeId(output)}`,
      name: `Output: ${output}`,
      description: `Take any source to ${output}. Red is on air.`,
      definitions: [
        {
          id: `output-${safeId(output)}-xpt`,
          type: "simple",
          name: "Crosspoint",
          presets: refs,
        },
        {
          id: `output-${safeId(output)}-nav`,
          type: "simple",
          name: "Step and display",
          presets: [cycleNext, cyclePrev, display],
        },
      ],
      keywords: ["crosspoint", "take", "route", output],
    });
  }

  // --- Source tally --------------------------------------------------------
  if (sources.length > 0) {
    const tallyRefs = [];
    for (const source of sources) {
      const id = `tally_${safeId(source)}`;
      presets[id] = preset({
        name: `${source}: on air tally`,
        text: `${source}\n$(${self.label}:onair_${safeId(source)}) out`,
        bgcolor: BLACK,
        feedbacks: [
          {
            feedbackId: "sourceOnAir",
            options: { source },
            style: { bgcolor: RED, color: WHITE },
          },
        ],
      });
      tallyRefs.push(id);

      const salvoId = `salvo_${safeId(source)}`;
      presets[salvoId] = preset({
        name: `Salvo: every output to ${source}`,
        text: `ALL\n${source}`,
        bgcolor: AMBER,
        color: BLACK,
        actions: [{ actionId: "routeAll", options: { source } }],
      });
      tallyRefs.push(salvoId);
    }
    structure.push({
      id: "sources",
      name: "Sources",
      description:
        "Source-side tally — a source may feed several outputs at once. Check this before re-pointing or removing one.",
      definitions: [
        {
          id: "sources-tally",
          type: "simple",
          name: "Tally and salvo",
          presets: tallyRefs,
        },
      ],
      keywords: ["tally", "salvo", "source"],
    });
  }

  // --- Status --------------------------------------------------------------
  presets.connected = preset({
    name: "Router is connected",
    text: `ROUTER\n$(${self.label}:connection_status)`,
    bgcolor: RED,
    feedbacks: [
      {
        feedbackId: "connected",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });
  presets.counts = preset({
    name: "Source and output counts (no action)",
    text: `$(${self.label}:source_count) src\n$(${self.label}:output_count) out`,
    bgcolor: BLACK,
  });
  presets.refresh = preset({
    name: "Refresh transports and entity list",
    text: "REFRESH",
    actions: [{ actionId: "refresh", options: {} }],
  });

  structure.push({
    id: "status",
    name: "Status",
    description: truncated
      ? "Crosspoint presets were capped — raise 'Max crosspoint presets' in the connection config to generate the rest."
      : "Put the connection button on any page carrying tally colour: every other feedback holds its last known value while the router is unreachable.",
    definitions: [
      {
        id: "status-main",
        type: "simple",
        name: "Status",
        presets: ["connected", "counts", "refresh"],
      },
    ],
  });

  if (truncated) {
    self.log(
      "warn",
      `Crosspoint presets capped at ${limit}; ${outputs.length} outputs x ${sources.length} sources would need ${outputs.length * sources.length}. Raise the limit in the connection config to generate the rest.`,
    );
  }

  self.setPresetDefinitions(structure, presets);
}

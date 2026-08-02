import { outputChoices, sourceChoices, firstId } from "./choices.js";
import { socket } from "./api.js";

// Two tallies, matching the two sides of the crosspoint:
//
//   outputRouted  "this output is on that source"  — the destination-side tally,
//                 what a crosspoint grid button lights on.
//   sourceOnAir   "this source is feeding something" — the source-side tally,
//                 what tells an operator a feed is live before pulling it.
//
// Unlike the OSC modules in this fleet, these do NOT go stale silently: the
// router pushes state over a WebSocket, so a dropped connection is detectable
// and "Router is connected" is a real signal rather than a heartbeat guess.
// Feedbacks still hold their last value while disconnected — deliberately, so a
// brief blip does not blank a crosspoint page mid-show — which is exactly why
// that connection feedback is worth a button of its own.

export default function UpdateFeedbacks(self) {
  const outputs = outputChoices(self);
  const sources = sourceChoices(self);

  self.setFeedbackDefinitions({
    outputRouted: {
      type: "boolean",
      name: "Output is routed to a source (crosspoint tally)",
      description:
        "The destination-side tally. This is what a crosspoint grid button lights on.",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [
        {
          id: "output",
          type: "dropdown",
          label: "Output",
          choices: outputs,
          default: firstId(outputs),
          allowCustom: true,
        },
        {
          id: "source",
          type: "dropdown",
          label: "Source",
          choices: sources,
          default: firstId(sources),
          allowCustom: true,
        },
      ],
      callback: (feedback) =>
        self.routedSource(String(feedback.options.output ?? "")) ===
        String(feedback.options.source ?? ""),
    },

    sourceOnAir: {
      type: "boolean",
      name: "Source is feeding at least one output",
      description:
        "The source-side tally. A source may feed many outputs at once, so this is the check worth making before removing or re-pointing it.",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [
        {
          id: "source",
          type: "dropdown",
          label: "Source",
          choices: sources,
          default: firstId(sources),
          allowCustom: true,
        },
      ],
      callback: (feedback) =>
        self.outputsFedBy(String(feedback.options.source ?? "")).length > 0,
    },

    sourceOnOutputCount: {
      type: "boolean",
      name: "Source is feeding at least N outputs",
      description:
        "For spotting a source that has quietly been taken to more outputs than intended.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [
        {
          id: "source",
          type: "dropdown",
          label: "Source",
          choices: sources,
          default: firstId(sources),
          allowCustom: true,
        },
        {
          id: "count",
          type: "number",
          label: "At least",
          min: 1,
          max: 64,
          default: 2,
        },
      ],
      callback: (feedback) =>
        self.outputsFedBy(String(feedback.options.source ?? "")).length >=
        Number(feedback.options.count ?? 1),
    },

    outputUnrouted: {
      type: "boolean",
      name: "Output has no source",
      description:
        "Rare in normal running — an output keeps its source until something changes it — so this usually means the output was just added, or its source was removed underneath it.",
      defaultStyle: { bgcolor: 0x666666, color: 0xffffff },
      options: [
        {
          id: "output",
          type: "dropdown",
          label: "Output",
          choices: outputs,
          default: firstId(outputs),
          allowCustom: true,
        },
      ],
      callback: (feedback) =>
        !self.routedSource(String(feedback.options.output ?? "")),
    },

    connected: {
      type: "boolean",
      name: "Router is connected",
      description:
        "The state WebSocket is open. Every other feedback holds its last known value while this is dark, so put it on any page carrying tally colour.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => !!socket.ws && socket.ws.readyState === 1,
    },
  });
}

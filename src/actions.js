import { route, addEntity, removeEntity, fetchKinds } from "./api.js";
import { outputChoices, sourceChoices, firstId } from "./choices.js";

// The crosspoint model in one line: an output has exactly one source; a source
// may feed many outputs. Every action here follows from that — there is no
// "unroute" verb, because an output always has a source, and no "take source
// off air", because a source is off air only when nothing points at it.

export default function UpdateActions(self) {
  const outputs = outputChoices(self);
  const sources = sourceChoices(self);

  /** Resolve an output field, allowing a typed/variable id so a button can
   *  survive the dropdown being empty at edit time (a router that was offline
   *  when the button was built).
   *
   *  An option declared `useVariables: true` arrives already expanded —
   *  Companion resolves it before invoking the callback. `parseVariablesInString`
   *  does not exist in @companion-module/base 2.x, neither on the callback
   *  context nor on InstanceBase, so calling it was both redundant and fatal:
   *  every Take, Cycle, Salvo and Management action threw the moment it fired. */
  const resolve = (event, key) => String(event.options[key] ?? "").trim();

  const take = async (output, source) => {
    try {
      await route(self, output, source);
    } catch (e) {
      // Surfaced rather than swallowed: the commonest failure is a payload
      // mismatch (NDI source to an SRT output), which is a real refusal the
      // operator needs to see, not a transient.
      self.log("error", e.message);
    }
  };

  self.setActionDefinitions({
    route: {
      name: "Take: route an output to a source",
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
      callback: async (event) => {
        const output = resolve(event, "output");
        const source = resolve(event, "source");
        if (!output || !source) return;
        await take(output, source);
      },
    },

    routeCycle: {
      name: "Take: cycle an output through the sources",
      description:
        "Steps the chosen output to the next (or previous) source in the router's list, wrapping at the ends. Two of these make an up/down pair on a surface.",
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
          id: "direction",
          type: "dropdown",
          label: "Direction",
          choices: [
            { id: "next", label: "Next" },
            { id: "previous", label: "Previous" },
          ],
          default: "next",
        },
        {
          id: "compatibleonly",
          type: "checkbox",
          label: "Skip sources this output cannot take",
          default: true,
          tooltip:
            "Uses the transport kinds from the management API. With it off, cycling can land on a source the router refuses, and the step is simply lost.",
        },
      ],
      callback: async (event) => {
        const output = resolve(event, "output");
        if (!output) return;

        let list = self.state.sources;
        if (event.options.compatibleonly) {
          const outKind = self.kinds?.outputs?.[output];
          // srt and media share a payload class (both are plain MPEG-TS), which
          // is why a stills slate can feed an SRT output. Anything else only
          // matches itself. Mirrors payload_compatible() in the router's
          // crates/web/src/lib.rs — if that grouping changes, change this.
          const classOf = (k) => (k === "srt" || k === "media" ? "raw-ts" : k);
          if (outKind) {
            const filtered = list.filter((s) => {
              const srcKind = self.kinds?.sources?.[s];
              return !srcKind || classOf(srcKind) === classOf(outKind);
            });
            // An empty filter means the kinds are unknown or nothing matches;
            // falling back to the full list keeps the button doing something
            // rather than silently dying.
            if (filtered.length > 0) list = filtered;
          }
        }
        if (list.length === 0) return;

        const current = self.routedSource(output);
        const at = list.indexOf(current);
        const step = event.options.direction === "previous" ? -1 : 1;
        // indexOf === -1 (current source not in the list) lands on index 0 for
        // "next", which is the useful behaviour: the button recovers rather
        // than refusing because the output is on something unexpected.
        const next = list[(at + step + list.length) % list.length];
        await take(output, next);
      },
    },

    routeAll: {
      name: "Salvo: route every output to one source",
      description:
        "Takes the same source to every output the router has. Outputs that cannot carry that payload are skipped and logged, so one incompatible output does not abandon the salvo half-done.",
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
      callback: async (event) => {
        const source = resolve(event, "source");
        if (!source) return;
        for (const output of self.state.outputs) {
          try {
            await route(self, output, source);
          } catch (e) {
            self.log("warn", `Salvo skipped ${output}: ${e.message}`);
          }
        }
      },
    },

    routeMany: {
      name: "Salvo: route several outputs to one source",
      options: [
        {
          id: "outputs",
          type: "multidropdown",
          label: "Outputs",
          choices: outputs,
          default: [],
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
      callback: async (event) => {
        const source = resolve(event, "source");
        const list = Array.isArray(event.options.outputs)
          ? event.options.outputs
          : [];
        if (!source || list.length === 0) return;
        for (const output of list) {
          try {
            await route(self, output, source);
          } catch (e) {
            self.log("warn", `Salvo skipped ${output}: ${e.message}`);
          }
        }
      },
    },

    // --- Runtime management ------------------------------------------------
    // Config-defined and API-added entities are the same thing once running,
    // so these can remove something declared in the router's TOML. There is no
    // undo and removal frees the port.
    addSource: {
      name: "Management: add a source",
      description:
        "The body mirrors the router's config file for that entity — a transport tag plus that transport's fields. Written as JSON because the shape varies per transport and a fixed form would go stale the moment a backend is added.",
      options: [
        {
          id: "body",
          type: "textinput",
          label: "Source JSON",
          default:
            '{"id":"cam3","transport":"srt","mode":"listener","bind":"0.0.0.0:5003"}',
          useVariables: true,
          width: 12,
        },
      ],
      callback: async (event) => {
        const raw = String(event.options.body ?? "");
        try {
          await addEntity(self, "sources", JSON.parse(raw));
          self.kinds = await fetchKinds(self);
          self.rebuild();
        } catch (e) {
          self.log("error", `Add source failed: ${e.message}`);
        }
      },
    },

    addOutput: {
      name: "Management: add an output",
      description:
        "Requires default_source. 'media' is rejected — it is an input-only transport with no output side.",
      options: [
        {
          id: "body",
          type: "textinput",
          label: "Output JSON",
          default:
            '{"id":"preview","transport":"srt","mode":"listener","bind":"0.0.0.0:6002","default_source":"cam1"}',
          useVariables: true,
          width: 12,
        },
      ],
      callback: async (event) => {
        const raw = String(event.options.body ?? "");
        try {
          await addEntity(self, "outputs", JSON.parse(raw));
          self.kinds = await fetchKinds(self);
          self.rebuild();
        } catch (e) {
          self.log("error", `Add output failed: ${e.message}`);
        }
      },
    },

    removeSource: {
      name: "Management: remove a source",
      description:
        "Tears the listener down and frees its port. This is not a registry delete and there is no undo.",
      options: [
        {
          id: "id",
          type: "dropdown",
          label: "Source",
          choices: sources,
          default: firstId(sources),
          allowCustom: true,
        },
      ],
      callback: async (event) => {
        const id = resolve(event, "id");
        if (!id) return;
        try {
          await removeEntity(self, "sources", id);
          self.kinds = await fetchKinds(self);
          self.rebuild();
        } catch (e) {
          self.log("error", e.message);
        }
      },
    },

    removeOutput: {
      name: "Management: remove an output",
      options: [
        {
          id: "id",
          type: "dropdown",
          label: "Output",
          choices: outputs,
          default: firstId(outputs),
          allowCustom: true,
        },
      ],
      callback: async (event) => {
        const id = resolve(event, "id");
        if (!id) return;
        try {
          await removeEntity(self, "outputs", id);
          self.kinds = await fetchKinds(self);
          self.rebuild();
        } catch (e) {
          self.log("error", e.message);
        }
      },
    },

    refresh: {
      name: "Refresh transports and entity list",
      description:
        "Re-reads the management API. Routing already arrives on its own; this is for picking up transport kinds after something changed outside Companion.",
      options: [],
      callback: async () => {
        self.kinds = await fetchKinds(self);
        self.rebuild();
      },
    },
  });
}

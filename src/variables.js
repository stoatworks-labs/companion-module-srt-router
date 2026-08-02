import { safeId } from "./main.js";

// Rebuilt whenever the router's entity lists change (main.js applyState), not
// on every routing change — the definition SET only moves when a source or
// output comes or goes. Values are refreshed separately and much more often.
//
// A router that has never been reachable has no per-entity variables at all,
// rather than a set reading "None". That is the honest state: the module does
// not know what outputs exist, and inventing names for them would put labels on
// buttons that route nothing.
export default function UpdateVariableDefinitions(self) {
  const defs = {
    connection_status: { name: "Connection status" },
    source_count: { name: "Number of sources" },
    output_count: { name: "Number of outputs" },
  };
  for (const output of self.state.outputs) {
    defs[`routed_${safeId(output)}`] = {
      name: `Source routed to output "${output}"`,
    };
  }
  for (const source of self.state.sources) {
    defs[`onair_${safeId(source)}`] = {
      name: `Outputs fed by source "${source}"`,
    };
  }
  self.setVariableDefinitions(defs);
}

// Dropdown lists built from the last pushed crosspoint state, shared between
// actions, feedbacks and presets so all three stay in step with whatever the
// router currently has. Ids are annotated with their transport kind where the
// management API supplied one — the router refuses a route between incompatible
// payloads, and "cam1 (ndi)" next to "program (srt)" makes that refusal
// predictable instead of a surprise at press time.

export function outputChoices(self) {
  return self.state.outputs.map((id) => ({
    id,
    label: self.label("outputs", id),
  }));
}

export function sourceChoices(self) {
  return self.state.sources.map((id) => ({
    id,
    label: self.label("sources", id),
  }));
}

/** Choice lists are empty until the first state arrives. A dropdown whose
 *  `default` indexes into an empty array yields undefined, which Companion
 *  renders as a blank field the operator cannot tell from a cleared one — so
 *  callers use `?? ""` rather than assuming an entry exists. */
export function firstId(choices) {
  return choices[0]?.id ?? "";
}

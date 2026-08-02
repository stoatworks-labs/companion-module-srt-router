# AGENTS.md — bringing an LLM up to speed on this Companion module

Orientation for an AI assistant (or a new human) picking this project up cold. There is no
`CLAUDE.md` here; this is the entry point.

---

## 1. What this is

A **Bitfocus Companion connection module** for **srt-router**, the crosspoint-based SRT/NDI
router. It takes sources to outputs, cycles, fires salvos, and manages entities at runtime,
with crosspoint and source tally.

JavaScript, Node 22 runtime, `@companion-module/base` 2.x.

## 2. Two channels, carrying different things

```
             ┌── ws://host:port/ws ──── crosspoint state, pushed
this module ─┤
             └── http://host:port ───── commands, and transport KINDS
```

The router's `/ws` handler (`crates/web/src/lib.rs::push_state`) re-snapshots every 200 ms
and sends only when the serialised state changed. That covers **routing and membership** —
a source added through the management API appears without a separate poll, so the module
does not poll HTTP for state at all.

**Transport kinds are not in the state object.** They come from
`/api/manage/{sources,outputs}` and are fetched once per connection, because they only
change when something is added or removed. They exist to label dropdowns and to drive
Cycle's compatibility filter.

## 3. The router's failure convention

`POST /api/route` answers **HTTP 200 with `{"ok": false}`** for a refusal — checking only
the status code reports every refusal as a success. Worse, when the crosspoint refuses
(an id that does not exist) `post_route` returns `ok: false` with **`error: None`**, so the
body carries no message at all. `src/api.js::route` supplies one; without it an operator
gets an empty failure.

## 4. `payload_compatible` is duplicated, deliberately, and must be kept in step

`crates/web/src/lib.rs::payload_compatible` groups `srt` and `media` into one class
("raw-ts"), because a media source publishes plain MPEG-TS — byte-for-byte what an SRT relay
carries. Everything else only matches itself.

`src/actions.js`'s Cycle action reimplements that grouping so it can _skip_ sources the
output would refuse. **If the router's grouping changes, change it here too.** The failure
mode is quiet: Cycle lands on a source the router refuses and the step is lost, which looks
like a dead button rather than a wrong one.

## 5. Presets are generated, not written

A router's sources and outputs _are_ its configuration, so a fixed preset list would be
wrong for every installation. `src/presets.js` builds a section per output with a crosspoint
button per source.

Consequences to preserve:

- **No crosspoint presets exist until the module has connected.** That is honest — the
  module does not know what outputs exist — and should not be papered over with placeholders.
- **The cap truncates whole outputs.** Half a crosspoint row is more confusing than a missing
  one. It also logs the number that would have been needed.
- **Preset ids must stay stable** across rebuilds (`xpt_<output>_<source>`, sanitised), or a
  button an operator already placed loses its link.

## 6. Traps already paid for

- **`@companion-module/base` 2.x presets are `setPresetDefinitions(structure, definitions)`**
  with `type: 'simple'`. The 1.x `category` field on a definition still loads — the presets
  just never appear, which reads as a rendering bug rather than a schema mistake.
- **Companion variable ids allow only `[a-zA-Z0-9_]`.** Router ids come from hand-written
  TOML, so `ndi-remote` is normal and illegal. `safeId()` in `main.js` sanitises; note it can
  in principle collide (`cam-1` and `cam.1` both become `cam_1`) since the router guarantees
  unique ids, not unique sanitised ids.
- **Rebuilding on every push is wasteful.** `applyState` distinguishes a membership change
  (re-register everything, because all four definition sets derive from the entity lists)
  from a routing change (values and feedbacks only). Routing changes are the frequent ones.

## 7. Deliberate omissions — do not "fix" these

- **No "unroute" action.** The crosspoint model gives every output exactly one source; there
  is no null state to command.
- **Feedbacks do not go dark on disconnect.** They hold their last known value so a brief
  blip does not blank a crosspoint page mid-show. The `connected` feedback is the honest
  signal, and the docs tell operators to put it on any page carrying tally colour.
- **Add actions take raw JSON, not a form.** The body shape varies per transport, and a fixed
  form goes stale the moment a backend is added.

## 8. Context that matters

This routes live video. A button press here changes what an audience sees, and
`Management: remove` frees a port with no undo. Prefer failing safe and surfacing refusals
loudly — a take that silently did not happen is the worst outcome.

## 9. Conventions

- Not in the official Companion module store — installs via **Settings → Developer modules
  path**.
- `npm test` drives the real source against a fake router (real HTTP + real WebSocket). Add
  to it rather than testing by hand against a live router.
- Ships a user-facing AI-assisted disclaimer.
- "Commit" means commit **and** push.

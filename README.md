# companion-module-srt-router

> **AI-assisted project.** This module was built with the help of
> [Claude](https://claude.ai), Anthropic's AI assistant — including
> implementation and documentation. Review it accordingly before relying on
> it in production.

A [Bitfocus Companion](https://bitfocus.io/companion) connection module for
[srt-router](https://github.com/stoatworks-labs/srt-router) — drive the
crosspoint from a Stream Deck: take any source to any output, cycle, fire a
salvo, and add or remove sources and outputs at runtime.

<!-- downloads:start -->

## Download

**[v1.0.0](https://github.com/stoatworks-labs/companion-module-srt-router/releases/tag/v1.0.0)**

This release contains:

- [`companion-module-srt-router-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-srt-router/releases/latest/download/companion-module-srt-router-pkg.tgz) — npm package, 24 KB
- [`srt-router-1.0.0.tgz`](https://github.com/stoatworks-labs/companion-module-srt-router/releases/download/v1.0.0/srt-router-1.0.0.tgz) — npm package, 23 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-srt-router/releases](https://github.com/stoatworks-labs/companion-module-srt-router/releases).

<!-- downloads:end -->

## What it does

- **Actions** — take (route an output to a source), cycle an output through the
  source list forward/back, salvo one source to every output or to a chosen set,
  add/remove sources and outputs at runtime, and refresh the transport list.
- **Feedbacks** — crosspoint tally (output is on source X), source-side tally
  (this source is feeding something), source is feeding at least N outputs,
  output has no source, and router is connected.
- **Variables** — one per output (what is on it), one per source (how many
  outputs it feeds), plus counts and connection status.
- **Presets** — **generated from the router's live configuration**: one section
  per output containing a crosspoint button per source with tally pre-wired,
  plus next/previous and a display button; a Sources section with per-source
  tally and salvo; and Status.

## Setting it up

Point the module at the address in the router's `[web] bind` (the example config
uses `0.0.0.0:8080`).

> **There is no authentication.** Anyone who can reach that port can re-route
> any output and remove sources and outputs. Bind it to a management interface
> or firewall it.

State arrives over the router's WebSocket, which re-snapshots at 5 Hz and pushes
on change — so routing _and_ membership changes appear without polling. The
module additionally reads the management API once per connection to learn each
entity's transport kind.

## Presets appear after it connects

Crosspoint presets are generated from the router's own sources and outputs,
because those _are_ the configuration — a fixed preset list would be wrong for
every installation. Until the module has connected and received a state push,
the preset list is just the Status section.

A large matrix is capped (400 crosspoint presets by default, configurable) so
the preset browser stays usable. The cap truncates **whole outputs** rather than
half a crosspoint row, and logs a warning naming the number needed.

## Payload compatibility

The router refuses to route between incompatible payload kinds rather than
emitting a stream the far end cannot decode. `srt` and `media` share a class
(both carry plain MPEG-TS, which is why a stills slate can feed an SRT output);
`ndi` and `omt` are real envelopes and only match themselves.

Two consequences here:

- Dropdowns are labelled `cam1 (srt)`, `slate (media)`, so the refusal is
  predictable rather than a surprise at press time.
- **Cycle skips sources the chosen output cannot take** by default. With that
  turned off, cycling can land on a refused source and the step is simply lost.

A refused take is logged as an error rather than swallowed. Note that the router
answers **HTTP 200 with `{"ok": false}`** for a refusal, and when the crosspoint
itself refuses an unknown id the body carries no error string at all — the
module supplies a message in that case so the failure is not silent.

## Removal is real

`Management: remove` tears the listener down and **frees its port**. It is not a
registry delete, there is no undo, and a source declared in the router's TOML is
exactly as removable as one added at runtime.

## Tests

```bash
npm test
```

Drives the module's real source against a fake router — a real HTTP server and a
real WebSocket — covering the generated presets, both tallies, cycle's
compatibility filtering, and the 200-with-`ok:false` refusal path.

## Installing

Not in the official Companion module store. Install via
**Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT — see [LICENSE](LICENSE).

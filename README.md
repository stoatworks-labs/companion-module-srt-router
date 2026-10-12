# companion-module-srt-router

> **AI-assisted project.** This module was created with [Claude](https://claude.com/claude-code)
> (Anthropic), directed and reviewed by a human author. Check it over before you rely on it for
> a show.

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[srt-router](https://github.com/stoatworks-labs/srt-router). It drives the
crosspoint from a Stream Deck, so you can take any source to any output, cycle,
fire a salvo, and add or remove sources and outputs while it's running.

<!-- downloads:start -->

## Download

**[v1.0.5](https://github.com/stoatworks-labs/companion-module-srt-router/releases/tag/v1.0.5)**

This release contains:

- [`companion-module-srt-router-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-srt-router/releases/latest/download/companion-module-srt-router-pkg.tgz) — npm package, 24 KB
- [`srt-router-1.0.5.tgz`](https://github.com/stoatworks-labs/companion-module-srt-router/releases/download/v1.0.5/srt-router-1.0.5.tgz) — npm package, 24 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-srt-router/releases](https://github.com/stoatworks-labs/companion-module-srt-router/releases).

<!-- downloads:end -->

## What it does

- **Actions:** take (route an output to a source), cycle an output forward or
  back through the source list, salvo one source to every output or to a chosen
  set, add/remove sources and outputs at runtime, and refresh the transport list.
- **Feedbacks:** crosspoint tally (output is on source X), source-side tally
  (this source is feeding something), source is feeding at least N outputs,
  output has no source, and router is connected.
- **Variables:** one per output (what's on it), one per source (how many
  outputs it feeds), plus counts and connection status.
- **Presets:** built from the router's live configuration. There's one section
  per output with a crosspoint button per source and the tally already wired up,
  plus next/previous and a display button; a Sources section with per-source
  tally and salvo; and Status.

## Setting it up

Point the module at whatever address is in the router's `[web] bind` (the
example config uses `0.0.0.0:8080`).

> **There's no authentication.** Anyone who can reach that port can re-route
> any output and remove sources and outputs. Bind it to a management interface
> or put it behind a firewall.

State comes in over the router's WebSocket, which re-snapshots at 5 Hz and
pushes on change, so routing _and_ membership changes turn up without any
polling. The module also reads the management API once per connection to find
out each entity's transport kind.

## Presets appear after it connects

Crosspoint presets are built from the router's own sources and outputs,
because those _are_ the configuration, and a fixed preset list would be wrong
for every install. Until the module has connected and had a state push, the
preset list is only the Status section.

A big matrix gets capped (400 crosspoint presets by default, which you can
change) so the preset browser stays usable. The cap drops whole outputs rather
than half a crosspoint row, and logs a warning saying how many you'd need.

## Payload compatibility

The router won't route between payload kinds that don't match, rather than
send out a stream the far end can't decode. `srt` and `media` are in the same
class (both carry plain MPEG-TS, which is why a stills slate can feed an SRT
output); `ndi` and `omt` are proper envelopes and only match themselves.

That has two knock-on effects here:

- Dropdowns are labelled like `cam1 (srt)` and `slate (media)`, so you can see a
  refusal coming instead of finding out when you press the button.
- By default, cycle skips sources the chosen output can't take. With that
  turned off, cycling can land on a refused source and that step just gets lost.

A refused take is logged as an error rather than swallowed. Bear in mind the
router answers a refusal with HTTP 200 and `{"ok": false}`, which is a cheerful
way of saying no, and when the crosspoint itself refuses an unknown id the body
has no error string in it at all. The module supplies its own message in that
case, so the failure doesn't go unnoticed.

## Removal is real

`Management: remove` tears the listener down and frees its port. It's not a
registry delete and there's no undo, and a source declared in the router's TOML
can be removed just as easily as one added at runtime.

## Tests

```bash
npm test
```

This runs the module's actual code against a pretend router (a real HTTP server
and a real WebSocket). It covers the generated presets, both tallies, cycle's
compatibility filtering, and the 200-with-`ok:false` refusal path.

## Installing

It's not in the official Companion module store, so install it as a developer
module through **Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT, see [LICENSE](LICENSE).

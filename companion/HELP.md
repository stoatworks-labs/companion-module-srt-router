# srt-router

Drives an [srt-router](https://github.com/stoatworks-labs/srt-router) crosspoint.

## Connection

Host and port come from the router's `[web] bind`. **There is no
authentication** — anyone who can reach the port can re-route any output.

## The model

An **output has exactly one source**; a **source may feed many outputs**. That
is why there is no "unroute" action (an output always has a source) and why
there are two tallies:

| Feedback                              | Answers                                            |
| ------------------------------------- | -------------------------------------------------- |
| Output is routed to a source          | "What is on program?" — the crosspoint grid tally  |
| Source is feeding at least one output | "Is this feed live?" — check before re-pointing it |

## Presets come from your router

Crosspoint presets are **generated from the router's live source and output
lists** once the module connects — one section per output, one button per
source, tally already wired. Before it connects you will see only the Status
section. That is deliberate: the module does not yet know what outputs exist.

Large matrices are capped by _Max crosspoint presets_ in the connection config.

## Payload compatibility

The router refuses routes between incompatible payloads. `srt` and `media` share
a class (plain MPEG-TS — this is why a stills slate can feed an SRT output);
`ndi` and `omt` only match themselves.

Dropdowns are labelled with the transport (`cam1 (srt)`) so this is visible, and
**Cycle skips sources the output cannot take** by default.

A refused take is logged as an error. It will not appear as a failed button —
the router answers HTTP 200 either way.

## Management actions remove things for real

**Management: remove** stops the listener and frees its port. There is no undo,
and something declared in the router's config file is exactly as removable as
something added at runtime.

Add actions take JSON mirroring the router's config file for that entity,
because the fields vary per transport and a fixed form would go stale as soon as
a backend is added.

## Connection feedback

Every other feedback holds its last known value while the router is unreachable
— deliberately, so a brief blip does not blank a crosspoint page mid-show. Put
**Router is connected** on any page carrying tally colour.

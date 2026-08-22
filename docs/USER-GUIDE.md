# Companion — srt-router user guide

This module drives an [srt-router](https://github.com/stoatworks-labs/srt-router) crosspoint from
a Stream Deck or any other Bitfocus Companion surface.

The [README](../README.md) covers installing the module. This is how to build a crosspoint page
with it, and where a take can fail without the button noticing.

> **Before you rely on this:** there is **no authentication** on the router's control port —
> anyone who can reach it can re-route any output. Keep it on a trusted network, and note that a
> press here re-points a live feed with no confirmation step.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Host and port come from the router's `[web] bind`.

---

## The model, and why there is no "unroute"

**An output has exactly one source. A source may feed many outputs.**

Everything else follows from that. There is no unroute action, because an output always has *a*
source — you change what it is, you do not take it away. And there are **two tallies**, which
answer different questions:

| Feedback | Answers |
| --- | --- |
| **Output is routed to a source** | "What is on program?" — the crosspoint grid tally |
| **Source is feeding at least one output** | "Is this feed live?" — check before re-pointing it |

The second is the one people forget to build, and it is the one that stops you pulling a source
out from under an output somebody is watching.

---

## Presets come from your router

Crosspoint presets are **generated from the router's live source and output lists** once the
module connects — one section per output, one button per source, tally already wired.

**Before it connects you will see only the Status section.** That is deliberate rather than
broken: the module does not yet know what outputs exist.

Large matrices are capped by **Max crosspoint presets** in the connection config, so a big router
does not generate thousands of buttons you will never place.

---

## Payload compatibility, and the take that fails silently

The router refuses routes between incompatible payloads:

- `srt` and `media` **share a class** — plain MPEG-TS. This is why a stills slate can feed an SRT
  output.
- `ndi` and `omt` **only match themselves**.

Dropdowns are labelled with the transport (`cam1 (srt)`) so the compatibility is visible while you
are building, and **Cycle skips sources the output cannot take** by default.

> **A refused take is logged as an error, and will not appear as a failed button.** The router
> answers HTTP 200 either way. If a crosspoint does not change and the button looks fine, read the
> log.

---

## Management actions remove things for real

**Management: remove** stops the listener and frees its port. **There is no undo**, and something
declared in the router's *config file* is exactly as removable as something added at runtime.

Keep those buttons off the page an operator uses during a show, or behind a page they have to mean
to visit.

Add actions take JSON mirroring the router's config file for that entity. That is because the
fields vary per transport, and a fixed form would go stale the moment a backend is added.

---

## Put the connection feedback on the page

**Every other feedback holds its last known value while the router is unreachable** — deliberately,
so that a brief blip does not blank a crosspoint page mid-show.

The cost of that choice is that a stale tally looks exactly like a live one. **Router is
connected** is what tells them apart, and it belongs on any page carrying tally colour.

---

## Building a surface that fails safe

1. **Router is connected**, visible from every crosspoint page.
2. **Source-is-live tally** next to the output tally, so re-pointing a shared source is a decision
   rather than a surprise.
3. **Management actions on their own page**, away from the show surface.
4. **Check the log after a take that did not land** — the button cannot tell you.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| **No crosspoint presets at all** | The module has not connected yet, so it does not know the outputs. |
| **A take does nothing, button looks fine** | Incompatible payload. The router answered 200 and refused; the log has it. |
| **Cycle skips a source** | It is incompatible with that output. That is the default behaviour. |
| **Tally is green but the router is down** | Feedbacks hold their last value on purpose. Add *Router is connected*. |
| **A source vanished** | Management: remove stops the listener and frees the port, with no undo. |

---

## See also

- [README](../README.md) — installing, and the full action/feedback/variable list
- [`companion/HELP.md`](../companion/HELP.md) — the same material, in Companion's help panel

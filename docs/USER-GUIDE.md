# Companion — srt-router user guide

This module drives an [srt-router](https://github.com/stoatworks-labs/srt-router) crosspoint from
a Stream Deck or any other Bitfocus Companion surface, so you can take any source to any output
from a button.

The [README](../README.md) covers installing the module. This guide is about building a crosspoint
page with it, and the places where a take can fail without the button noticing.

> **Before you rely on this:** there's **no authentication** on the router's control port, so
> anyone who can reach it can re-route any output. Keep it on a network you trust, and bear in
> mind that a press here re-points a live feed with no confirmation step.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Host and port come from the router's `[web] bind`.

---

## The model, and why there is no "unroute"

**An output always has one source, and only one. A source can feed lots of outputs.**

Everything else follows from that. There's no unroute action, because an output always has *a*
source: you change which one, you don't take it away. And there are **two tallies**, which answer
different questions:

| Feedback | Answers |
| --- | --- |
| **Output is routed to a source** | "What is on program?" — the crosspoint grid tally |
| **Source is feeding at least one output** | "Is this feed live?" — check before re-pointing it |

The second is the one people forget to build, and it's the one that stops you pulling a source out
from under an output somebody's watching.

---

## Presets come from your router

Crosspoint presets are **built from the router's live source and output lists** once the module
connects: one section per output, one button per source, with the tally already wired up.

**Until it connects you'll only see the Status section.** It isn't broken; the module just doesn't
know what outputs exist yet.

Large matrices are capped by **Max crosspoint presets** in the connection config, so a big router
doesn't make thousands of buttons you'll never use.

---

## Payload compatibility, and the take that fails silently

The router refuses routes between payloads that don't match:

- `srt` and `media` **share a class**, because both carry plain MPEG-TS. That's why a stills slate
  can feed an SRT output.
- `ndi` and `omt` **only match themselves**.

Dropdowns are labelled with the transport (`cam1 (srt)`), so you can see what'll fit while you're
building, and by default **Cycle skips sources the output can't take**.

> **A refused take is logged as an error, and won't show up as a failed button.** The router
> answers HTTP 200 either way. If a crosspoint doesn't change and the button looks fine, read the
> log.

---

## Management actions remove things for real

**Management: remove** stops the listener and frees its port. **There's no undo**, and something
declared in the router's *config file* can be removed just as easily as something added at
runtime.

Keep those buttons off the page an operator uses during a show, or put them on a page nobody ends
up on by accident.

Add actions take JSON that mirrors the router's config file for that kind of entity. The fields
are different for each transport, and a fixed form would go out of date the moment someone adds a
backend.

---

## Put the connection feedback on the page

**Every other feedback holds its last known value while the router can't be reached.** That's on
purpose, so a brief blip doesn't blank a crosspoint page mid-show.

The price is that a stale tally looks the same as a live one. **Router is connected** is what
tells them apart, and it belongs on any page that shows tally colour.

---

## Building a surface that fails safe

1. **Router is connected**, visible from every crosspoint page.
2. **Source-is-live tally** next to the output tally, so re-pointing a shared source is something
   you decide to do rather than something that surprises you.
3. **Management actions on their own page**, away from the show surface.
4. **Check the log after a take that didn't land.** The button can't tell you.

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

- [README](../README.md): installing, and the full list of actions, feedbacks and variables
- [`companion/HELP.md`](../companion/HELP.md): the same material, in Companion's help panel

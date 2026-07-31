# Design notes

How Icy is put together. The [README](../README.md) covers running it;
[configuration](configuration.md) covers the knobs.

## How the call is wired

Every frame of audio goes through the Node process:

```
browser  ──ws──▶  /realtime  ──ws──▶  wss://api.x.ai/v1/realtime
```

Unlike OpenAI's Realtime API, the browser can't dial xAI directly.
`/v1/realtime/client_secrets` takes no `session` field, so a page dialling xAI
itself would have to send its own `session.update` — putting the persona, the
tool list and any MCP `authorization` header in client code. The token also
lasts five minutes, and conversations routinely outlive that.

So the socket lives here and the page holds no credential. On connect the proxy
sends `session.update` — persona, voice, turn detection, audio format, tools —
before forwarding anything the page queued.

What the page may send upstream is an allowlist: audio frames, a typed message,
a request to respond, a cancel, and the output of a function call it ran itself.
Two things are dropped as persona overrides — a `session.update` from the
browser, and the `instructions` field on a `response.create`.
`test/server/realtime.test.js` covers that.

One frame type never reaches xAI: `session.memory`, which the page sends with
what it has stored. The proxy folds those lines into the instructions and
re-sends its own `session.update`, so the persona stays here and the memories
stay in the browser.

## Audio

A WebSocket carrying base64 PCM leaves both directions to the client.

**Up:** an `AudioWorklet` (`public/pcm-worklet.js`) takes the mic at whatever
rate the hardware gives, resamples to 24 kHz with linear interpolation, and
posts 20 ms PCM16 frames. The `sampleRate` option on `AudioContext` is only a
hint, so the conversion is done rather than requested.

**Down:** chunks arrive faster than real time, so each is booked against a
cursor running ahead of the clock rather than played as it lands. That cursor is
also what makes barge-in work — interrupting drops everything booked but not yet
heard.

Turn-taking is server-side VAD. `input_audio_buffer.speech_started` tells the
page to drop its queue; a `response.created` arriving while audio is still
playing flushes it too, as a backstop. `Escape` cancels for the typed path.

The worklet lives in `public/` rather than being imported, because Vite inlines
small assets as `data:text/javascript` URLs and `addModule()` rejects those on
Safari and under any CSP that disallows `data:`.

## Storage

The log is one record per call under `icy.history.v1`; memory is a list of lines
under `icy.memory.v1`. Neither is uploaded — the proxy holds no copy of either.

The last 40 conversations are kept, and the oldest are shed to stay inside a
300 KB budget, since that space belongs to the whole origin. Private-mode Safari
hands back a store that throws on write, so the log falls back to memory for the
life of the page rather than failing the call.

Old turns are not replayed into a new call. That would make the log a memory
rather than a record, and `session.tools` has no path for it that doesn't also
let the page rewrite the persona.

Memory is capped at 25 lines, each flattened to one line and cut at 600
characters; past the cap the oldest goes. `remember` and `forget` run in the
page against browser storage, and the result goes back up as a
`function_call_output`. Editing the list during a call re-sends
`session.memory`, so a memory added mid-conversation is live in it; switching
memory off empties the block on the next `session.update` without deleting
anything.

Memories are text the person typed or dictated, so they land inside the prompt.
Flattening and capping them in `persona.js` keeps a memory from opening a new
instruction paragraph, and the persona is always first in the string.

## States

`idle` · `listening` · `thinking` · `speaking` — each a set of targets for edge
sharpness, glow, halo, spin, how high it rides in the drink, and how often and
how hard it gets kicked. It eases between them, so transitions read as a change
of mood rather than a cut.

The call maps onto them directly: `listening` from `speech_started` and between
turns, `thinking` from `speech_stopped` until the first audio frame, `speaking`
while there is audio booked, `idle` when there is no call.

A fifth mood, `melting`, has no conversational state — it's what a broken API
looks like. On a failed dial, a proxy that isn't running, a missing key or an
error mid-call, the cube rounds off, sinks and thins out while the drink pales
and rises. It holds until something works again, then refreezes. The caption
says what broke; nothing else in the app causes the melt.

Being interrupted is not a mood — it's one hard kick into the springs that are
already there, so he jumps on the frame you cut in and rocks flat again over the
next second.

Every visible movement is a loose, lightly damped spring being kicked rather
than a sine wave, and the cube is buoyant, so it never sits where it was put.
Each mood kicks on its own cadence: listening barely stirs, thinking walks him
around the glass, speaking works the surface. While he talks the kicks come from
onsets in the audio envelope, so the bob lands on consonants. The surface of the
drink is rippled by whatever the cube just did.

## Layout

```
Dockerfile              Build the client, then serve it from src/server
index.html              Markup only — Vite's entry
prototype/              Where the character came from, as single-file pages
public/
  pcm-worklet.js        Mic → 24 kHz PCM16, on the audio thread
src/
  client/
    main.js             The wiring, and nothing else
    styles.css          The HUD around the glass
    api.js              /api/config, as a function
    history.js          Past conversations, in localStorage
    memory.js           What it remembers between calls, in localStorage
    icy/                Geometry and animation. Knows nothing about transports
      index.js            The controller and the per-frame loop
      geometry.js         The cube: superellipsoid, frost rim, core, bubbles
      glass.js            The tumbler and the pour, off one shared profile
      moods.js            Targets per conversational state
      environment.js      Cold studio env map
    session/            The call. Emits transport-agnostic events
      index.js            Lifecycle: mic, socket, meter, tear down
      socket.js           The WebSocket to our own proxy
      audio.js            Capture and playback over Web Audio
      codec.js            PCM16 ↔ base64
      events.js           xAI server events → this vocabulary
      tools.js            remember/forget, run in the page
      metering.js         An analyser → one 0..1 number per frame
      emitter.js
      constants.js        The wire format, shared with the server
    ui/
      hud.js              Status chip, transcript, caption, tool label
      history.js          The log panel behind the `log` button
      memory.js           The memory panel behind the `memory` button
      controls.js         Mic, text field, send, pickers
      viewport.js         Keeps the composer above the on-screen keyboard
      stage.js            Strips the starter component's own chrome
    vendor/
      three-d-stage.js    Starter component (renderer, lighting, camera, controls)
  server/
    index.js            Entry point
    app.js              Middleware chain + the upgrade handler
    api.js              /api/config
    realtime.js         The socket proxy, and the allowlist
    persona.js          Who Icy is, and the session config
    config.js           The environment, resolved once
    static.js           Hosting for dist/ — production only
docs/                   These notes, configuration, policies, screenshots
test/                   node:test, against a stub xAI socket
.github/workflows/      CI (lint, tests, build smoke test) and the Docker publish
```

`src/client/icy/` is a single-file prototype split into modules, with its
numbers kept verbatim — the moods, the springs and the shape maths are
unchanged. The original is at `prototype/scotch-glass.html`, alongside
`prototype/ice-cube.html`, the same character without the glass. What the app
adds is who chooses the mood. `src/client/vendor/three-d-stage.js` is a copied
starter component with two local changes, listed at the top of the file —
re-copying it drops them.

The camera is the one thing the split did change. The glass leans its mouth
toward you and the camera sits above it, so you look down into the drink rather
than at the surface edge-on. The framing is measured off the object's own bounds
and refits on resize, which the starter component's one-shot vertical framing
doesn't do — on a phone held upright that's the difference between a glass and a
slice of one.

## The transport seam

`session/index.js` exposes `on`, `start`, `stop`, `send`, `cancel`, `syncMemory`,
`messages`, `connected`, `busy`, `stale`, `state`, `muted`, `model`, `voice` —
and emits:

```
'state'        listening | thinking | speaking | idle
'caption'      the assistant transcript for this turn, in full
'user'         what the person said, in full
'level'        0..1 sustained amplitude, per frame
'pulse'        0..1 transient, one per discrete event
'interrupted'  the person talked over Icy
'tool'         a label while a tool works, or null
'message'      a completed turn, { role, content } — what the log stores
'busy'         whether a response is in flight
'ready'        { model, voice } the proxy actually used
'memory'       the result of a remember/forget the model just called
'done'         { usage }
'error'        { message }
```

Both transcript events carry the whole turn rather than an increment. xAI
renames OpenAI's `input_audio_transcription.delta` to `.updated` and makes it
cumulative, so appending it gives you "hello hello there hello there icy".
`events.js` handles the two shapes apart — `.delta` appends, `.updated`
replaces.

Icy takes audio-shaped input:

```js
icy.setState('speaking')  // idle | listening | thinking | speaking
icy.setLevel(0.62)        // sustained amplitude 0..1, sampled per frame
icy.pulse(0.4)            // transient impulse 0..1, one per discrete event
icy.rattle(0.9)           // it has been talked over
icy.melt(true)            // the API is unreachable — or, with false, it's back
```

Swapping providers means writing a different `createVoiceSession()` with that
surface. `main.js` and Icy don't change.

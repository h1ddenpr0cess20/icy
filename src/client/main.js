/**
 * The wiring, and only the wiring.
 *
 * Four pieces that don't know about each other: Icy (geometry), the session
 * (transport), the HUD (what you read) and the controls (what you press). This
 * file is the one place that knows a `level` event should become a bob, that
 * being talked over should rattle the glass, and that a dead API should melt
 * the cube.
 */

import './styles.css';
import './vendor/three-d-stage.js';

import { fetchConfig } from './api.js';
import { createIcy } from './icy/index.js';
import { createVoiceSession } from './session/index.js';
import { createControls } from './ui/controls.js';
import { createHud } from './ui/hud.js';
import { stripStageChrome } from './ui/stage.js';
import { trackKeyboardInset } from './ui/viewport.js';

// Before the await, not after — see ui/stage.js. The element is already
// upgraded by the import above, and its toolbar would otherwise be on screen
// for as long as three.js takes to load.
const stage = stripStageChrome(document.querySelector('three-d-stage'));

const { THREE } = await stage.ready;

const icy = createIcy({ stage, THREE });
const session = createVoiceSession();
const hud = createHud();

trackKeyboardInset();

/* --- controls → session --------------------------------------------------- */

const controls = createControls({
  getStatus: () => ({ connected: session.connected, busy: session.busy }),

  async onMicToggle() {
    if (session.connected) {
      session.stop();
      hud.hideUser();
      hud.setTool(null);
      return;
    }
    hud.setState('connecting');
    hud.clearCaption();
    await session.start();
    // A pick that landed while this was in the air found no live call to hang
    // up, so redial() dropped it. Deferred past toggleMic's own lock.
    if (session.stale) setTimeout(redial, 0);
  },

  onSubmit(text) {
    if (!session.connected) return;
    hud.showUser(text);
    hud.clearCaption();
    session.send(text);
  },

  onModelChange(model) {
    session.model = model;
    redial();
  },

  onVoiceChange(voice) {
    session.voice = voice;
    redial();
  },

  onCancel() {
    session.cancel();
  },
});

/* Model and voice are both pinned when the proxy opens its socket upstream, so
   changing either mid-call means hanging up and dialling again. The
   conversation doesn't survive that — which is the honest behaviour, since the
   new voice has no memory of what the old one said. */
function redial() {
  if (!session.connected) return;
  session.stop();
  controls.toggleMic();
}

/* --- session → Icy + HUD ---------------------------------------------------
   The only wiring between transport and animation. 'pulse' arrives when a turn
   changes hands, 'level' per frame from whichever side of the call is making
   sound; the cube folds both into the same energy. */

session.on('state', (state) => {
  // Anything moving means the call is alive again, whatever went wrong before.
  if (state !== 'idle') icy.melt(false);
  // A new turn starts here: the last answer clears as the cube thinks.
  if (state === 'thinking') hud.clearCaption();
  if (state === 'listening' || state === 'idle') hud.setTool(null);
  icy.setState(state);
  hud.setState(icy.state);
  controls.sync();
});

// A response can start and finish inside one 'thinking', so 'state' won't carry it.
session.on('busy', () => controls.sync());

session.on('level', (level) => icy.setLevel(level));
session.on('pulse', (weight) => icy.pulse(weight));
session.on('caption', (text) => hud.setCaption(text));
session.on('user', (text) => hud.showUser(text));
session.on('tool', (label) => hud.setTool(label));

// Talk over Icy and the glass jumps. The persona is meant to be visible in the
// geometry too, not only in what comes out of the speakers.
session.on('interrupted', () => icy.rattle(0.9));

/* A failed call melts him. The caption says what broke, but the caption is one
   line of small text at the bottom of a dark page — the cube going to water is
   the part you cannot miss, and it stays that way until something works again.
   Nothing else melts him, so it never means anything else. */
session.on('error', ({ message }) => {
  icy.melt(true);
  hud.showError(message);
  hud.setState(icy.state); // a failed dial never leaves 'idle', so no 'state' clears the chip
  controls.sync();
});

/* --- what this build can reach, from the proxy ---------------------------- */

try {
  // The proxy names the defaults for both pickers; it owns that choice, and the
  // env vars that override it.
  const config = await fetchConfig();
  const chosen = controls.setCatalog(config);
  session.model = chosen.model;
  session.voice = chosen.voice;
  hud.showTools(config.tools);
  if (!config.ready) throw new Error('XAI_API_KEY is not set — nothing to dial with.');
} catch (err) {
  // Same rule: there is no call to be had, so the page opens melted.
  icy.melt(true);
  controls.unavailable();
  hud.showError(`${err.message} — is the proxy running? (npm run dev)`);
}

// Leaving the tab mid-call would otherwise keep the mic hot and the meter spinning.
window.addEventListener('pagehide', () => session.stop());

controls.sync();

// Focusing the mic saves a keyboard user a tab stop. On a phone it just leaves
// a focus ring on the control everyone was going to tap anyway.
if (window.matchMedia('(pointer: fine)').matches) controls.focus();

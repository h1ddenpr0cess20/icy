/**
 * What the cube is doing per conversational state.
 *
 * These are the prototype's five modes, verbatim — the same numbers that were
 * behind its idle/listening/thinking/speaking/melting buttons. Nothing about
 * the motion changed on the way into this app; what changed is who presses the
 * buttons. The call does, and `melting` is now what a broken API looks like.
 *
 * Shape and light:
 *   `sharp`       superellipsoid exponent — high is a crisp block, low is a lump
 *   `shimmer`     how hard the core shivers
 *   `speed`       the animation clock's rate; everything periodic rides on it
 *   `spin`        slow turn about the vertical, radians/s
 *   `glow`        core emissive intensity
 *   `halo`        frost rim strength
 *   `tint`        how fast the ice walks through its four blues
 *   `melt`        0..1, how far it has given itself up to the drink
 *
 * Motion in the glass — all of it sprung, and each mood kicks the springs on
 * its own cadence rather than driving them with a sine:
 *   `bob`         wander amplitude
 *   `rise`        how high it rides in the pour
 *   `swirl`       radius of the circle it walks around the glass
 *   `swirlSpeed`  how fast it walks it
 *   `gap`         seconds between kicks
 *   `amp`         vertical force per kick
 *   `spin2`       tumble force per kick
 *   `kick`        swirl force per kick
 */
export const MOODS = {
  // Turning over in the drink with nothing better to do.
  idle: {
    sharp: 12, shimmer: 0.4, speed: 0.8, spin: 0.06, glow: 1.6, halo: 0.3, tint: 0.015, melt: 0,
    bob: 0.010, rise: 0, swirl: 0.045, swirlSpeed: 0.14, gap: 4.2, amp: 0.055, spin2: 0.5, kick: 0.16,
  },
  // Risen, crisp, and holding almost still. It listens the way ice listens: by
  // not moving.
  listening: {
    sharp: 17, shimmer: 0.6, speed: 1.4, spin: 0.03, glow: 2.6, halo: 0.5, tint: 0.03, melt: 0,
    bob: 0.014, rise: 0.055, swirl: 0.028, swirlSpeed: 0.08, gap: 2.4, amp: 0.022, spin2: 0.22, kick: 0.08,
  },
  // Pacing, for something that cannot pace: it swirls the glass from inside.
  thinking: {
    sharp: 9, shimmer: 0.8, speed: 2.4, spin: 0.45, glow: 2.2, halo: 0.42, tint: 0.16, melt: 0,
    bob: 0.026, rise: 0.02, swirl: 0.10, swirlSpeed: 1.15, gap: 1.0, amp: 0.05, spin2: 1.7, kick: 0.9,
  },
  // Talking. The kicks come every third of a second, which is what lets the
  // audio drive them instead — see index.js.
  speaking: {
    sharp: 13, shimmer: 1.0, speed: 3.2, spin: 0.09, glow: 3.2, halo: 0.6, tint: 0.06, melt: 0,
    bob: 0.040, rise: 0.03, swirl: 0.06, swirlSpeed: 0.3, gap: 0.3, amp: 0.115, spin2: 1.0, kick: 0.28,
  },
  // Not a conversational state. Held while the API is unreachable, and only
  // then: the block rounds off, sinks, thins out and dilutes the pour. It is
  // the one thing on screen that says the call is broken rather than quiet.
  melting: {
    sharp: 4.2, shimmer: 1.4, speed: 1.0, spin: 0.02, glow: 1.0, halo: 0.2, tint: 0.03, melt: 1,
    bob: 0.003, rise: 0, swirl: 0, swirlSpeed: 0.05, gap: 6.0, amp: 0, spin2: 0.05, kick: 0,
  },
};

/**
 * How far a full-energy voice pushes each channel past its state baseline.
 *
 * Additive, and zero when nothing is making sound — with the mic off, every
 * mood is exactly the mood above.
 */
export const ENERGY_GAIN = { speed: 1.0, glow: 1.4, halo: 0.2, shimmer: 0.4, bob: 0.02 };

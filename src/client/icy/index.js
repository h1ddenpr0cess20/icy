/**
 * Icy, as a controller.
 *
 * Everything visual lives under this directory; nothing in it knows where its
 * input comes from. The controller surface is deliberately audio-shaped so a
 * voice pipeline drops in without touching the geometry:
 *
 *   icy.setState('speaking')  idle | listening | thinking | speaking
 *   icy.setLevel(0.62)        sustained amplitude 0..1, sampled per frame
 *   icy.pulse(0.4)            transient impulse 0..1, one per discrete event
 *   icy.rattle(0.9)           it has been talked over and it did not care for it
 *   icy.melt(true)            the API is broken; it gives up and goes to water
 *
 * Nothing here is a sine wave dressed up as motion. Every visible movement is a
 * spring being kicked: the cube is buoyant, so it does not sit where you put it
 * — it is shoved, rides up past where it settles, and comes back. The springs
 * are loose and lightly damped, which is why it reads as floating rather than
 * bolted to a bone.
 *
 * The motion, the moods and every constant in them came straight off the
 * prototype and are unchanged. All this file adds is who chooses the mood: the
 * call does. Two things it does are not conversational states — an interruption
 * is a hard shove into the springs that were already there, and an API failure
 * holds `melting` until something works again. Melt means exactly that one
 * thing, which is what makes it readable from across the room.
 */

import { buildEnvironment } from './environment.js';
import { createGlass, CUT, FLOOR_Y, INNER_R, NEAT, RIM_Y, WATER_TOP } from './glass.js';
import { createIce, R } from './geometry.js';
import { ENERGY_GAIN, MOODS } from './moods.js';

const smooth = (x) => x * x * (3 - 2 * x);

/* The cube rides in its own rig, so its drift is local: the containment maths
   below works in block units and the rig carries it into the glass. */
const RIG_SCALE = 0.58;
const RIG_Y = WATER_TOP - 0.20;

/* The set leans its mouth toward the camera. Upright, at any sane elevation,
   the drink's surface is a sliver and the cube is behind a wall of glass; a
   little over ten degrees opens the top up without making the pour look like
   it is about to spill. There is no ground plane, so nothing contradicts it —
   the lean reads as the camera's, not the table's. */
const TILT = 0.19;

/* How much of the frame the glass is allowed to fill. 1 is the bounding sphere
   touching the edges on the tighter axis, which is far too close — the glass is
   an object on a table, not a portrait. */
const MARGIN = 1.34;

/* The four blues the block walks through. Slow, and never all the way round in
   one turn of the conversation — the drift is the tell that it is alive. */
const TINTS = ['#dff1ff', '#c8e8ff', '#cfd8ff', '#d8f6ff'];

export function createIcy({ stage, THREE }) {
  buildEnvironment({ stage, THREE });

  const ice = createIce(THREE);
  const { glass, whiskey, whiskeyMat, ripple } = createGlass(THREE);

  const rig = new THREE.Group();
  rig.name = 'float_rig';
  rig.scale.setScalar(RIG_SCALE);
  rig.position.y = RIG_Y;
  rig.add(ice.group);

  const set = new THREE.Group();
  set.name = 'icy_character';
  set.rotation.x = TILT;
  set.add(glass, whiskey, rig);

  /* Three transparent things in a line of sight, and depth sorting alone gets
     it wrong often enough to flicker: the drink is behind the cube is behind
     the glass, always. */
  whiskey.renderOrder = 0;
  ice.group.traverse((o) => { if (o.isMesh) o.renderOrder = 1; });
  glass.renderOrder = 2;

  const tints = TINTS.map((h) => new THREE.Color(h));
  const tint = new THREE.Color();
  const cool = new THREE.Color('#7fc4ff');
  const coreCool = new THREE.Color('#6fd2ff');
  const neat = new THREE.Color(NEAT);
  const cut = new THREE.Color(CUT);
  const diluted = new THREE.Color();
  /** Walk the palette on a loop, blending between neighbours. */
  const tintAt = (at, out) => {
    const f = ((at % tints.length) + tints.length) % tints.length;
    const i = Math.floor(f);
    return out.copy(tints[i]).lerp(tints[(i + 1) % tints.length], f - i);
  };

  let state = 'idle';
  let broken = false;
  const target = { ...MOODS.idle };
  const m = { ...MOODS.idle };

  /* `energy` is what the cube reads. `sustain` is where it settles (the live
     audio level); `impulse` decays on top of it (discrete events). */
  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let lastEnergy = 0;

  const clock = new THREE.Clock();
  let t = 0, phase = 0, drift = 0;

  /* Bob, the two tilts, and the walk around the glass. All sprung, all kicked
     rather than driven. */
  let py = 0, vy = 0;
  let rx = 0, vrx = 0;
  let rz = 0, vrz = 0;
  let swirlA = Math.random() * 6.28, swirlV = 0;
  let kickT = 0.4;

  /* Tracks the melt a beat behind it: the pour rises and pales as the cube
     goes, and comes back neat as it recovers. Not physics — but neither is an
     ice cube that answers questions. */
  let dilute = 0;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    /* --- energy ----------------------------------------------------------- */
    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    lastEnergy = energy;
    energy += (Math.min(1, sustain + impulse) - energy) * Math.min(1, dt * 6);

    /* --- mood --------------------------------------------------------------
       A broken API takes the mood over outright; otherwise the state has it.
       Every channel is eased into, so nothing snaps — and melt is eased slower
       than the rest, because ice does not go to water in a third of a second. */
    const mood = broken ? MOODS.melting : (MOODS[state] ?? MOODS.idle);
    for (const k in target) {
      target[k] = mood[k];
      m[k] += (mood[k] - m[k]) * Math.min(1, dt * (k === 'melt' ? 0.9 : 3));
    }

    const gain = ENERGY_GAIN;
    phase += dt * (m.speed + energy * gain.speed);
    drift += dt * m.tint;

    const melt = m.melt;
    const e = smooth(melt);                                   // eased melt
    const lift = 1 - e;
    const shimmer = m.shimmer + energy * gain.shimmer;
    const sharp = m.sharp - melt * (m.sharp - 4) * 0.75;      // edges round off as it goes
    const glisten = shimmer * melt;                           // wet, and only ever wet

    /* --- the cube ----------------------------------------------------------
       `shape` no-ops unless the shape actually changed, which — settled in a
       mood, with nothing melting — is every frame. */
    ice.shape(sharp, melt, phase, glisten);
    ice.shiver(shimmer, e, phase);
    ice.float(e, phase);

    /* --- colour and light -------------------------------------------------- */
    tintAt(drift, tint);
    const gone = Math.max(0, (e - 0.72) / 0.28);              // the last of it dissolves away
    diluted.copy(neat).lerp(cut, 0.6);

    ice.iceMat.color.copy(tint);
    ice.iceMat.roughness = 0.14 + melt * 0.06;
    ice.iceMat.opacity = 0.99 * (1 - gone * 0.92);
    ice.iceMat.attenuationColor.copy(tint).lerp(cool, 0.55).lerp(diluted, gone * 0.8);
    ice.block.visible = gone < 0.99;
    ice.rim.visible = ice.block.visible;

    ice.coreMat.emissive.copy(tint).lerp(coreCool, 0.6);
    ice.coreMat.emissiveIntensity = (m.glow + energy * gain.glow) * lift
      * (0.9 + Math.sin(phase * 2.3) * 0.1);
    ice.coreMat.opacity = 0.4 * Math.max(0, 1 - e * 1.6);     // the heart thaws away entirely
    ice.core.visible = ice.coreMat.opacity > 0.005;
    ice.bubbleMat.opacity = 0.45 * Math.max(0, 1 - e * 1.5);

    ice.rimMat.uniforms.uColor.value.copy(tint);
    ice.rimMat.uniforms.uStrength.value = (m.halo + energy * gain.halo) * 1.1
      * (1 - melt * 0.7) * (0.85 + Math.sin(phase * 1.9) * 0.15);

    /* --- speaking: one shove per syllable, taken from the audio -------------
       A rising edge in the envelope is an onset, and its steepness is how hard
       the cube gets shoved. Consonants hit harder than vowels, which is what
       makes the bobbing look like it is forming words rather than keeping time. */
    if (state === 'speaking' && !broken) {
      const onset = Math.max(0, energy - lastEnergy);
      if (onset > 0.008) {
        vy += onset * 9;
        vrx += (Math.random() - 0.5) * onset * 7;
        vrz += (Math.random() - 0.5) * onset * 7;
        swirlV += (Math.random() - 0.5) * onset * 2.5;
      }
    }

    /* --- springs ------------------------------------------------------------
       Every mood kicks on its own cadence: listening barely stirs, thinking
       walks the cube round the glass, speaking works the surface. */
    kickT -= dt;
    if (kickT <= 0 && lift > 0.05) {
      kickT = m.gap * (0.55 + Math.random() * 0.9);
      vy += (m.amp + energy * gain.bob) * (0.6 + Math.random() * 0.8) * 6;
      vrx += (Math.random() - 0.5) * m.spin2;
      vrz += (Math.random() - 0.5) * m.spin2;
      swirlV += (Math.random() - 0.5) * m.kick;
    }
    vy += (-py * 46 - vy * 4.4) * dt; py += vy * dt;
    vrx += (-rx * 16 - vrx * 2.6) * dt; rx += vrx * dt;
    vrz += (-rz * 16 - vrz * 2.6) * dt; rz += vrz * dt;
    swirlV *= 1 - Math.min(1, dt * 1.4);
    swirlA += (m.swirlSpeed + swirlV) * dt;

    const w = (m.bob + energy * gain.bob) * 1.6 * lift;
    const sw = m.swirl * lift;
    ice.group.position.set(
      Math.cos(swirlA) * sw + Math.sin(t * 0.37) * w,
      py * lift + m.rise * lift,
      Math.sin(swirlA) * sw + Math.cos(t * 0.43 + 2.1) * w);
    ice.group.rotation.x = (rx + Math.sin(t * 0.31) * 0.05) * lift;
    ice.group.rotation.z = (rz + Math.cos(t * 0.27 + 1.9) * 0.05) * lift;
    ice.group.rotation.y += dt * m.spin * (1 - e * 0.8);

    /* --- containment --------------------------------------------------------
       It is in a glass. Clamp the local offset to what the interior can hold —
       the block's half-diagonal, plus slop for the tilt — and kill the swirl on
       contact so it doesn't grind along the wall. */
    const s = RIG_SCALE * (1 - e * 0.55);
    const rigY = Math.max(FLOOR_Y + R * s, RIG_Y - e * 0.29);

    const halfDiag = R * Math.SQRT2 * 1.06;
    const room = Math.max(0, (INNER_R / s) - halfDiag);
    const off = Math.hypot(ice.group.position.x, ice.group.position.z);
    if (off > room && off > 1e-6) {
      ice.group.position.x *= room / off;
      ice.group.position.z *= room / off;
      swirlV *= 0.3;
    }
    const low = (FLOOR_Y - rigY) / s + halfDiag * 0.72;   // a corner may dip below centre
    if (ice.group.position.y < low) {
      ice.group.position.y = low;
      if (vy < 0) vy = -vy * 0.35;                        // it bounces off the bottom
    }
    const high = (RIM_Y - rigY) / s - R * 1.1;
    if (ice.group.position.y > high) {
      ice.group.position.y = high;
      if (vy > 0) vy = -vy * 0.3;
    }

    rig.scale.setScalar(s);
    rig.position.y = rigY;

    /* --- the drink ---------------------------------------------------------- */
    dilute += (e - dilute) * Math.min(1, dt * 1.1);
    const dl = smooth(dilute);
    whiskey.scale.y = 1 + dl * 0.075;                     // the level creeps up
    whiskey.position.y = -0.358 * dl * 0.075;
    whiskeyMat.color.copy(neat).lerp(cut, dl * 0.75);
    whiskeyMat.opacity = 0.62 - dl * 0.14;
    whiskeyMat.emissiveIntensity = 0.5 - dl * 0.22;
    whiskeyMat.roughness = 0.05 + dl * 0.02;

    ripple(t, swirlA, 0.35 + Math.abs(vy) * 1.6 + m.bob * 10 + energy * 0.8);
  };

  stage.setObject(set);

  /* --- framing --------------------------------------------------------------
     setObject() frames an object once, against the camera's *vertical* field of
     view. A phone held upright is much narrower than it is tall, so that
     framing crops the glass at the sides. Fit whichever axis is tighter
     instead, and re-run it whenever the viewport changes, so a rotation or the
     keyboard opening reframes rather than clips.

     The view direction is set here too, and it is the other half of the tilt:
     looking down at the glass from a little above, with the glass leaning
     back, is what puts the surface of the drink and the cube in it on screen
     at the same time. Orbiting still works — the user's own direction is kept
     the moment they drag. */
  let dir = new THREE.Vector3(0.62, 0.72, 1.12).normalize();
  stage._controls.addEventListener('start', () => { dir = null; });

  /* Measured off the set as built, tilt included, rather than hand-typed
     half-extents that go stale the moment the profile changes. A sphere is the
     right shape to measure with here: it is orientation-independent, so
     orbiting round the glass can't bring a corner into frame that the framing
     didn't account for. */
  const bounds = new THREE.Box3().setFromObject(set).getBoundingSphere(new THREE.Sphere());

  const reframe = () => {
    const camera = stage._camera;
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    const aspect = w / h;

    // Fit whichever axis is tighter: the vertical FOV, or the horizontal one
    // it implies at this aspect.
    const half = bounds.radius;
    const dist = (Math.max(half, half / aspect) / Math.tan((camera.fov * Math.PI) / 360)) * MARGIN;

    const focus = stage._controls.target;
    const view = dir
      ? dir.clone()
      : camera.position.clone().sub(focus).normalize();
    if (view.lengthSq() === 0) view.set(0.62, 0.72, 1.12).normalize();
    camera.position.copy(focus).addScaledVector(view, dist);
    camera.near = Math.max(dist / 100, 0.01);
    camera.far = dist * 100;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    stage._controls.update();
  };

  reframe();
  new ResizeObserver(reframe).observe(stage);

  /* setObject() turns shadows on for everything it traverses. The set hangs in
     the void — there is no table under it — so only the tumbler has anything
     worth casting, and with the ground plane hidden even that is wasted work. */
  stage._ground.visible = false;
  stage._key.castShadow = false;
  set.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  /* Its own rAF loop rather than an onBeforeRender hook. Two reasons: the block
     hides itself once it has fully melted, and an onBeforeRender on a hidden
     mesh never fires again — the cube would melt and then freeze in place. And
     a transmissive scene renders more than once per frame, so a hook on any
     mesh that survives the transmission pass ticks twice. */
  (function loop() {
    requestAnimationFrame(loop);
    frame();
  })();

  return {
    get state() {
      return state;
    },

    /** idle | listening | thinking | speaking. Unknown names are ignored —
     *  hasOwn, not a truth test: `MOODS.constructor` is truthy and NaNs every
     *  channel it touches. */
    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    /** Sustained amplitude, 0..1. Call per frame. */
    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    /** Transient impulse, 0..1. Call once per discrete event. */
    pulse(weight = 0.3) {
      impulse = Math.min(1, impulse + Math.min(1, Math.max(0, weight)));
    },

    /** Talk over it and it jumps. Not a mood — one hard kick into the springs
     *  the moods were already kicking, so it lands on the frame you cut in and
     *  rocks itself flat again over the next second or so. */
    rattle(weight = 1) {
      vy += 1.7 * weight;
      vrx += (Math.random() - 0.5) * 2.6 * weight;
      vrz += (Math.random() - 0.5) * 2.6 * weight;
      swirlV += (Math.random() - 0.5) * 1.4 * weight;
      impulse = Math.min(1, impulse + 0.5 * weight);
    },

    /** The API is unreachable, or it is back. Held either way: this is the one
     *  thing on screen that says the call is broken rather than quiet. */
    melt(on = true) {
      broken = Boolean(on);
      if (broken) sustain = 0;
    },
  };
}

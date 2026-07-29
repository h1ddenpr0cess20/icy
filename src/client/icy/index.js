import { buildEnvironment } from './environment.js';
import { createGlass, CUT, FLOOR_Y, INNER_R, NEAT, RIM_Y, WATER_TOP } from './glass.js';
import { createIce, R } from './geometry.js';
import { ENERGY_GAIN, MOODS } from './moods.js';

const smooth = (x) => x * x * (3 - 2 * x);

const RIG_SCALE = 0.58;
const RIG_Y = WATER_TOP - 0.20;

const TILT = 0.19;

const MARGIN = 1.34;

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
  const tintAt = (at, out) => {
    const f = ((at % tints.length) + tints.length) % tints.length;
    const i = Math.floor(f);
    return out.copy(tints[i]).lerp(tints[(i + 1) % tints.length], f - i);
  };

  let state = 'idle';
  let broken = false;
  const target = { ...MOODS.idle };
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let lastEnergy = 0;

  const clock = new THREE.Clock();
  let t = 0, phase = 0, drift = 0;

  let py = 0, vy = 0;
  let rx = 0, vrx = 0;
  let rz = 0, vrz = 0;
  let swirlA = Math.random() * 6.28, swirlV = 0;
  let kickT = 0.4;

  let dilute = 0;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    lastEnergy = energy;
    energy += (Math.min(1, sustain + impulse) - energy) * Math.min(1, dt * 6);

    const mood = broken ? MOODS.melting : (MOODS[state] ?? MOODS.idle);
    for (const k in target) {
      target[k] = mood[k];
      m[k] += (mood[k] - m[k]) * Math.min(1, dt * (k === 'melt' ? 0.9 : 3));
    }

    const gain = ENERGY_GAIN;
    phase += dt * (m.speed + energy * gain.speed);
    drift += dt * m.tint;

    const melt = m.melt;
    const e = smooth(melt);
    const lift = 1 - e;
    const shimmer = m.shimmer + energy * gain.shimmer;
    const sharp = m.sharp - melt * (m.sharp - 4) * 0.75;
    const glisten = shimmer * melt;

    ice.shape(sharp, melt, phase, glisten);
    ice.shiver(shimmer, e, phase);
    ice.float(e, phase);

    tintAt(drift, tint);
    const gone = Math.max(0, (e - 0.72) / 0.28);
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
    ice.coreMat.opacity = 0.4 * Math.max(0, 1 - e * 1.6);
    ice.core.visible = ice.coreMat.opacity > 0.005;
    ice.bubbleMat.opacity = 0.45 * Math.max(0, 1 - e * 1.5);

    ice.rimMat.uniforms.uColor.value.copy(tint);
    ice.rimMat.uniforms.uStrength.value = (m.halo + energy * gain.halo) * 1.1
      * (1 - melt * 0.7) * (0.85 + Math.sin(phase * 1.9) * 0.15);

    if (state === 'speaking' && !broken) {
      const onset = Math.max(0, energy - lastEnergy);
      if (onset > 0.008) {
        vy += onset * 9;
        vrx += (Math.random() - 0.5) * onset * 7;
        vrz += (Math.random() - 0.5) * onset * 7;
        swirlV += (Math.random() - 0.5) * onset * 2.5;
      }
    }

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
    const low = (FLOOR_Y - rigY) / s + halfDiag * 0.72;
    if (ice.group.position.y < low) {
      ice.group.position.y = low;
      if (vy < 0) vy = -vy * 0.35;
    }
    const high = (RIM_Y - rigY) / s - R * 1.1;
    if (ice.group.position.y > high) {
      ice.group.position.y = high;
      if (vy > 0) vy = -vy * 0.3;
    }

    rig.scale.setScalar(s);
    rig.position.y = rigY;

    dilute += (e - dilute) * Math.min(1, dt * 1.1);
    const dl = smooth(dilute);
    whiskey.scale.y = 1 + dl * 0.075;
    whiskey.position.y = -0.358 * dl * 0.075;
    whiskeyMat.color.copy(neat).lerp(cut, dl * 0.75);
    whiskeyMat.opacity = 0.62 - dl * 0.14;
    whiskeyMat.emissiveIntensity = 0.5 - dl * 0.22;
    whiskeyMat.roughness = 0.05 + dl * 0.02;

    ripple(t, swirlA, 0.35 + Math.abs(vy) * 1.6 + m.bob * 10 + energy * 0.8);
  };

  stage.setObject(set);

  let dir = new THREE.Vector3(0.62, 0.72, 1.12).normalize();
  stage._controls.addEventListener('start', () => { dir = null; });

  const bounds = new THREE.Box3().setFromObject(set).getBoundingSphere(new THREE.Sphere());

  const reframe = () => {
    const camera = stage._camera;
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    const aspect = w / h;

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

  stage._ground.visible = false;
  stage._key.castShadow = false;
  set.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  (function loop() {
    requestAnimationFrame(loop);
    frame();
  })();

  return {
    get state() {
      return state;
    },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    pulse(weight = 0.3) {
      impulse = Math.min(1, impulse + Math.min(1, Math.max(0, weight)));
    },

    rattle(weight = 1) {
      vy += 1.7 * weight;
      vrx += (Math.random() - 0.5) * 2.6 * weight;
      vrz += (Math.random() - 0.5) * 2.6 * weight;
      swirlV += (Math.random() - 0.5) * 1.4 * weight;
      impulse = Math.min(1, impulse + 0.5 * weight);
    },

    melt(on = true) {
      broken = Boolean(on);
      if (broken) sustain = 0;
    },
  };
}

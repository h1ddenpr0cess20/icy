/**
 * The cube itself: a superellipsoid, a frost rim, a frozen core, trapped air.
 *
 * A box with bevelled edges reads as a prop. What makes this read as *ice* is
 * that the block is a unit sphere pushed out to a rounded cube every frame the
 * shape actually changes — the exponent is a parameter, so an edge can soften
 * without a second mesh — with a frozen-in irregularity baked per vertex on top
 * of it. That irregularity never animates: real ice is chipped once, at the
 * freezer, and then holds still.
 *
 * Four parts, all of them cheap:
 *
 *   block    the superellipsoid, transmissive, the only thing with vertices
 *            that move
 *   rim      the same geometry again, scaled up in the vertex shader, additive
 *            fresnel — the cold bloom around the silhouette
 *   core     a cloudy crystal at the centre; this is the "attention", and it is
 *            the only part that glows
 *   bubbles  nine air pockets on fixed orbits, because clear ice is a lie
 *
 * This module builds them and deforms them. What the shape should *be* at any
 * moment is index.js's problem.
 */

/** Half-extent of the block, in rig units. */
export const R = 0.5;

/* The sphere the block is pushed out of. Dense, because the superellipsoid's
   edges are where the vertices are needed and a sphere puts them at the poles. */
const SEGMENTS = [128, 88];

export function createIce(THREE) {
  const group = new THREE.Group();
  group.name = 'ice_cube';

  const iceMat = new THREE.MeshPhysicalMaterial({
    name: 'ice',
    color: new THREE.Color('#eef8ff'),
    transparent: true,
    opacity: 0.99,
    transmission: 0.88,
    thickness: 0.6,
    envMapIntensity: 3.2,
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    ior: 1.31,
    roughness: 0.045,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.015,
    iridescence: 0.05,
    iridescenceIOR: 1.31,
    attenuationDistance: 1.15,
    attenuationColor: new THREE.Color('#a6dcff'),
    sheen: 0,
  });

  const iceGeo = new THREE.SphereGeometry(1, ...SEGMENTS);
  const block = new THREE.Mesh(iceGeo, iceMat);
  block.name = 'block';
  group.add(block);

  /* The unit directions the block is rebuilt from. The position attribute is
     overwritten in place every rebuild, so the sphere it started as has to be
     kept somewhere. */
  const dirs = iceGeo.attributes.position.array.slice();

  /* Frozen-in facet irregularity: three incommensurate waves per vertex, fixed
     for the life of the mesh. Sampled once here rather than in the loop below,
     which is the difference between a sine per vertex per frame and a lookup. */
  const chip = new Float32Array(dirs.length / 3);
  for (let i = 0, j = 0; i < dirs.length; i += 3, j++) {
    const x = dirs[i], y = dirs[i + 1], z = dirs[i + 2];
    chip[j] =
      Math.sin(x * 6.1 + y * 4.3 - z * 5.7) * 0.5 +
      Math.sin(y * 9.4 - z * 7.9 + x * 3.1) * 0.3 +
      Math.sin(z * 13.7 + x * 11.2) * 0.2;
  }

  /* Frost rim: a fresnel bloom bound to the block's own geometry rather than a
     sprite, so it tracks the silhouette exactly as the shape changes. */
  const rimMat = new THREE.ShaderMaterial({
    name: 'frost_rim',
    uniforms: { uColor: { value: new THREE.Color('#bfe6ff') }, uStrength: { value: 0.5 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position * 1.03, 1.0);
        vP = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vP;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(-vP)));
        float a = pow(f, 2.4) * (1.0 - pow(f, 9.0)) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rim = new THREE.Mesh(iceGeo, rimMat);
  rim.name = 'frost_rim';
  group.add(rim);

  /* The frozen core — the one part that is lit from inside. Everything the
     conversation does to the cube's attention happens to this. */
  const coreMat = new THREE.MeshStandardMaterial({
    name: 'core',
    color: new THREE.Color('#cfeaff'),
    emissive: new THREE.Color('#8fd8ff'),
    emissiveIntensity: 1.6,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: 0.4,
  });
  const coreGeo = new THREE.OctahedronGeometry(0.21, 1);
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.name = 'core';
  group.add(core);
  const coreBase = coreGeo.attributes.position.array.slice();

  const bubbleMat = new THREE.MeshPhysicalMaterial({
    name: 'air_bubble',
    color: new THREE.Color('#f4fdff'),
    roughness: 0.04, metalness: 0,
    transmission: 0.95, thickness: 0.06, ior: 1.05,
    transparent: true, opacity: 0.45,
  });
  const bubbles = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.016 + (i % 4) * 0.012, 18, 12), bubbleMat);
    b.name = 'air_bubble_' + (i + 1);
    const a = i * 2.399963, rr = 0.13 + (i % 4) * 0.07; // golden angle, so they don't line up
    b.userData.orbit = { a, rr, y: -0.22 + i * 0.055, sp: 0.12 + (i % 3) * 0.07 };
    bubbles.push(b);
    group.add(b);
  }

  const v = new THREE.Vector3();

  /**
   * Rewrite the block's vertices.
   *
   * @param sharp    superellipsoid exponent — high is a crisp cube, low is a lump
   * @param melt     0..1, how far it has given itself up to the drink
   * @param phase    the animation clock, for the surface glisten
   * @param glisten  how much that glisten shows (it only exists while melting)
   */
  const shape = (sharp, melt, phase, glisten) => {
    const e = melt * melt * (3 - 2 * melt);   // eased melt
    const RP = R * 1.75, HH = R * 0.105;      // the puddle it is heading for
    const pos = iceGeo.attributes.position, arr = pos.array;

    for (let i = 0; i < arr.length; i += 3) {
      const dx = dirs[i], dy = dirs[i + 1], dz = dirs[i + 2];
      // unit sphere -> rounded cube (superellipsoid), exponent = edge sharpness
      const r = 1 / Math.pow(
        Math.pow(Math.abs(dx), sharp) + Math.pow(Math.abs(dy), sharp) + Math.pow(Math.abs(dz), sharp),
        1 / sharp);
      let x = dx * r * R, y = dy * r * R, z = dz * r * R;

      // the frozen-in chipping, plus a wet shine that only exists near a melt
      const rp = 1 + chip[i / 3] * 0.011 * (1 - e) + glisten * 0.0015 * Math.sin(dy * 30 + phase * 3.0);
      x *= rp; y *= rp; z *= rp;

      // dished top, the way a cube freezes in a tray
      y -= Math.max(0, dy) * 0.05 * R * (1 - melt) * (1 - (x * x + z * z) / (R * R));

      if (e > 0.001) {
        // target shape: a rounded slab of meltwater resting on the base plane
        const rho = Math.hypot(dx, dz);
        const d = Math.pow(Math.pow(rho, 4) + Math.pow(Math.abs(dy), 4), 0.25) || 1;
        const wob = 1 + 0.05 * Math.sin(Math.atan2(dz, dx) * 5 + phase * 0.8);
        const tx = (dx / d) * RP * wob, tz = (dz / d) * RP * wob;
        const ty = (dy / d) * HH - R + HH;
        x += (tx - x) * e; y += (ty - y) * e; z += (tz - z) * e;
      }
      arr[i] = x; arr[i + 1] = y; arr[i + 2] = z;
    }
    pos.needsUpdate = true;
    iceGeo.computeVertexNormals();
  };

  /**
   * The core: shivers in place, sinks and dims as the block gives way. Sixty-odd
   * vertices, so this one runs every frame without apology.
   *
   * @param shimmer  how hard it is shivering
   * @param e        eased melt
   * @param phase    the animation clock
   */
  const shiver = (shimmer, e, phase) => {
    const cpos = coreGeo.attributes.position, ca = cpos.array;
    const amount = 0.006 * (1 + shimmer);
    for (let i = 0; i < ca.length; i += 3) {
      v.set(coreBase[i], coreBase[i + 1], coreBase[i + 2]);
      const s = 1 + amount * Math.sin(v.x * 21 + v.y * 13 - phase * 3.1);
      ca[i] = v.x * s; ca[i + 1] = v.y * s; ca[i + 2] = v.z * s;
    }
    cpos.needsUpdate = true;
    coreGeo.computeVertexNormals();

    core.scale.setScalar(1 - e * 0.62);
    core.position.set(
      Math.sin(phase * 0.6) * 0.02 * (1 - e),
      Math.sin(phase * 0.8) * 0.015 * (1 - e) + e * (-R + 0.055),
      Math.cos(phase * 0.5) * 0.02 * (1 - e));
    core.rotation.set(phase * 0.12, phase * 0.21, 0);
  };

  /** The trapped air: fixed orbits, released downward into the pour as it melts. */
  const float = (e, phase) => {
    for (const b of bubbles) {
      const o = b.userData.orbit, a = o.a + phase * o.sp;
      const rr = o.rr * (1 + e * 1.1);
      const fy = o.y + Math.sin(phase * 0.7 + o.a) * 0.03;
      b.position.set(Math.cos(a) * rr, fy + (-R + 0.045 - fy) * e, Math.sin(a) * rr);
      b.scale.setScalar(1 - e * 0.5);
      b.visible = bubbleMat.opacity > 0.005;
    }
  };

  // Frame one already has a cube in it, rather than the sphere it was cut from.
  shape(12, 0, 0, 0);

  return { group, block, rim, core, bubbles, iceMat, rimMat, coreMat, bubbleMat, shape, shiver, float };
}

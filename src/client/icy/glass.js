/**
 * The tumbler and what is in it.
 *
 * Both are lathes, and they share a profile: the pour is cut from the glass's
 * own interior curve, minus a hair, so it sits in the bowl exactly instead of
 * floating inside an approximation of it. That is the whole trick — a cylinder
 * of liquid in a tapered glass leaves a wedge of daylight at the wall, and the
 * eye finds it immediately.
 *
 * The glass never moves. The surface of the drink does, and the cube is
 * responsible for it: see `ripple`.
 */

/* The glass interior, in world units. index.js clamps the cube to these — a
   character that phases through its own props is a character in a bug report. */
export const FLOOR_Y = 0.368;   // where the pour bottoms out
export const RIM_Y = 1.50;      // the lip
export const INNER_R = 0.555;   // the narrowest the bowl gets around the cube
export const WATER_TOP = 1.0;   // the level of a neat pour

/** Neat, and cut with meltwater. The drink pales as the cube gives itself up. */
export const NEAT = '#b8681c';
export const CUT = '#d9a969';

/* The outside wall, over the lip and back down the inside as one path, so the
   rim is a real turn rather than two surfaces meeting at a seam. */
const PROFILE = [
  [0.620, 0.000], [0.656, 0.050], [0.670, 0.600], [0.681, 1.400],
  [0.6825, 1.500], [0.6805, 1.545], [0.6745, 1.573], [0.6655, 1.585],
  [0.6565, 1.578], [0.6505, 1.556], [0.6485, 1.520],
  [0.646, 1.460], [0.630, 0.640], [0.560, 0.420], [0.440, 0.355],
];

/* The same interior, sampled: what the pour is allowed to touch. */
const INNER = [
  [0.442, 0.358], [0.500, 0.395], [0.558, 0.425], [0.600, 0.520],
  [0.630, 0.640], [0.638, 1.100], [0.646, 1.460],
];

/** Interior radius at height `y` — the pour's profile, straight off the glass. */
function innerRadius(y) {
  if (y <= INNER[0][1]) return INNER[0][0];
  for (let i = 1; i < INNER.length; i++) {
    if (y <= INNER[i][1]) {
      const [r0, y0] = INNER[i - 1], [r1, y1] = INNER[i];
      return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
  }
  return INNER[INNER.length - 1][0];
}

export function createGlass(THREE) {
  /* Cut crystal, not window glass: transmission is off and the look is carried
     by a hard clearcoat over the environment. Transmission on both the glass
     and the block would put the cube behind two refraction passes, which costs
     a lot and reads as fog. */
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'glass',
    color: new THREE.Color('#dfeaf7'),
    transparent: true,
    opacity: 0.17,
    transmission: 0,
    envMapIntensity: 3.4,
    ior: 1.5,
    roughness: 0.015,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const glassGeo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 192);

  /* Flutes on the outside wall — a slow radial modulation, faded in off the
     base and out under the rim so the cuts stop where a cutter's wheel would. */
  {
    const gp = glassGeo.attributes.position, ga = gp.array;
    for (let i = 0; i < ga.length; i += 3) {
      const x = ga[i], y = ga[i + 1], z = ga[i + 2];
      if (Math.hypot(x, z) < 0.64 || y < 0.06) continue;   // outer wall only
      const th = Math.atan2(z, x);
      const cut = 1 - 0.022 * Math.pow(Math.abs(Math.cos(th * 8)), 0.7)
        * Math.min(1, (y - 0.05) / 0.25) * Math.min(1, Math.max(0, (1.42 - y) / 0.18));
      ga[i] = x * cut; ga[i + 2] = z * cut;
    }
    gp.needsUpdate = true;
    glassGeo.computeVertexNormals();
  }

  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.name = 'crystal_glass';

  /* Flat caps rather than a pinched lathe centre, which shaded as a starburst
     of radial streaks right where the base is thickest. */
  const under = new THREE.Mesh(new THREE.CircleGeometry(0.620, 96), glassMat);
  under.name = 'base_underside';
  under.rotation.x = Math.PI / 2;
  under.position.y = 0.0005;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.440, 96), glassMat);
  floor.name = 'base_floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.3555;
  glass.add(under, floor);

  /* ---- the pour ---------------------------------------------------------- */

  const whiskeyMat = new THREE.MeshPhysicalMaterial({
    name: 'whiskey',
    color: new THREE.Color(NEAT),
    transparent: true,
    opacity: 0.62,
    transmission: 0,
    envMapIntensity: 1.4,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.04,
    // A dim emissive keeps the body of the drink from going black where nothing
    // reaches it — brown liquid unlit is just a hole in the glass.
    emissive: new THREE.Color('#41190a'),
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const WP = [new THREE.Vector2(0.0015, 0.358)];
  for (let i = 0; i <= 20; i++) {
    const y = 0.358 + (WATER_TOP - 0.358) * (i / 20);
    WP.push(new THREE.Vector2(innerRadius(y) - 0.006, y));
  }
  WP.push(new THREE.Vector2(0.0015, WATER_TOP));

  const whiskeyGeo = new THREE.LatheGeometry(WP, 96);
  const whiskey = new THREE.Mesh(whiskeyGeo, whiskeyMat);
  whiskey.name = 'whiskey';
  const base = whiskeyGeo.attributes.position.array.slice();

  /**
   * Disturb the surface. Only the top ring of the lathe moves — everything
   * below it is the body of the drink and holds still.
   *
   * @param t          seconds
   * @param swirlA     where the cube is around the glass; the wake follows it
   * @param agitation  how hard the surface is being worked, 0..~2
   */
  const ripple = (t, swirlA, agitation) => {
    const pos = whiskeyGeo.attributes.position, arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const by = base[i + 1];
      if (by < WATER_TOP - 0.0005) { arr[i + 1] = by; continue; }
      const bx = base[i], bz = base[i + 2];
      arr[i + 1] = by
        + Math.sin(Math.hypot(bx, bz) * 16 - t * 1.5 - swirlA) * 0.005 * agitation
        + Math.sin(bx * 6 + t * 0.8) * 0.003;
    }
    pos.needsUpdate = true;
    whiskeyGeo.computeVertexNormals();
  };

  return { glass, whiskey, whiskeyMat, ripple };
}

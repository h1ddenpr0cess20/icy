export const FLOOR_Y = 0.368;
export const RIM_Y = 1.50;
export const INNER_R = 0.555;
export const WATER_TOP = 1.0;

export const NEAT = '#b8681c';
export const CUT = '#d9a969';

const PROFILE = [
  [0.620, 0.000], [0.656, 0.050], [0.670, 0.600], [0.681, 1.400],
  [0.6825, 1.500], [0.6805, 1.545], [0.6745, 1.573], [0.6655, 1.585],
  [0.6565, 1.578], [0.6505, 1.556], [0.6485, 1.520],
  [0.646, 1.460], [0.630, 0.640], [0.560, 0.420], [0.440, 0.355],
];

const INNER = [
  [0.442, 0.358], [0.500, 0.395], [0.558, 0.425], [0.600, 0.520],
  [0.630, 0.640], [0.638, 1.100], [0.646, 1.460],
];

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

  {
    const gp = glassGeo.attributes.position, ga = gp.array;
    for (let i = 0; i < ga.length; i += 3) {
      const x = ga[i], y = ga[i + 1], z = ga[i + 2];
      if (Math.hypot(x, z) < 0.64 || y < 0.06) continue;
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

  const under = new THREE.Mesh(new THREE.CircleGeometry(0.620, 96), glassMat);
  under.name = 'base_underside';
  under.rotation.x = Math.PI / 2;
  under.position.y = 0.0005;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.440, 96), glassMat);
  floor.name = 'base_floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.3555;
  glass.add(under, floor);

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

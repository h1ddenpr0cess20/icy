/**
 * Cold studio environment: bright sky, dark floor, three specular sources.
 *
 * This one is load-bearing in a way a stone's would not be. Ice is defined
 * entirely by what it bends and reflects — with nothing in the environment map
 * a transmissive block renders as grey jelly, and the frost rim has nothing to
 * catch. A 96×48 canvas gradient with a couple of blown-out highlights is
 * enough: PMREM blurs it by roughness, and the block's own curvature smears it
 * into exactly the streaked highlights ice has.
 *
 * A nicety in the sense that a failure here must not take the page down — but
 * the cube looks wrong without it.
 */

export function buildEnvironment({ stage, THREE }) {
  try {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 48;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, '#ffffff');    // overhead, blown out
    g.addColorStop(0.4, '#dceaff');
    g.addColorStop(0.55, '#5c6b85'); // horizon
    g.addColorStop(1, '#141824');    // the dark the glass sits in
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 48);

    // Two hard sources and a cool one, so a turning block has something to
    // sweep through rather than one even wash.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(26, 10, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(64, 6, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,225,255,0.95)';
    ctx.beginPath(); ctx.ellipse(78, 20, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    // A bright band at the horizon: this is what becomes the long highlight
    // down the side of the glass.
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(0, 22, 96, 2);

    const tex = new THREE.Texture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(stage._renderer);
    stage._scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  } catch {
    /* environment is a nicety, not a requirement */
  }
}

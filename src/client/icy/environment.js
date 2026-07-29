export function buildEnvironment({ stage, THREE }) {
  try {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 48;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#dceaff');
    g.addColorStop(0.55, '#5c6b85');
    g.addColorStop(1, '#141824');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 48);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(26, 10, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(64, 6, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,225,255,0.95)';
    ctx.beginPath(); ctx.ellipse(78, 20, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
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
  }
}

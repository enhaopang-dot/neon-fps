/* ==========================================================
   40 · 武器：枪模 / 射击 / 粒子 / 弹孔 / 音效
   ========================================================== */

/* ---------------- 音频（全合成，零外部资源） ---------------- */
NR.audio = (function () {
  let ctx = null;
  let noiseBuf = null;
  let rainGain = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // 噪声缓冲
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 环境雨声
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    rainGain = ctx.createGain(); rainGain.gain.value = 0.045;
    src.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(ctx.destination);
    src.start();
    return ctx;
  }

  function burst(freq, q, dur, gain, type = 'bandpass') {
    const c = init(); if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function tone(f0, f1, dur, gain, type = 'sine') {
    const c = init(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    init,
    shot() {
      burst(1250, 0.7, 0.16, 0.55);
      burst(420, 0.9, 0.28, 0.30);
      tone(180, 42, 0.14, 0.55);
    },
    hit() { burst(2600, 2.2, 0.09, 0.34, 'bandpass'); tone(1400, 820, 0.07, 0.16, 'triangle'); },
    kill() { burst(900, 0.8, 0.5, 0.4); tone(320, 60, 0.5, 0.35, 'sawtooth'); },
    reload() { burst(700, 3.0, 0.07, 0.3); setTimeout(() => burst(480, 2.4, 0.09, 0.28), 260); },
    empty() { burst(3200, 6.0, 0.05, 0.22); },
    hurt() { tone(260, 70, 0.32, 0.42, 'square'); burst(300, 0.6, 0.28, 0.25); },
    ui() { tone(760, 1180, 0.10, 0.14, 'triangle'); },
  };
})();

/* ---------------- 枪模 ---------------- */
const weapon = new T.Group();
const WSCENE = NR.core.weaponScene;
const WCAM = NR.core.weaponCam;
WSCENE.add(weapon);
scene.add(camera);
NR.weaponGroup = weapon;

// 武器层渲染通道（清深度不清颜色，叠在主画面上）
{
  const wp = new T.RenderPass(WSCENE, WCAM);
  wp.clear = false;
  wp.clearDepth = true;
  NR.core.composer.insertPass(wp, 1);
}

const gunMetal = new T.MeshStandardMaterial({ color: 0x1e232c, roughness: 0.34, metalness: 0.98, envMapIntensity: 1.7 });
const gunPoly = new T.MeshStandardMaterial({ color: 0x101319, roughness: 0.62, metalness: 0.45, envMapIntensity: 1.2 });

// 武器补光：近距离衰减，只照亮枪身
const weaponFill = new T.PointLight(0x9fd4ff, 11, 3.2, 2.0);
weaponFill.position.set(0.55, 0.55, -0.15);
WSCENE.add(weaponFill);
const weaponRim = new T.PointLight(0xff5c8a, 2.6, 2.6, 2.0);
weaponRim.position.set(-0.75, -0.25, -0.55);
WSCENE.add(weaponRim);
const weaponKey = new T.PointLight(0xffd0a0, 13, 3.0, 2.0);
weaponKey.position.set(-0.2, 0.9, 0.4);
WSCENE.add(weaponKey);
const gunGlow = new T.MeshBasicMaterial({ color: new T.Color(0x3fe0ff).multiplyScalar(2.2), toneMapped: false });

// 圆角盒：枪的硬边被柔化后质感差别很大
const rbox = (w, h, d, r = 0.008) =>
  new T.RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.3));

function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  weapon.add(m);
  return m;
}

// 机匣
part(rbox(0.074, 0.094, 0.27), gunMetal, 0, 0, -0.02);
// 上导轨
part(rbox(0.044, 0.017, 0.24), gunPoly, 0, 0.055, -0.05);
// 护木
part(rbox(0.060, 0.064, 0.20), gunPoly, 0, 0.002, -0.26);
// 护木散热槽
for (let i = 0; i < 6; i++) {
  part(rbox(0.064, 0.006, 0.010), gunMetal, 0, 0.030, -0.185 - i * 0.028);
}
// 枪管
part(new T.CylinderGeometry(0.0095, 0.0095, 0.19, 12), gunMetal, 0, 0.005, -0.42, Math.PI / 2);
// 消焰器
part(new T.CylinderGeometry(0.019, 0.0165, 0.052, 12), gunMetal, 0, 0.005, -0.525, Math.PI / 2);
// 弹匣
part(rbox(0.042, 0.135, 0.068), gunPoly, 0, -0.095, -0.010, 0.18);
// 握把
part(rbox(0.036, 0.105, 0.052), gunPoly, 0, -0.080, 0.098, -0.32);
// 折叠枪托（短）
part(rbox(0.046, 0.066, 0.115), gunPoly, 0, 0.003, 0.185);
part(rbox(0.050, 0.080, 0.018), gunPoly, 0, 0.001, 0.250);
// 前握把
part(rbox(0.030, 0.080, 0.038), gunPoly, 0, -0.062, -0.245, 0.08);
// 瞄具
part(rbox(0.026, 0.028, 0.026), gunPoly, 0, 0.074, 0.062);
part(rbox(0.018, 0.040, 0.016), gunPoly, 0, 0.074, -0.285);
// 发光装饰
part(rbox(0.003, 0.010, 0.22), gunGlow, -0.0385, 0.008, -0.02);
part(rbox(0.003, 0.007, 0.16), gunGlow, 0.0385, 0.026, 0.0);
// 机匣散热片
for (let i = 0; i < 4; i++) {
  part(rbox(0.078, 0.005, 0.010), gunMetal, 0, 0.026, -0.075 + i * 0.036);
}

weapon.scale.setScalar(0.72);

// 红点镜发光点
const dotMat = new T.MeshBasicMaterial({ color: new T.Color(0xff2f5e).multiplyScalar(3.0), toneMapped: false });
const dot = new T.Mesh(new T.SphereGeometry(0.0035, 8, 8), dotMat);
dot.position.set(0, 0.086, 0.060);
weapon.add(dot);

// 枪口火光
const muzzleFlash = new T.Mesh(
  new T.PlaneGeometry(0.26, 0.26),
  new T.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        // 四角星形火焰 + 中心热核
        float d = length(p);
        float star = max(0.0, 1.0 - abs(p.x)*3.2) * max(0.0, 1.0 - abs(p.y)*0.9)
                   + max(0.0, 1.0 - abs(p.y)*3.2) * max(0.0, 1.0 - abs(p.x)*0.9);
        float core = smoothstep(0.62, 0.0, d);
        float a = clamp(core * 0.85 + star * 0.55, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.96, 0.82), core);
        gl_FragColor = vec4(col * (1.4 + core), a * a);
      }`,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
);
muzzleFlash.position.set(0, 0.006, -0.60);
muzzleFlash.visible = false;
weapon.add(muzzleFlash);

const muzzleLight = new T.PointLight(0xffb060, 0, 3.2, 2.0);
muzzleLight.position.set(0, 0.01, -0.58);
weapon.add(muzzleLight);

// 主场景那边同步闪一下，照亮环境
const muzzleLightWorld = new T.PointLight(0xffb060, 0, 16, 2.0);
muzzleLightWorld.position.set(0.2, -0.2, -1.0);
camera.add(muzzleLightWorld);

// 枪口位置（世界坐标用）
const _v = new T.Vector3();

/* ---------------- 粒子池（火花 / 爆裂） ---------------- */
const PCOUNT = 900;
const pGeo = new T.BufferGeometry();
const pPos = new Float32Array(PCOUNT * 3);
const pCol = new Float32Array(PCOUNT * 3);
const pSize = new Float32Array(PCOUNT);
const pAlpha = new Float32Array(PCOUNT);
const pVel = new Float32Array(PCOUNT * 3);
const pLife = new Float32Array(PCOUNT);
const pMaxLife = new Float32Array(PCOUNT);
pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
pGeo.setAttribute('aColor', new T.BufferAttribute(pCol, 3));
pGeo.setAttribute('aSize', new T.BufferAttribute(pSize, 1));
pGeo.setAttribute('aAlpha', new T.BufferAttribute(pAlpha, 1));
pGeo.boundingSphere = new T.Sphere(new T.Vector3(), 9999);

const pMat = new T.ShaderMaterial({
  uniforms: { uScale: { value: window.innerHeight * 0.5 } },
  vertexShader: /* glsl */ `
    attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
    varying vec3 vColor; varying float vAlpha;
    uniform float uScale;
    void main(){
      vColor = aColor; vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uScale / max(-mv.z, 0.5);
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vColor; varying float vAlpha;
    void main(){
      vec2 pc = gl_PointCoord - vec2(0.5);
      float d = length(pc);
      float a = smoothstep(0.5, 0.0, d) * vAlpha;
      if(a < 0.01) discard;
      gl_FragColor = vec4(vColor * (1.0 + (1.0-d)*1.6), a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: T.AdditiveBlending,
});
const particles = new T.Points(pGeo, pMat);
particles.frustumCulled = false;
scene.add(particles);

let pCursor = 0;
function spawnParticle(x, y, z, vx, vy, vz, color, size, life) {
  const i = pCursor = (pCursor + 1) % PCOUNT;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pCol[i * 3] = color.r; pCol[i * 3 + 1] = color.g; pCol[i * 3 + 2] = color.b;
  pSize[i] = size;
  pLife[i] = life; pMaxLife[i] = life;
  pAlpha[i] = 1;
}
NR.spawnParticle = spawnParticle;

function burst(x, y, z, color, count, spread, size, life) {
  for (let i = 0; i < count; i++) {
    const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1));
    const sp = rand(spread * 0.3, spread);
    spawnParticle(
      x, y, z,
      Math.sin(ph) * Math.cos(th) * sp,
      Math.cos(ph) * sp * 0.9 + rand(0.5, 2.5),
      Math.sin(ph) * Math.sin(th) * sp,
      color, rand(size * 0.5, size), rand(life * 0.6, life)
    );
  }
}
NR.burst = burst;

function updateParticles(dt) {
  for (let i = 0; i < PCOUNT; i++) {
    if (pLife[i] <= 0) { if (pAlpha[i] !== 0) pAlpha[i] = 0; continue; }
    pLife[i] -= dt;
    const k = Math.max(pLife[i] / pMaxLife[i], 0);
    pAlpha[i] = k * k;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pVel[i * 3 + 1] -= 9.4 * dt;
    pVel[i * 3] *= 1 - dt * 1.6;
    pVel[i * 3 + 2] *= 1 - dt * 1.6;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.aAlpha.needsUpdate = true;
  pGeo.attributes.aColor.needsUpdate = true;
  pGeo.attributes.aSize.needsUpdate = true;
}

/* ---------------- 弹孔贴片 ---------------- */
const HOLE_MAX = 34;
const holeMeshes = [];
{
  const holeTex = canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.98)');
    g.addColorStop(0.35, 'rgba(10,10,12,0.85)');
    g.addColorStop(0.62, 'rgba(30,32,38,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  for (let i = 0; i < HOLE_MAX; i++) {
    const m = new T.Mesh(
      new T.PlaneGeometry(0.13, 0.13),
      new T.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false })
    );
    m.visible = false;
    scene.add(m);
    holeMeshes.push(m);
  }
}
let holeCursor = 0;
function addHole(point, normal) {
  const m = holeMeshes[holeCursor = (holeCursor + 1) % HOLE_MAX];
  m.position.copy(point).addScaledVector(normal, 0.008);
  m.lookAt(_v.copy(point).add(normal));
  m.rotateZ(rand(0, Math.PI * 2));
  m.material.opacity = 0.95;
  m.visible = true;
}

/* ---------------- 曳光 ---------------- */
{
  const tg = new T.BufferGeometry();
  tg.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
  const tm = new T.LineBasicMaterial({
    color: new T.Color(0xffd9a0).multiplyScalar(2.4),
    transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
  });
  const line = new T.Line(tg, tm);
  line.frustumCulled = false;
  scene.add(line);
  NR.tracer = { line, mat: tm, life: 0 };
}

/* ---------------- 弹壳 ---------------- */
const shells = [];
{
  const shellGeo = new T.CylinderGeometry(0.009, 0.009, 0.028, 6);
  const shellMat = new T.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.6 });
  for (let i = 0; i < 14; i++) {
    const s = new T.Mesh(shellGeo, shellMat);
    s.visible = false;
    NR.core.weaponScene.add(s);
    shells.push({ mesh: s, vel: new T.Vector3(), rot: new T.Vector3(), life: 0 });
  }
}
let shellCursor = 0;

/* ---------------- 武器状态机 ---------------- */
const W = {
  ammo: 30,
  magSize: 30,
  reserve: Infinity,
  lastShot: 0,
  fireRate: 0.098,
  recoil: 0,
  recoilV: 0,
  kick: new T.Vector3(),
  bobT: 0,
  reloading: false,
  reloadEnd: 0,
  swayX: 0,
  swayY: 0,
  shooting: false,
  canShoot: true,
};
NR.W = W;

const _ray = new T.Raycaster();
const _dir = new T.Vector3();
const _muzzleWorld = new T.Vector3();

NR.getShootables = () => [];  // 由 game.js 覆写

function fire() {
  if (W.reloading) return;
  if (W.ammo <= 0) {
    NR.audio.empty();
    NR.onEmpty && NR.onEmpty();
    return;
  }
  const now = performance.now() / 1000;
  if (now - W.lastShot < W.fireRate) return;
  W.lastShot = now;
  W.ammo--;

  NR.audio.shot();

  // 枪口效果
  muzzleFlash.visible = true;
  muzzleFlash.rotation.z = rand(0, Math.PI * 2);
  muzzleFlash.scale.setScalar(rand(0.8, 1.25));
  muzzleLight.intensity = 26;
  muzzleLightWorld.intensity = 42;
  setTimeout(() => { muzzleFlash.visible = false; muzzleLight.intensity = 0; muzzleLightWorld.intensity = 0; }, 55);

  // 后坐
  W.recoilV += rand(0.055, 0.085);
  W.kick.z += 0.045;
  W.kick.x += rand(-0.008, 0.008);

  // 弹壳
  {
    const s = shells[shellCursor = (shellCursor + 1) % shells.length];
    weapon.localToWorld(_v.set(0.05, 0.02, 0.06));
    s.mesh.position.copy(_v);
    s.mesh.visible = true;
    s.life = 2.2;
    s.vel.set(rand(1.2, 2.4), rand(1.4, 2.6), rand(0.4, 1.2));
    s.rot.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
  }

  // 射线
  camera.getWorldDirection(_dir);
  // 轻微散布
  const spread = 0.004 + W.recoil * 0.02;
  _dir.x += rand(-spread, spread);
  _dir.y += rand(-spread, spread);
  _dir.z += rand(-spread, spread);
  _dir.normalize();

  _ray.set(camera.getWorldPosition(_muzzleWorld), _dir);
  _ray.far = 120;
  const targets = NR.getShootables();
  const hits = _ray.intersectObjects(targets, false);

  let point = _muzzleWorld.clone().addScaledVector(_dir, 90);
  let hitSomething = false;
  let hitObj = null;

  if (hits.length) {
    point = hits[0].point.clone();
    hitObj = hits[0].object;
    hitSomething = true;
    if (hitObj.userData && hitObj.userData.onHit) {
      hitObj.userData.onHit(hits[0], _dir);
    } else {
      addHole(hits[0].point, hits[0].face ? hits[0].face.normal.clone().transformDirection(hitObj.matrixWorld) : _dir.clone().negate());
      burst(point.x, point.y, point.z, new T.Color(0xffc070), 7, 2.2, 0.03, 0.28);
    }
  } else {
    // 打空：落到地面
    _ray.set(camera.getWorldPosition(_muzzleWorld), _dir);
    const groundHits = NR.road ? _ray.intersectObject(NR.road, false) : [];
    if (groundHits.length) {
      point = groundHits[0].point.clone();
      addHole(point, new T.Vector3(0, 1, 0));
      burst(point.x, point.y, point.z, new T.Color(0xffc070), 6, 2.0, 0.03, 0.26);
    }
  }

  // 曳光
  {
    const tr = NR.tracer;
    camera.localToWorld(_v.set(0.16, -0.13, -0.9));
    const pos = tr.line.geometry.attributes.position;
    pos.setXYZ(0, _v.x, _v.y, _v.z);
    pos.setXYZ(1, point.x, point.y, point.z);
    pos.needsUpdate = true;
    tr.life = 0.06;
    tr.mat.opacity = 0.85;
  }

  NR.onShot && NR.onShot(hitSomething, hitObj, point, _dir);
}

NR.fire = fire;

/* ---------------- 换弹 ---------------- */
NR.reload = function () {
  if (W.reloading || W.ammo === W.magSize) return;
  W.reloading = true;
  NR.audio.reload();
  W.reloadEnd = performance.now() / 1000 + 1.35;
};

/* ---------------- 每帧更新 ---------------- */
let bobPhase = 0;
NR.updateWeapon = function (dt, moveAmount, t) {
  // 换弹
  if (W.reloading && performance.now() / 1000 > W.reloadEnd) {
    W.reloading = false;
    W.ammo = W.magSize;
  }

  // 后坐回弹
  W.recoilV *= Math.pow(0.0016, dt);
  W.recoil += W.recoilV * dt * 60;
  W.recoil *= Math.pow(0.02, dt);
  W.kick.multiplyScalar(Math.pow(0.0025, dt));

  // 行走摆动
  bobPhase += dt * (6.5 + moveAmount * 5.5);
  const bobX = Math.sin(bobPhase) * 0.011 * moveAmount;
  const bobY = Math.abs(Math.cos(bobPhase)) * 0.013 * moveAmount;

  // 换弹动画
  let reloadRot = 0, reloadDrop = 0;
  if (W.reloading) {
    const k = 1 - Math.max(0, (W.reloadEnd - performance.now() / 1000) / 1.35);
    const s = Math.sin(k * Math.PI);
    reloadRot = s * 0.85;
    reloadDrop = s * 0.16;
  }

  const targetX = bobX + W.kick.x + NR.weaponSwayX;
  const targetY = -bobY + W.kick.y + NR.weaponSwayY - reloadDrop;
  const targetZ = W.kick.z + W.recoil * 0.35;

  weapon.position.x += (0.185 + targetX - weapon.position.x) * Math.min(1, dt * 15);
  weapon.position.y += (-0.125 + targetY - weapon.position.y) * Math.min(1, dt * 15);
  weapon.position.z += (-0.60 + targetZ - weapon.position.z) * Math.min(1, dt * 15);
  weapon.rotation.x += (-0.085 - W.recoil * 1.15 + reloadRot * 0.6 - weapon.rotation.x) * Math.min(1, dt * 16);
  weapon.rotation.z += (reloadRot * 0.5 + W.recoil * 0.4 - weapon.rotation.z) * Math.min(1, dt * 14);
  weapon.rotation.y += (0.055 + reloadRot * 0.3 - weapon.rotation.y) * Math.min(1, dt * 12);

  // 粒子
  updateParticles(dt);

  // 弹孔淡出
  for (const m of holeMeshes) {
    if (!m.visible) continue;
    m.material.opacity -= dt * 0.05;
    if (m.material.opacity <= 0) m.visible = false;
  }

  // 曳光
  const tr = NR.tracer;
  if (tr.life > 0) {
    tr.life -= dt;
    tr.mat.opacity = Math.max(0, tr.life / 0.06) * 0.85;
  } else if (tr.mat.opacity > 0) tr.mat.opacity = 0;

  // 弹壳
  for (const s of shells) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.vel.y -= 13 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    if (s.mesh.position.y < 0.03) {
      s.mesh.position.y = 0.03;
      s.vel.y *= -0.32;
      s.vel.x *= 0.6; s.vel.z *= 0.6;
    }
    s.mesh.rotation.x += s.rot.x * dt;
    s.mesh.rotation.y += s.rot.y * dt;
    s.mesh.rotation.z += s.rot.z * dt;
  }

  // 枪口光衰减
  if (muzzleLight.intensity > 0) muzzleLight.intensity *= Math.pow(0.02, dt);
};

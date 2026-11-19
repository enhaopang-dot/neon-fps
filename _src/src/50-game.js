/* ==========================================================
   50 · 玩法：玩家 / 靶子 / 无人机 / 主循环 / HUD
   ========================================================== */

/* ---------------- 玩家 ---------------- */
const player = {
  pos: new T.Vector3(0, 1.68, 16),
  vel: new T.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: true,
  hp: 100,
  recoilPitch: 0,
  shake: 0,
  hurtFlash: 0,
};
NR.player = player;
camera.rotation.order = 'YXZ';

const BOUND = { x: 6.35, zMin: -72, zMax: 19 };

/* ---------------- 状态 ---------------- */
const G = {
  state: 'menu',
  score: 0,
  shots: 0,
  hits: 0,
  combo: 0,
  maxCombo: 0,
  comboTimer: 0,
  timeLeft: 60,
  dronesDown: 0,
  dronesTotal: 4,
};
NR.G = G;

/* ---------------- 霓虹靶 ---------------- */
const targets = [];
const targetGroup = new T.Group();
scene.add(targetGroup);

const targetColors = [0x3fe0ff, 0xff2f8e, 0xffb02e, 0x2bffb0];

function makeTarget(i) {
  const g = new T.Group();
  const col = new T.Color(targetColors[i % targetColors.length]);
  const ringMat = new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), toneMapped: false });
  const coreMat = new T.MeshBasicMaterial({
    color: col.clone().multiplyScalar(1.1),
    transparent: true, opacity: 0.55, side: T.DoubleSide, toneMapped: false, depthWrite: false,
  });

  const ring = new T.Mesh(new T.TorusGeometry(0.42, 0.045, 10, 36), ringMat);
  g.add(ring);
  const ring2 = new T.Mesh(new T.TorusGeometry(0.20, 0.028, 8, 28), ringMat);
  g.add(ring2);
  const core = new T.Mesh(new T.CircleGeometry(0.14, 20), coreMat);
  g.add(core);

  // 命中判定用的隐形球体（比视觉略大，手感友好）
  const hitMat = new T.MeshBasicMaterial({ visible: false });
  const hitSphere = new T.Mesh(new T.SphereGeometry(0.46, 8, 6), hitMat);
  hitSphere.userData.targetIndex = i;
  g.add(hitSphere);

  scene.add(g);
  return {
    group: g, ring, ring2, core, hitSphere, color: col,
    base: new T.Vector3(), phase: rand(0, 6.28), speed: rand(0.4, 1.1),
    bobAmp: rand(0.12, 0.4), orbit: rnd() < 0.4, orbitR: rand(0.8, 2.2),
    alive: true, respawnAt: 0, scale: 1,
  };
}

const TARGET_COUNT = 12;
for (let i = 0; i < TARGET_COUNT; i++) {
  const t = makeTarget(i);
  targets.push(t);
  respawnTarget(t, true);
}

function respawnTarget(t, instant) {
  t.base.set(rand(-5.2, 5.2), rand(1.5, 4.4), rand(-62, 8));
  t.group.position.copy(t.base);
  t.alive = true;
  t.scale = instant ? 1 : 0.01;
  t.group.visible = true;
  t.hitSphere.userData.onHit = (hit, dir) => onTargetHit(t, hit, dir);
}

function onTargetHit(t, hit, dir) {
  if (!t.alive) return;
  t.alive = false;
  t.group.visible = false;
  t.respawnAt = performance.now() / 1000 + rand(0.9, 1.8);

  G.hits++;
  G.combo++;
  G.comboTimer = 1.8;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
  const gain = Math.round(100 * mult);
  G.score += gain;

  NR.audio.hit();
  const p = hit.point;
  burst(p.x, p.y, p.z, t.color.clone().multiplyScalar(2.0), 34, 7.5, 0.075, 0.62);
  burst(p.x, p.y, p.z, new T.Color(0xffffff), 12, 4.0, 0.05, 0.35);
  showCombo(mult, gain);
  flashHitmark();
}

/* ---------------- 无人机 ---------------- */
const drones = [];
const droneGroup = new T.Group();
scene.add(droneGroup);

function makeDrone(idx) {
  const g = new T.Group();
  const bodyMat = new T.MeshStandardMaterial({ color: 0x333a46, roughness: 0.35, metalness: 0.95, envMapIntensity: 1.6 });
  const eyeMat = new T.MeshBasicMaterial({ color: new T.Color(0xff2040).multiplyScalar(3.0), toneMapped: false });

  const core = new T.Mesh(new T.OctahedronGeometry(0.30, 0), bodyMat);
  g.add(core);
  const ring = new T.Mesh(new T.TorusGeometry(0.46, 0.035, 8, 30), bodyMat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const eye = new T.Mesh(new T.SphereGeometry(0.085, 12, 10), eyeMat);
  eye.position.set(0, 0, 0.28);
  g.add(eye);

  const hitMat = new T.MeshBasicMaterial({ visible: false });
  const hitSphere = new T.Mesh(new T.SphereGeometry(0.55, 8, 6), hitMat);
  g.add(hitSphere);

  scene.add(g);
  return {
    group: g, ring, eye, hitSphere, hp: 3,
    base: new T.Vector3(rand(-4, 4), rand(2.6, 5.2), rand(-58, -12)),
    phase: rand(0, 6.28), alive: true,
    fireAt: performance.now() / 1000 + rand(2, 5),
    deathAt: 0,
  };
}

for (let i = 0; i < G.dronesTotal; i++) {
  const d = makeDrone(i);
  drones.push(d);
  d.hitSphere.userData.onHit = (hit, dir) => onDroneHit(d, hit, dir);
}

function onDroneHit(d, hit, dir) {
  if (!d.alive) return;
  d.hp--;
  G.hits++;
  const p = hit.point;
  burst(p.x, p.y, p.z, new T.Color(0xff8040), 14, 4.5, 0.05, 0.4);
  flashHitmark();
  if (d.hp > 0) {
    NR.audio.hit();
    return;
  }
  d.alive = false;
  d.group.visible = false;
  G.dronesDown++;
  G.score += 300;
  NR.audio.kill();
  burst(p.x, p.y, p.z, new T.Color(0xff6030), 48, 9, 0.09, 0.8);
  burst(p.x, p.y, p.z, new T.Color(0xffffff), 16, 5, 0.06, 0.5);
}

/* ---------------- 敌方子弹 ---------------- */
const bullets = [];
{
  const bGeo = new T.SphereGeometry(0.085, 8, 8);
  const bMat = new T.MeshBasicMaterial({ color: new T.Color(0xff3040).multiplyScalar(3.2), toneMapped: false });
  for (let i = 0; i < 26; i++) {
    const m = new T.Mesh(bGeo, bMat);
    m.visible = false;
    scene.add(m);
    bullets.push({ mesh: m, vel: new T.Vector3(), life: 0 });
  }
}
let bulletCursor = 0;

function fireBullet(from) {
  const b = bullets[bulletCursor = (bulletCursor + 1) % bullets.length];
  b.mesh.position.copy(from);
  b.mesh.visible = true;
  b.life = 5;
  const to = player.pos.clone().add(new T.Vector3(rand(-0.35, 0.35), rand(-0.3, 0.3), rand(-0.35, 0.35)));
  b.vel.copy(to).sub(from).normalize().multiplyScalar(13.5);
}

/* ---------------- 输入 ---------------- */
const keys = {};
let mouseDown = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR' && G.state === 'playing') NR.reload();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (G.state === 'playing' && document.pointerLockElement === canvas) {
    mouseDown = true;
  }
});
window.addEventListener('mouseup', () => { mouseDown = false; });

const SENS = 0.0021;
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * SENS;
  player.pitch -= e.movementY * SENS;
  player.pitch = Math.max(-1.48, Math.min(1.48, player.pitch));
  NR.weaponSwayX = Math.max(-0.03, Math.min(0.03, -e.movementX * 0.0009));
  NR.weaponSwayY = Math.max(-0.03, Math.min(0.03, e.movementY * 0.0009));
});
NR.weaponSwayX = 0; NR.weaponSwayY = 0;

canvas.addEventListener('click', () => {
  if (G.state === 'playing' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.state === 'playing') {
    G.state = 'paused';
    showOverlay('paused');
  }
});

/* ---------------- HUD ---------------- */
const el = {
  score: document.getElementById('score'),
  acc: document.getElementById('acc'),
  time: document.getElementById('time'),
  hp: document.getElementById('hp'),
  mag: document.getElementById('mag'),
  combo: document.getElementById('combo'),
  hitmark: document.getElementById('hitmark'),
  dmg: document.getElementById('dmg'),
  hud: document.getElementById('hud'),
  overlay: document.getElementById('overlay'),
  intro: document.getElementById('intro'),
  result: document.getElementById('result'),
  grade: document.getElementById('grade'),
  rScore: document.getElementById('rScore'),
  rAcc: document.getElementById('rAcc'),
  rCombo: document.getElementById('rCombo'),
  rDrones: document.getElementById('rDrones'),
  startBtn: document.getElementById('startBtn'),
  startBtn2: document.getElementById('startBtn2'),
};

let comboHideAt = 0;
let dmgHideAt = 0;
let hitmarkHideAt = 0;

function showCombo(mult, gain) {
  if (mult < 2) {
    el.combo.style.opacity = 0;
    return;
  }
  el.combo.textContent = '×' + mult;
  el.combo.classList.add('pop');
  comboHideAt = performance.now() + 420;
}
function flashHitmark() {
  el.hitmark.classList.add('on');
  hitmarkHideAt = performance.now() + 90;
}
function flashDamage() {
  el.dmg.style.opacity = 1;
  dmgHideAt = performance.now() + 120;
}

function updateHUD() {
  el.score.textContent = G.score;
  el.acc.textContent = `命中 ${G.hits} / ${G.shots}`;
  el.time.textContent = Math.ceil(Math.max(0, G.timeLeft));
  el.hp.style.width = Math.max(0, player.hp) + '%';
  el.hp.classList.toggle('low', player.hp <= 35);
  el.mag.textContent = NR.W.reloading ? '—' : NR.W.ammo;

  if (comboHideAt && performance.now() > comboHideAt) {
    el.combo.classList.remove('pop');
    comboHideAt = 0;
  }
  if (hitmarkHideAt && performance.now() > hitmarkHideAt) {
    el.hitmark.classList.remove('on');
    hitmarkHideAt = 0;
  }
  if (dmgHideAt && performance.now() > dmgHideAt) {
    el.dmg.style.opacity = 0;
    dmgHideAt = 0;
  }
}

/* ---------------- 遮罩 / 流程 ---------------- */
function showOverlay(kind) {
  el.overlay.classList.remove('hide');
  el.hud.classList.remove('on');
  if (kind === 'result') {
    el.intro.style.display = 'none';
    el.result.classList.add('on');
  } else {
    el.intro.style.display = 'block';
    el.result.classList.remove('on');
    if (kind === 'paused') {
      el.startBtn.textContent = 'RESUME';
    } else {
      el.startBtn.textContent = 'CLICK TO DEPLOY';
    }
  }
}

function resetGame() {
  G.score = 0; G.shots = 0; G.hits = 0; G.combo = 0; G.maxCombo = 0;
  G.comboTimer = 0; G.timeLeft = 60; G.dronesDown = 0;
  player.hp = 100;
  player.pos.set(0, 1.68, 16);
  player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0;
  NR.W.ammo = NR.W.magSize;
  NR.W.reloading = false;

  for (const t of targets) {
    respawnTarget(t, false);
  }
  for (const d of drones) {
    d.alive = true; d.hp = 3; d.group.visible = true;
    d.base.set(rand(-4, 4), rand(2.6, 5.2), rand(-58, -12));
    d.fireAt = performance.now() / 1000 + rand(2, 5);
  }
  for (const b of bullets) { b.life = 0; b.mesh.visible = false; }
  updateHUD();
}

function startGame() {
  resetGame();
  NR.audio.init();
  NR.audio.ui();
  el.overlay.classList.add('hide');
  el.hud.classList.add('on');
  G.state = 'playing';
  canvas.requestPointerLock();
  clock.getDelta();
}

function endGame() {
  if (G.state === 'ended') return;
  G.state = 'ended';
  document.exitPointerLock();
  NR.audio.ui();
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  el.rScore.textContent = G.score;
  el.rAcc.textContent = acc + '%';
  el.rCombo.textContent = G.maxCombo;
  el.rDrones.textContent = `${G.dronesDown} / ${G.dronesTotal}`;
  let grade = 'C';
  if (G.score >= 4200) grade = 'S';
  else if (G.score >= 3000) grade = 'A';
  else if (G.score >= 1800) grade = 'B';
  el.grade.textContent = grade;
  showOverlay('result');
}

el.startBtn.addEventListener('click', () => {
  if (G.state === 'menu' || G.state === 'paused') startGame();
});
el.startBtn2.addEventListener('click', () => {
  G.state = 'menu';
  startGame();
});

/* ---------------- 命中回调 ---------------- */
NR.getShootables = function () {
  const list = [];
  for (const t of targets) if (t.alive) list.push(t.hitSphere);
  for (const d of drones) if (d.alive) list.push(d.hitSphere);
  // 场景静态物体：用于打墙留弹孔
  return list;
};

NR.onShot = function (hitSomething, hitObj, point, dir) {
  G.shots++;
  player.shake = Math.min(1, player.shake + 0.28);
  player.recoilPitch += 0.006;
};

/* ---------------- 主循环 ---------------- */
const clock = new T.Clock();
let elapsed = 0;

function updatePlayer(dt) {
  const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 7.2 : 4.3;
  const forward = new T.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new T.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const move = new T.Vector3();
  if (keys['KeyW']) move.add(forward);
  if (keys['KeyS']) move.sub(forward);
  if (keys['KeyD']) move.add(right);
  if (keys['KeyA']) move.sub(right);

  const moving = move.lengthSq() > 0;
  if (moving) move.normalize();

  const targetVX = move.x * speed;
  const targetVZ = move.z * speed;
  const accel = player.onGround ? 14 : 4;
  player.vel.x += (targetVX - player.vel.x) * Math.min(1, dt * accel);
  player.vel.z += (targetVZ - player.vel.z) * Math.min(1, dt * accel);

  if ((keys['Space']) && player.onGround) {
    player.vel.y = 4.6;
    player.onGround = false;
  }
  player.vel.y -= 17 * dt;

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  // 地面
  if (player.pos.y <= 1.68) {
    player.pos.y = 1.68;
    player.vel.y = 0;
    player.onGround = true;
  }

  // 边界
  player.pos.x = Math.max(-BOUND.x, Math.min(BOUND.x, player.pos.x));
  player.pos.z = Math.max(BOUND.zMin, Math.min(BOUND.zMax, player.pos.z));

  // 方向键备用视角
  if (keys['ArrowLeft']) player.yaw += dt * 1.7;
  if (keys['ArrowRight']) player.yaw -= dt * 1.7;
  if (keys['ArrowUp']) player.pitch = Math.min(1.48, player.pitch + dt * 1.2);
  if (keys['ArrowDown']) player.pitch = Math.max(-1.48, player.pitch - dt * 1.2);

  // 视角
  player.recoilPitch *= Math.pow(0.02, dt);
  camera.position.copy(player.pos);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + player.recoilPitch;

  // 走路轻微上下
  if (moving && player.onGround) {
    NR.walkBob = (NR.walkBob || 0) + dt * 9;
    camera.position.y += Math.sin(NR.walkBob) * 0.022;
  }

  return moving ? (speed > 5 ? 1.0 : 0.6) : 0.0;
}

function updateTargets(dt, t) {
  for (const tg of targets) {
    if (!tg.alive) {
      if (performance.now() / 1000 > tg.respawnAt) respawnTarget(tg, false);
      continue;
    }
    const p = tg.group.position;
    let x = tg.base.x, y = tg.base.y, z = tg.base.z;
    y += Math.sin(t * tg.speed + tg.phase) * tg.bobAmp;
    if (tg.orbit) {
      x += Math.cos(t * tg.speed * 0.8 + tg.phase) * tg.orbitR;
      z += Math.sin(t * tg.speed * 0.6 + tg.phase) * tg.orbitR * 0.5;
    }
    p.set(x, y, z);
    tg.ring.rotation.z = t * 0.9 + tg.phase;
    tg.ring2.rotation.z = -t * 1.5 + tg.phase;
    tg.core.rotation.z = t * 0.4;
    // 缩放动画
    tg.scale += (1 - tg.scale) * Math.min(1, dt * 8);
    tg.group.scale.setScalar(tg.scale);
    // 呼吸亮度
    const pulse = 1 + Math.sin(t * 3 + tg.phase) * 0.12;
    tg.group.scale.multiplyScalar(pulse * 0.999 + 0.001);
  }
}

function updateDrones(dt, t) {
  const now = performance.now() / 1000;
  for (const d of drones) {
    if (!d.alive) continue;
    const p = d.group.position;
    p.x = d.base.x + Math.sin(t * 0.55 + d.phase) * 2.4;
    p.y = d.base.y + Math.sin(t * 0.9 + d.phase * 1.7) * 0.75;
    p.z = d.base.z + Math.cos(t * 0.42 + d.phase) * 1.8;
    d.ring.rotation.z = t * 2.2;
    d.group.lookAt(player.pos.x, p.y, player.pos.z);

    // 开火
    if (now > d.fireAt && G.state === 'playing') {
      d.fireAt = now + rand(1.6, 3.4);
      fireBullet(d.eye.getWorldPosition(new T.Vector3()));
      burst(d.eye.getWorldPosition(new T.Vector3()).x, d.eye.getWorldPosition(new T.Vector3()).y, d.eye.getWorldPosition(new T.Vector3()).z, new T.Color(0xff4060), 6, 3, 0.04, 0.25);
    }
  }
}

function updateBullets(dt) {
  for (const b of bullets) {
    if (b.life <= 0) continue;
    b.life -= dt;
    if (b.life <= 0) { b.mesh.visible = false; continue; }
    b.mesh.position.addScaledVector(b.vel, dt);
    const d = b.mesh.position.distanceTo(player.pos);
    if (d < 0.62) {
      b.life = 0;
      b.mesh.visible = false;
      if (G.state === 'playing') {
        player.hp -= 12;
        player.shake = 1;
        player.hurtFlash = 1;
        NR.audio.hurt();
        flashDamage();
        if (player.hp <= 0) { player.hp = 0; endGame(); }
      }
      continue;
    }
    if (b.mesh.position.y < 0.05 || Math.abs(b.mesh.position.x) > 22 || b.mesh.position.z > 30 || b.mesh.position.z < -110) {
      b.life = 0; b.mesh.visible = false;
    }
  }
}

/* ---------------- 主循环 ---------------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  const moveAmount = updatePlayer(dt);

  if (G.state === 'playing') {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; endGame(); }

    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) G.combo = 0;
    }

    if (mouseDown) {
      if (NR.W.ammo > 0) NR.fire();
      else if (!NR.W.reloading) { NR.reload(); mouseDown = false; }
    }
  }

  updateTargets(dt, elapsed);
  updateDrones(dt, elapsed);
  updateBullets(dt);
  NR.updateWeapon(dt, moveAmount, elapsed);
  NR.updateWeather(elapsed, dt);

  // 相机抖动
  if (player.shake > 0.001) {
    player.shake *= Math.pow(0.0009, dt);
    camera.position.x += rand(-1, 1) * player.shake * 0.02;
    camera.position.y += rand(-1, 1) * player.shake * 0.02;
  }

  // 天空时间
  NR.sky.material.uniforms.uTime.value = elapsed;

  // 后处理 uniform
  gradePass.uniforms.uTime.value = elapsed;
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.6);
  NR.core.gradePass.uniforms.uHurt.value = player.hurtFlash * player.hurtFlash;

  // 霓虹招牌闪烁
  for (let i = 0; i < signAnchors.length; i++) {
    const a = signAnchors[i];
    if (a.broken === undefined) a.broken = rnd() < 0.18;
    if (a.broken) {
      const n = Math.sin(elapsed * 13.0 + i * 7.3) * Math.sin(elapsed * 2.1 + i);
      a.mesh.material.opacity = n > 0.2 ? 1 : 0.15;
      a.mesh.material.transparent = true;
    }
  }

  updateHUD();
  composer.render();
}

/* ---------------- 启动 ---------------- */
function boot() {
  // 预编译
  renderer.compile(scene, camera);
  renderer.compile(NR.core.weaponScene, NR.core.weaponCam);

  // 烘焙环境反射（隐藏干扰物）
  const hideList = [NR.rain.mesh, NR.steam.mesh, particles, weapon, muzzleFlash];
  const vis = hideList.map((o) => o.visible);
  hideList.forEach((o) => (o.visible = false));
  try {
    const env = NR.bakeEnvironment();
    NR.core.weaponScene.environment = env;
  } catch (e) { console.warn('env bake failed', e); }
  hideList.forEach((o, i) => (o.visible = vis[i]));

  document.getElementById('loading').classList.add('hide');
  setTimeout(() => showOverlay('menu'), 260);

  animate();
}

boot();

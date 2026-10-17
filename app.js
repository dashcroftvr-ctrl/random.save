import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* =========================================================================
   Gaz & Serg — interactive life-size characters for Quest (WebXR)
   ========================================================================= */

const TEST = new URLSearchParams(location.search).has('test');
const $ = (id) => document.getElementById(id);
const setStatus = (t) => { $('status').textContent = t; };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);
const QI = new THREE.Quaternion();

/* ---------------- character setup ---------------- */
const CAST = [
  {
    id: 'gaz', name: 'Gaz', file: 'models/gaz.glb', home: [-0.7, 0, -2.0], accent: '#ffd400',
    idle: 'Idle_02', idles: ['Idle_02', 'Idle_03', 'Idle_10', 'Idle_11', 'Idle_3'],
    dances: ['Hip_Hop_Dance_3', 'Hip_Hop_Dance_2', 'Hip_Hop_Dance_4', 'Boom_Dance', 'FunnyDancing_02'],
    cheer: 'FunnyDancing_02',
    greet: ["Alright?", "Y'alright, mate?", "Oi oi!", "Hiya!"],
    poke: ["Oi!", "Watch it, mate!", "That tickles!", "Hands off the hi-vis!", "Do that again, I dare ya"],
    pokeHead: ["Mind the hair!", "Not the head!"],
    close: ["Bit close, mate!", "Personal space!", "Whoa, back up!"],
    stare: ["What?", "Got something on my face?", "You alright there?"],
    annoyed: { anim: 'idle_to_push_up', once: true, secs: 3.2, line: "Bet you can't do this!" },
    bored: [
      { anim: 'idle_to_push_up', once: true, secs: 3.2, line: "Bored. Push-ups it is." },
      { anim: 'Boom_Dance', secs: 7, line: "Might as well have a boogie." },
    ],
  },
  {
    id: 'serg', name: 'Serg', file: 'models/serg.glb', home: [0.7, 0, -2.1], accent: '#ff5a1f',
    idle: 'Idle_6', idles: ['Idle_6'],
    dances: ['Cardio_Dance'],
    cheer: 'Motivational_Cheer',
    greet: ["Hey you!", "Ready to train?", "Alright, champ?"],
    poke: ["Hey!", "Easy!", "Ow!", "Not the ribs!", "Steady on!"],
    pokeHead: ["Not the face!", "Hey, the face!"],
    close: ["Whoa — space!", "Easy, tiger!", "Back it up!"],
    stare: ["What you looking at?", "Like the outfit?", "Something up?"],
    annoyed: { anim: 'Block1', once: true, secs: 3.5, line: "Right, that's it!" },
    bored: [
      { doze: true, line: "Zzz…" },
      { anim: 'Jump_Rope', secs: 8.5, line: "Might as well train." },
      { anim: 'air_squat', secs: 5.7, line: "Squats. Don't judge." },
    ],
  },
];

/* ---------------- renderer / scene ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const DESK_BG = new THREE.Color(0x2b3035);
const VR_BG = new THREE.Color(0x16191c);
scene.background = DESK_BG;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6157, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(1.5, 3, 1.2);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 60);
camera.position.set(0, 1.6, 1.4);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, -2);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.55;
controls.update();

// the world group is what we move when "recentering" in XR
const world = new THREE.Group();
scene.add(world);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7, 64),
  new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
world.add(floor);
const grid = new THREE.GridHelper(14, 28, 0x50575e, 0x444a50);
grid.position.y = 0.002;
world.add(grid);

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- audio (synthesised, spatial) ---------------- */
const listener = new THREE.AudioListener();
camera.add(listener);
const actx = listener.context;
let muted = false;
const noiseBuf = (() => {
  const b = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
})();
function spatialOut(pos, vol = 1) {
  const p = actx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1;
  p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
  const g = actx.createGain();
  g.gain.value = vol;
  g.connect(p);
  p.connect(listener.getInput());
  return g;
}
function noise(dur) {
  const s = actx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const t = actx.currentTime;
  s.start(t, Math.random() * 0.5); s.stop(t + dur);
  return s;
}
function env(param, t, peak, attack, release) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + release);
}
function sfx(type, pos) {
  if (muted || actx.state !== 'running') return;
  const t = actx.currentTime;
  const out = spatialOut(pos);
  if (type === 'boing') {
    const o = actx.createOscillator(); o.type = 'sine';
    const f = rand(0.85, 1.25);
    o.frequency.setValueAtTime(180 * f, t);
    o.frequency.exponentialRampToValueAtTime(560 * f, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(260 * f, t + 0.28);
    const g = actx.createGain(); env(g.gain, t, 0.55, 0.01, 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.35);
  } else if (type === 'slap') {
    const n = noise(0.18);
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.7;
    const g = actx.createGain(); env(g.gain, t, 1.4, 0.003, 0.14);
    n.connect(bp).connect(g).connect(out);
    const o = actx.createOscillator(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    const g2 = actx.createGain(); env(g2.gain, t, 0.7, 0.003, 0.1);
    o.connect(g2).connect(out); o.start(t); o.stop(t + 0.15);
  } else if (type === 'whoosh') {
    const n = noise(0.45);
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(1700, t + 0.3);
    const g = actx.createGain(); env(g.gain, t, 0.35, 0.08, 0.3);
    n.connect(bp).connect(g).connect(out);
  } else if (type === 'ding') {
    [880, 1320].forEach((f, i) => {
      const o = actx.createOscillator(); o.frequency.value = f;
      const g = actx.createGain(); env(g.gain, t + i * 0.07, 0.25, 0.005, 0.3);
      o.connect(g).connect(out); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.4);
    });
  } else if (type === 'fart') {
    const dur = 1.3;
    const o = actx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(70, t + dur);
    const lfo = actx.createOscillator(); lfo.frequency.setValueAtTime(19, t); lfo.frequency.linearRampToValueAtTime(11, t + dur);
    const lfoG = actx.createGain(); lfoG.gain.value = 28;
    lfo.connect(lfoG).connect(o.frequency);
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 6;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.04);
    g.gain.setValueAtTime(0.9, t + 0.3); g.gain.exponentialRampToValueAtTime(0.25, t + 0.42);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(out);
    const n = noise(dur); const nlp = actx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 380;
    const ng = actx.createGain(); env(ng.gain, t, 0.35, 0.05, dur - 0.1);
    n.connect(nlp).connect(ng).connect(out);
    o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  }
}

/* ---------------- sprites: bubbles, particles ---------------- */
function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const shadowTex = radialTex('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
const puffTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

class Bubble {
  constructor(accent) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640; this.canvas.height = 200;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, opacity: 0 });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.renderOrder = 999;
    this.sprite.scale.set(0.56, 0.175, 1);
    this.sprite.center.set(0.5, 0);
    this.accent = accent;
    this.until = 0;
    scene.add(this.sprite);
  }
  set(text) {
    const c = this.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    let size = 58;
    g.font = `700 ${size}px "Segoe UI", Roboto, sans-serif`;
    while (g.measureText(text).width > 560 && size > 30) { size -= 2; g.font = `700 ${size}px "Segoe UI", Roboto, sans-serif`; }
    const w = Math.min(600, g.measureText(text).width + 70), h = 120, x = (c.width - w) / 2, y = 20;
    g.fillStyle = '#ffffff'; g.strokeStyle = this.accent; g.lineWidth = 8;
    g.beginPath(); g.roundRect(x, y, w, h, 36); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(c.width / 2 - 22, y + h - 2); g.lineTo(c.width / 2, y + h + 46); g.lineTo(c.width / 2 + 22, y + h - 2); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(c.width / 2 - 22, y + h + 2); g.lineTo(c.width / 2, y + h + 46); g.lineTo(c.width / 2 + 22, y + h + 2); g.stroke();
    g.fillStyle = '#141618'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, y + h / 2 + 2);
    this.tex.needsUpdate = true;
  }
  update(dt, t, anchor) {
    const on = t < this.until;
    this.mat.opacity += ((on ? 1 : 0) - this.mat.opacity) * damp(on ? 14 : 6, dt);
    this.sprite.visible = this.mat.opacity > 0.02;
    this.sprite.position.copy(anchor);
  }
}

const particles = [];
function burst(pos, color, n = 16, speed = 1.6, life = 0.7, size = 0.05) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.position.copy(pos); s.scale.setScalar(size);
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
    scene.add(s);
    particles.push({ s, v, life, age: 0, grow: 0, gravity: -3.5, fade: 1, size });
  }
}
const clouds = [];
function stinkCloud(pos) {
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({ map: puffTex, color: new THREE.Color().setHSL(rand(0.2, 0.28), 0.75, rand(0.35, 0.5)), transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.position.copy(pos).add(new THREE.Vector3(rand(-0.06, 0.06), rand(-0.05, 0.05), rand(-0.06, 0.06)));
    s.scale.setScalar(0.12);
    scene.add(s);
    particles.push({ s, v: new THREE.Vector3(rand(-0.25, 0.25), rand(0.05, 0.22), rand(-0.25, 0.25)), life: rand(4.5, 6.5), age: -i * 0.04, grow: 0.28, gravity: 0, fade: 0.55, size: 0.12, cloud: true });
  }
  clouds.push({ pos: pos.clone(), until: simT + 6, teased: false });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age < 0) continue;
    const k = p.age / p.life;
    if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); particles.splice(i, 1); continue; }
    p.v.y += p.gravity * dt;
    if (p.cloud) p.v.multiplyScalar(1 - dt * 0.4);
    p.s.position.addScaledVector(p.v, dt);
    p.s.scale.setScalar(p.size + p.grow * p.age);
    p.s.material.opacity = p.cloud ? p.fade * Math.min(1, p.age * 4) * (1 - k) : (1 - k);
  }
}

/* ---------------- maths helpers for bones ---------------- */
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

// Apply an extra world-space rotation to a bone, keeping its children attached.
function rotateWorld(bone, qWorld) {
  bone.getWorldQuaternion(_q1);
  _q1.premultiply(qWorld);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}
// Rotate bone so the direction to `childPos` swings towards `targetPos`, blended by `w`.
function swingTowards(bone, childPos, targetPos, w) {
  bone.getWorldPosition(_v1);
  const a = _v2.subVectors(childPos, _v1).normalize();
  const b = _v3.subVectors(targetPos, _v1).normalize();
  _q3.setFromUnitVectors(a, b);
  if (w < 1) _q3.copy(new THREE.Quaternion().slerp(_q3, w)); // blend from identity
  rotateWorld(bone, _q3);
}

/* ---------------- Character ---------------- */
const clock = new THREE.Clock();
let simT = 0; // simulation time (sum of clamped frame steps)
let chars = [];

class Character {
  constructor(cfg, gltf) {
    this.cfg = cfg;
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.root.add(this.model);
    world.add(this.root);

    const B = (n) => this.model.getObjectByName('mixamorig' + n);
    this.hips = B('Hips'); this.spine = B('Spine'); this.spine1 = B('Spine1'); this.spine2 = B('Spine2');
    this.neck = B('Neck'); this.head = B('Head'); this.headTop = B('HeadTop_End');
    this.arms = {
      L: { arm: B('LeftArm'), fore: B('LeftForeArm'), hand: B('LeftHand'), tip: B('LeftHandMiddle4') },
      R: { arm: B('RightArm'), fore: B('RightForeArm'), hand: B('RightHand'), tip: B('RightHandMiddle4') },
    };

    // capture rest-pose info (model faces +Z in its rest pose)
    this.model.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1);
    this.headFwd = fwd.clone().applyQuaternion(this.head.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.neckFwd = fwd.clone().applyQuaternion(this.neck.getWorldQuaternion(new THREE.Quaternion()).invert());
    for (const k of ['L', 'R']) {
      const a = this.arms[k];
      const pa = a.arm.getWorldPosition(new THREE.Vector3()), pf = a.fore.getWorldPosition(new THREE.Vector3()), ph = a.hand.getWorldPosition(new THREE.Vector3());
      a.la = pa.distanceTo(pf); a.lb = pf.distanceTo(ph); a.side = Math.sign(pa.x) || 1;
    }
    const box = new THREE.Box3().setFromObject(this.model);
    this.height = box.max.y - box.min.y;
    this.model.position.y = -box.min.y;

    // animations
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    const hipsScale = this.hips.parent.getWorldScale(new THREE.Vector3()).z;
    for (const clip of gltf.animations) {
      const tr = clip.tracks.find((t) => /Hips\.position$/.test(t.name));
      if (tr) {
        const v = tr.values, n = v.length / 3, tt = tr.times;
        const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
        const travel = /Walk|Running/.test(clip.name);
        if (clip.name === 'Walking') this.walkSpeed = clamp((Math.hypot(dx, dz) * hipsScale) / clip.duration, 0.6, 1.6);
        for (let i = 0; i < n; i++) {
          if (travel) { v[i * 3] = v[0]; v[i * 3 + 2] = v[2]; }
          else { const f = (tt[i] - tt[0]) / (tt[n - 1] - tt[0] || 1); v[i * 3] -= dx * f; v[i * 3 + 2] -= dz * f; }
        }
      }
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.walkSpeed = this.walkSpeed || 1.0;

    // placement
    this.home = new THREE.Vector3(...cfg.home);
    this.homeYaw = Math.atan2(-this.home.x, -this.home.z);
    this.root.position.copy(this.home);
    this.yaw = this.homeYaw; this.root.rotation.y = this.yaw;

    // shadow blob
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.renderOrder = 1;
    world.add(this.shadow);

    this.bubble = new Bubble(cfg.accent);

    // state
    this.mode = 'idle'; this.busyUntil = 0; this.cur = null;
    this.lookPoint = new THREE.Vector3(0, 1.6, 0); this.lookW = 0;
    this.fl = 0; this.flv = 0; this.flAxis = new THREE.Vector3(1, 0, 0);
    this.ik = { side: 'R', w: 0, target: new THREE.Vector3() };
    this.hf = null;
    this.pokes = []; this.pokeCD = 0; this.inside = new Set();
    this.greeted = false; this.greetCD = 0; this.stepCD = 0; this.boredCD = 25; this.stareStart = 0; this.stareCD = 0;
    this.lastNoticed = 0; this.nextIdle = 6; this.attnUntil = 0; this.glanceUntil = 0; this.nextGlance = rand(6, 12);
    this.watchTarget = null; this.watchUntil = 0;
    this.step = null; this.dozeLine = 0;
    this.play(cfg.idle, { fade: 0 });
  }

  /* --- animation helpers --- */
  play(name, { fade = 0.3, once = false } = {}) {
    const a = this.actions[name];
    if (!a) return 0;
    if (this.cur === a && !once) return a.getClip().duration;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.setEffectiveWeight(1); a.setEffectiveTimeScale(1);
    a.play();
    if (this.cur && this.cur !== a && fade > 0) this.cur.crossFadeTo(a, fade, false);
    else if (this.cur && this.cur !== a) this.cur.stop();
    this.cur = a; this.curName = name;
    return a.getClip().duration;
  }
  say(text, dur = 2.8) { this.bubble.set(text); this.bubble.until = simT + dur; }
  doAnim(name, secs, { once = false, line = null, mode = 'react' } = {}) {
    this.play(name, { once });
    this.mode = mode; this.busyUntil = simT + secs;
    if (line) this.say(line);
  }
  toIdle() {
    this.mode = 'idle'; this.watchTarget = null; this.hf = null;
    this.play(this.cfg.idle);
    this.nextIdle = simT + rand(6, 11);
  }
  watch(other, secs) {
    this.toIdle(); this.mode = 'react'; this.busyUntil = simT + secs;
    this.watchTarget = other; this.watchUntil = simT + secs;
  }
  impulse(dirWorld, strength = 1) {
    const d = _v1.set(dirWorld.x, 0, dirWorld.z);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    this.flAxis.crossVectors(UP, d).normalize();
    this.flv += 9 * strength;
  }
  headWorld(out) { return this.head.getWorldPosition(out); }

  /* --- behaviours --- */
  stepBack(userL, line = true) {
    const t = simT;
    const away = new THREE.Vector3(this.root.position.x - userL.x, 0, this.root.position.z - userL.z);
    if (away.lengthSq() < 1e-4) away.set(0, 0, -1);
    away.normalize();
    const to = this.root.position.clone().addScaledVector(away, 0.5);
    if (to.distanceTo(this.home) > 2.8) to.copy(this.root.position); // don't wander off
    this.step = { from: this.root.position.clone(), to, t0: t, dur: 0.55 };
    this.mode = 'step'; this.stepCD = t + 4;
    this.impulse(away.clone().applyQuaternion(world.quaternion), 0.9);
    if (line) this.say(pick(this.cfg.close), 2.2);
    sfx('whoosh', this.headWorld(new THREE.Vector3()));
  }
  bored() {
    const b = pick(this.cfg.bored);
    this.boredCD = simT + rand(28, 40);
    if (b.doze) {
      this.play('Dozing_Elderly'); this.mode = 'doze'; this.say(b.line, 3); this.dozeLine = simT + 5;
    } else this.doAnim(b.anim, b.secs, { once: !!b.once, line: b.line });
  }
  wake() {
    this.say("Wha—! I'm awake!", 2.4);
    this.impulse(new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.getWorldQuaternion(_q1)), 0.8);
    this.toIdle();
    this.lastNoticed = simT;
  }
  poked(pointW, dirW, region) {
    const t = simT;
    if (t < this.pokeCD) return;
    this.pokeCD = t + 0.45;
    this.attnUntil = t + 6; this.lastNoticed = t;
    this.impulse(dirW, region === 'head' ? 0.8 : 1.1);
    sfx('boing', pointW);
    burst(pointW, 0xffffff, 6, 0.8, 0.35, 0.03);
    if (director.voting) { director.vote(this); return; }
    if (this.mode === 'doze') { this.wake(); return; }
    this.pokes = this.pokes.filter((p) => t - p < 10); this.pokes.push(t);
    if (this.pokes.length >= 4 && !director.active && this.mode !== 'highfive') {
      this.pokes = [];
      const a = this.cfg.annoyed;
      this.doAnim(a.anim, a.secs, { once: a.once, line: a.line });
      return;
    }
    this.say(region === 'head' ? pick(this.cfg.pokeHead) : pick(this.cfg.poke), 2.2);
  }
  startHighFive(handW) {
    const t = simT;
    this.hf = { t0: t, lastSeen: t, hanging: false };
    this.mode = 'highfive'; this.busyUntil = t + 6;
    this.attnUntil = t + 6;
    // choose the arm on the side the hand is on
    this.model.updateMatrixWorld(true);
    const dl = this.arms.L.arm.getWorldPosition(_v1).distanceTo(handW);
    const dr = this.arms.R.arm.getWorldPosition(_v2).distanceTo(handW);
    this.ik.side = dl < dr ? 'L' : 'R';
    this.ik.target.copy(handW);
    this.say(pick(['Up top!', 'Go on then!', 'High five!']), 2.2);
  }
  highFiveHit(pointW) {
    sfx('slap', pointW);
    burst(pointW, 0xffe066, 22, 2.2, 0.7, 0.045);
    burst(pointW, 0xffffff, 10, 1.2, 0.5, 0.03);
    this.hf = null;
    this.say(pick(['YES!', 'Get in!', 'Boom!', 'Nice one!']), 2.4);
    const secs = this.cfg.id === 'serg' ? 3.5 : 3.0;
    this.doAnim(this.cfg.cheer, secs);
  }

  /* --- per-frame --- */
  update(dt, t, ctx) {
    const r = this.root.position;
    const dx = ctx.headL.x - r.x, dz = ctx.headL.z - r.z;
    const d = Math.hypot(dx, dz);
    this.dUser = d;

    // is the user looking at me?
    const hw = this.headWorld(_v1);
    const toMe = _v2.subVectors(hw, ctx.headW).normalize();
    const looking = toMe.dot(ctx.gazeW) > Math.cos(THREE.MathUtils.degToRad(22));
    if ((looking && d < 5) || d < 2.2) this.lastNoticed = t;
    if (looking && d < 3.5) { if (!this.stareStart) this.stareStart = t; } else this.stareStart = 0;

    const free = !director.active;
    switch (this.mode) {
      case 'idle':
        if (d < 0.62 && t > this.stepCD) { this.stepBack(ctx.headL); break; }
        if (free && d < 2.6 && !this.greeted && t > this.greetCD) {
          this.greeted = true; this.greetCD = t + 15; this.say(pick(this.cfg.greet));
        }
        if (d > 3.4) this.greeted = false;
        if (free && this.stareStart && t - this.stareStart > 3.2 && t > this.stareCD) {
          this.stareCD = t + 25; this.say(pick(this.cfg.stare));
        }
        if (free && r.distanceTo(this.home) > 0.4 && d > 1.6) { this.mode = 'walk'; this.play('Walking', { fade: 0.25 }); break; }
        if (free && t - this.lastNoticed > 22 && t > this.boredCD) { this.bored(); break; }
        if (t > this.nextIdle) { this.play(pick(this.cfg.idles), { fade: 0.5 }); this.nextIdle = t + rand(7, 12); }
        break;
      case 'walk': {
        const to = _v3.subVectors(this.home, r); to.y = 0;
        const dist = to.length();
        if (dist < 0.06 || d < 1.1 || !free) { this.toIdle(); break; }
        r.addScaledVector(to.normalize(), Math.min(dist, this.walkSpeed * dt));
        break;
      }
      case 'step': {
        const s = this.step, k = clamp((t - s.t0) / s.dur, 0, 1);
        r.lerpVectors(s.from, s.to, 1 - Math.pow(1 - k, 3));
        if (k >= 1) this.toIdle();
        break;
      }
      case 'doze':
        if (d < 1.6) this.wake();
        else if (t > this.dozeLine) { this.say('Zzz…', 2.5); this.dozeLine = t + 5; }
        break;
      case 'highfive':
        if (t > this.busyUntil || (this.hf && t - this.hf.lastSeen > 2.2)) {
          this.say("Leaving me hanging?!", 2.6); this.toIdle();
        }
        break;
      default: // react / dance
        if (t > this.busyUntil) this.toIdle();
    }
    if (this.watchTarget && t > this.watchUntil) this.watchTarget = null;

    // facing
    let want = this.yaw;
    if (this.mode === 'walk') want = Math.atan2(this.home.x - r.x, this.home.z - r.z);
    else if (this.mode === 'doze' || this.mode === 'step') want = this.yaw;
    else if (this.watchTarget) { const o = this.watchTarget.root.position; want = Math.atan2(o.x - r.x, o.z - r.z); }
    else if (d < 4.5) want = Math.atan2(dx, dz);
    else want = this.homeYaw;
    const diff = wrapAngle(want - this.yaw);
    const rate = this.mode === 'walk' ? 6 : 3.2;
    this.yaw += clamp(diff, -rate * dt, rate * dt) * (Math.abs(diff) > 0.03 ? 1 : 0);
    this.root.rotation.y = this.yaw;

    // animate
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);

    // --- procedural layer ---
    // 1) flinch spring on the spine
    const acc = -150 * this.fl - 11 * this.flv;
    this.flv += acc * dt; this.fl += this.flv * dt;
    if (Math.abs(this.fl) > 0.002) {
      const axW = this.flAxis, qf = new THREE.Quaternion();
      rotateWorld(this.spine1, qf.setFromAxisAngle(axW, this.fl * 0.16));
      rotateWorld(this.spine2, qf.setFromAxisAngle(axW, this.fl * 0.12));
    }

    // 2) look-at (neck + head)
    let tgt = null, w = 0;
    if (this.mode === 'highfive' && ctx.raisedHand) { tgt = ctx.raisedHand; w = 1; }
    else if (this.mode === 'doze') { w = 0; }
    else if (this.watchTarget) { tgt = this.watchTarget.headWorld(_v3); w = 0.95; }
    else if (this.mode === 'walk') { w = 0; }
    else if (t < this.glanceUntil && ctx.other) { tgt = ctx.other.headWorld(_v3); w = 0.8; }
    else if (d < 5) { tgt = ctx.headW; w = this.mode === 'react' ? 0.55 : 1; }
    if (this.mode === 'idle' && t > this.nextGlance) { this.glanceUntil = t + 1.3; this.nextGlance = t + rand(8, 15); }
    if (tgt) this.lookPoint.lerp(tgt, damp(7, dt));
    this.lookW += (w - this.lookW) * damp(5, dt);
    if (this.lookW > 0.01) {
      this.aim(this.neck, this.neckFwd, 0.4 * this.lookW);
      this.aim(this.head, this.headFwd, 0.85 * this.lookW);
    }

    // 3) arm IK for high-fives
    const ikOn = this.mode === 'highfive' && this.hf;
    this.ik.w += ((ikOn ? 1 : 0) - this.ik.w) * damp(ikOn ? 6 : 4, dt);
    if (ikOn && ctx.raisedHand) {
      // meet the hand ~20cm short of it, so the user has to actually slap
      const sh = this.arms[this.ik.side].arm.getWorldPosition(new THREE.Vector3());
      const meet = ctx.raisedHand.clone().add(sh.sub(ctx.raisedHand).setLength(0.2));
      this.ik.target.lerp(meet, damp(10, dt));
    }
    if (this.ik.w > 0.01) this.solveArm(this.arms[this.ik.side], this.ik.target, this.ik.w);

    // shadow + bubble
    this.hips.getWorldPosition(_v1);
    const hl = world.worldToLocal(_v1.clone());
    this.shadow.position.set(hl.x, 0.004, hl.z);
    const lift = clamp(hl.y - this.height * 0.53, 0, 1);
    this.shadow.material.opacity = clamp(0.9 - lift * 1.5, 0.15, 0.9);
    this.shadow.scale.setScalar(1 + lift * 0.6);
    this.bubble.update(dt, t, this.headTop.getWorldPosition(_v2).add(_v3.set(0, 0.16, 0)));
  }

  aim(bone, fwdLocal, amount) {
    const pos = bone.getWorldPosition(new THREE.Vector3());
    const cur = fwdLocal.clone().applyQuaternion(bone.getWorldQuaternion(_q1)).normalize();
    // clamp the look direction to a comfortable cone relative to the body
    const rootQ = this.root.getWorldQuaternion(_q2);
    const want = this.lookPoint.clone().sub(pos).normalize().applyQuaternion(rootQ.clone().invert());
    const yaw = clamp(Math.atan2(want.x, want.z), -1.25, 1.25);
    const pitch = clamp(Math.asin(clamp(want.y, -1, 1)), -0.6, 0.55);
    want.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(rootQ);
    const q = new THREE.Quaternion().setFromUnitVectors(cur, want);
    q.copy(new THREE.Quaternion().slerp(q, amount)); // blend from identity
    rotateWorld(bone, q);
  }

  solveArm(a, targetW, w) {
    const A = a.arm.getWorldPosition(new THREE.Vector3());
    const reach = (a.la + a.lb) * 0.96;
    const T = targetW.clone().sub(A);
    const dist = clamp(T.length(), Math.abs(a.la - a.lb) + 0.02, reach);
    T.setLength(dist).add(A);
    const dir = T.clone().sub(A).normalize();
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const pole = new THREE.Vector3(a.side * 0.6, -1, -0.35).applyQuaternion(rootQ);
    const bend = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const x = (a.la * a.la - a.lb * a.lb + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a.la * a.la - x * x));
    const elbow = A.clone().addScaledVector(dir, x).addScaledVector(bend, h);
    swingTowards(a.arm, a.fore.getWorldPosition(new THREE.Vector3()), elbow, w);
    swingTowards(a.fore, a.hand.getWorldPosition(new THREE.Vector3()), T, w);
    // fingers up and slightly forward: an open palm to slap
    const fingerTarget = a.hand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0.35).applyQuaternion(rootQ).normalize());
    swingTowards(a.hand, a.tip.getWorldPosition(new THREE.Vector3()), fingerTarget, w * 0.9);
  }

  // body capsules for poke detection: [a, b, radius, region]
  capsules() {
    const p = (o) => o.getWorldPosition(new THREE.Vector3());
    const hips = p(this.hips).add(new THREE.Vector3(0, 0.05, 0));
    return [
      [hips, p(this.spine2), 0.17, 'body'],
      [p(this.spine2), p(this.neck), 0.16, 'body'],
      [p(this.head), p(this.headTop), 0.12, 'head'],
    ];
  }
  handWorld(side) { return this.arms[side].hand.getWorldPosition(new THREE.Vector3()); }
}

/* ---------------- dance-off / gag director ---------------- */
const director = {
  active: false, voting: false, events: [], t0: 0,
  run(events) { this.active = true; this.t0 = simT; this.events = events.map((e) => ({ ...e, done: false })); },
  update(t) {
    if (!this.active) return;
    for (const e of this.events) if (!e.done && t - this.t0 >= e.at) { e.done = true; e.fn(); }
    if (this.events.every((e) => e.done)) this.active = false;
  },
  vote(c) {
    if (!this.voting) return;
    this.voting = false;
    const other = chars.find((x) => x !== c);
    c.say(pick(['Champion!', 'Get in!!', 'Knew it!']), 3);
    c.doAnim(c.cfg.cheer, 4);
    other.say(pick(['Fix!', 'Rematch!', 'Robbed!']), 3);
    burst(c.headTop.getWorldPosition(new THREE.Vector3()), 0xffd400, 30, 2, 1, 0.05);
    sfx('ding', c.headWorld(new THREE.Vector3()));
    this.events.forEach((e) => (e.done = true));
    this.active = false;
  },
};
function danceOff() {
  if (director.active || chars.length < 2) return;
  const [gaz, serg] = chars;
  chars.forEach((c) => { c.hf = null; c.toIdle(); });
  director.run([
    { at: 0, fn: () => { gaz.say('Dance-off! Me first.'); gaz.doAnim(pick(gaz.cfg.dances.slice(0, 3)), 8, { mode: 'dance' }); serg.watch(gaz, 8); } },
    { at: 8.4, fn: () => { serg.say('Pfft. Watch this.'); serg.doAnim('Cardio_Dance', 8, { mode: 'dance' }); gaz.watch(serg, 8); } },
    { at: 16.8, fn: () => { gaz.say('Together then!'); gaz.doAnim('Boom_Dance', 7, { mode: 'dance' }); serg.doAnim('Backflip', 2.3, { once: true, mode: 'dance' }); } },
    { at: 17.6, fn: () => gaz.watch(serg, 1.6) },
    { at: 18.0, fn: () => gaz.say('Show off!') },
    { at: 19.2, fn: () => { serg.doAnim('Cardio_Dance', 5, { mode: 'dance' }); gaz.doAnim('Hip_Hop_Dance_4', 5, { mode: 'dance' }); } },
    { at: 24.5, fn: () => { chars.forEach((c) => c.toIdle()); gaz.say('So… who won?', 3.5); } },
    { at: 26.5, fn: () => { serg.say('Poke the winner!', 6); director.voting = true; } },
    { at: 36, fn: () => { if (director.voting) { director.voting = false; gaz.say("Call it a draw.", 3); serg.say('…This time.', 3); } } },
  ]);
}
function fartGag() {
  if (director.active || chars.length < 2) return;
  const [gaz, serg] = chars;
  chars.forEach((c) => { c.hf = null; c.toIdle(); });
  director.run([
    { at: 0, fn: () => gaz.say('Hang on…', 1.4) },
    { at: 1.1, fn: () => {
      const q = gaz.root.getWorldQuaternion(new THREE.Quaternion());
      const p = gaz.hips.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.05, -0.2).applyQuaternion(q));
      sfx('fart', p); stinkCloud(p);
      gaz.impulse(new THREE.Vector3(0, 0, 1).applyQuaternion(q), 0.7);
    } },
    { at: 1.9, fn: () => { gaz.say('Better out than in!', 3); gaz.doAnim(gaz.cfg.cheer, 3.2); serg.watch(gaz, 4); } },
    { at: 2.6, fn: () => { serg.say("GAZ! That's rank!", 3); } },
    { at: 3.1, fn: () => {
      const g = gaz.root.position;
      serg.stepBack(new THREE.Vector3(g.x, 0, g.z), false);
      serg.watchTarget = gaz; serg.watchUntil = simT + 3;
    } },
  ]);
}

/* ---------------- floating XR panel ---------------- */
const panel = new THREE.Group();
panel.visible = false;
scene.add(panel);
const buttons = [];
function makeButton(label, cmd, x, y) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), mat);
  mesh.position.set(x, y, 0.004);
  const btn = { mesh, cmd, label, canvas: c, tex, hot: 0, latch: false, cd: 0 };
  mesh.userData.btn = btn;
  drawButton(btn);
  panel.add(mesh); buttons.push(btn);
}
function drawButton(b) {
  const g = b.canvas.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = b.hot > 0.5 ? '#ffd400' : '#2a2e33';
  g.beginPath(); g.roundRect(4, 4, 248, 120, 26); g.fill();
  g.strokeStyle = '#ffd400'; g.lineWidth = 5; g.stroke();
  g.fillStyle = b.hot > 0.5 ? '#141618' : '#f3f0e8';
  g.font = '700 38px "Segoe UI", Roboto, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = b.cmd === 'mute' ? (muted ? 'Sound: off' : 'Sound: on') : b.label;
  g.fillText(label, 128, 66);
  b.tex.needsUpdate = true;
}
{
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.255, 0.15), new THREE.MeshBasicMaterial({ color: 0x141618, transparent: true, opacity: 0.75 }));
  panel.add(plate);
  makeButton('Dance-off', 'danceoff', -0.06, 0.032);
  makeButton("Gaz's gag", 'fart', 0.06, 0.032);
  makeButton('Bring here', 'comehere', -0.06, -0.032);
  makeButton('Sound', 'mute', 0.06, -0.032);
}
function pressButton(b) {
  const t = simT;
  if (t < b.cd) return;
  b.cd = t + 0.8; b.hot = 1; drawButton(b);
  setTimeout(() => { b.hot = 0; drawButton(b); }, 250);
  sfx('ding', b.mesh.getWorldPosition(new THREE.Vector3()));
  command(b.cmd);
}

/* ---------------- commands ---------------- */
let needRecenter = false;
function command(cmd) {
  if (cmd === 'danceoff') danceOff();
  else if (cmd === 'fart') fartGag();
  else if (cmd === 'comehere') {
    if (renderer.xr.isPresenting) needRecenter = true;
    else chars.forEach((c) => { c.root.position.copy(c.home); c.toIdle(); });
  } else if (cmd === 'mute') { muted = !muted; buttons.forEach(drawButton); setStatus(muted ? 'Sound off' : 'Sound on'); }
}
document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => { actx.resume(); command(b.dataset.cmd); }));

function recenter(headW, gazeW) {
  const yaw = Math.atan2(-gazeW.x, -gazeW.z);
  world.position.set(headW.x, 0, headW.z);
  world.rotation.y = yaw;
  world.updateMatrixWorld(true);
  chars.forEach((c) => {
    c.root.position.copy(c.home); c.yaw = c.homeYaw; c.root.rotation.y = c.yaw;
    if (c.mode === 'walk' || c.mode === 'step') c.toIdle();
  });
  // panel: low and to the left, angled towards you
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const left = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  panel.position.copy(headW).addScaledVector(fwd, 0.38).addScaledVector(left, 0.26);
  panel.position.y = Math.max(0.7, headW.y - 0.55);
  panel.lookAt(headW);
}

/* ---------------- input: XR hands & controllers ---------------- */
const inputs = [0, 1].map((i) => {
  const ctrl = renderer.xr.getController(i);
  const hand = renderer.xr.getHand(i);
  scene.add(ctrl); scene.add(hand);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.55 }));
  line.scale.z = 2.5; line.visible = false; ctrl.add(line);
  const tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
  tipDot.visible = false; scene.add(tipDot);
  const inp = { i, ctrl, hand, line, tipDot, src: null, isHand: false, raisedFor: 0, inside: new Map() };
  ctrl.addEventListener('connected', (e) => { inp.src = e.data; inp.isHand = !!e.data.hand; line.visible = !inp.isHand; });
  ctrl.addEventListener('disconnected', () => { inp.src = null; line.visible = false; tipDot.visible = false; });
  ctrl.addEventListener('selectstart', () => rayAction(new THREE.Raycaster().setFromXRController(ctrl)));
  return inp;
});

const raycaster = new THREE.Raycaster();
function rayAction(rc) {
  if (panel.visible) {
    const hit = rc.intersectObjects(buttons.map((b) => b.mesh), false)[0];
    if (hit) { pressButton(hit.object.userData.btn); return; }
  }
  let best = null;
  const pr = new THREE.Vector3(), ps = new THREE.Vector3();
  for (const c of chars) for (const [a, b, rad, region] of c.capsules()) {
    const d2 = rc.ray.distanceSqToSegment(a, b, pr, ps);
    if (d2 < rad * rad) { const dist = pr.distanceTo(rc.ray.origin); if (!best || dist < best.dist) best = { c, dist, point: pr.clone(), region }; }
  }
  if (best) best.c.poked(best.point, rc.ray.direction.clone(), best.region);
}

// desktop pointer: click to poke
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; actx.resume(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  rayAction(raycaster);
});
// desktop keys: W/S walk, H = hold a hand up
const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'w' || e.key === 's') {
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize().multiplyScalar(e.key === 'w' ? 0.15 : -0.15);
    camera.position.add(f); controls.target.add(f);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const deskHand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd9b8 }));
deskHand.visible = false; scene.add(deskHand);
let testHand = null; // set from test harness

/* ---------------- main loop ---------------- */
const headW = new THREE.Vector3(), gazeW = new THREE.Vector3();
let ready = false;
const stage = { raisers: [], pokers: [] };

function gatherInputs() {
  stage.raisers.length = 0; stage.pokers.length = 0;
  if (renderer.xr.isPresenting) {
    for (const inp of inputs) {
      if (!inp.src) { inp.tipDot.visible = false; continue; }
      if (inp.isHand) {
        const j = inp.hand.joints || {};
        const tip = j['index-finger-tip'], palm = j['middle-finger-metacarpal'];
        if (tip && tip.visible) {
          const p = tip.getWorldPosition(new THREE.Vector3());
          stage.pokers.push({ id: 'h' + inp.i, pos: p, inp });
          inp.tipDot.position.copy(p); inp.tipDot.visible = true;
        } else inp.tipDot.visible = false;
        if (palm && palm.visible) stage.raisers.push({ id: 'h' + inp.i, pos: palm.getWorldPosition(new THREE.Vector3()), inp });
      } else if (inp.ctrl.visible) {
        const p = inp.ctrl.getWorldPosition(new THREE.Vector3());
        stage.pokers.push({ id: 'c' + inp.i, pos: p, inp });
        stage.raisers.push({ id: 'c' + inp.i, pos: p, inp });
        inp.tipDot.visible = false;
      }
    }
  } else {
    let hp = testHand;
    if (!hp && keys.has('h')) {
      const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
      const right = new THREE.Vector3().crossVectors(f, UP);
      hp = camera.position.clone().addScaledVector(f, 0.45).addScaledVector(right, 0.15); hp.y += 0.1;
    }
    deskHand.visible = !!hp;
    if (hp) {
      deskHand.position.copy(hp);
      stage.raisers.push({ id: 'desk', pos: hp.clone(), inp: deskInput });
      stage.pokers.push({ id: 'desk', pos: hp.clone(), inp: deskInput });
    }
  }
}
const deskInput = { raisedFor: 0, inside: new Map() };

function interact(dt, t) {
  // pokes: fingertip/controller entering a body capsule
  for (const pk of stage.pokers) {
    for (const c of chars) {
      if (c.mode === 'highfive') continue;
      let hit = null;
      for (const [a, b, rad, region] of c.capsules()) {
        const closest = new THREE.Line3(a, b).closestPointToPoint(pk.pos, true, new THREE.Vector3());
        if (closest.distanceTo(pk.pos) < rad) { hit = { region, closest }; break; }
      }
      const key = c.cfg.id, was = pk.inp.inside.get(key);
      if (hit && !was) {
        const dir = new THREE.Vector3().subVectors(hit.closest, pk.pos);
        if (dir.lengthSq() < 1e-6) dir.subVectors(c.root.getWorldPosition(new THREE.Vector3()), headW);
        c.poked(pk.pos.clone(), dir, hit.region);
      }
      pk.inp.inside.set(key, !!hit);
    }
  }

  // high-fives: a hand held up near head height, close to a character
  let raisedHand = null;
  for (const r of stage.raisers) {
    const up = r.pos.y > headW.y - 0.22 && Math.hypot(r.pos.x - headW.x, r.pos.z - headW.z) < 0.75;
    r.inp.raisedFor = up ? r.inp.raisedFor + dt : 0;
    if (!up) continue;
    raisedHand = raisedHand || r.pos;
    const active = chars.find((c) => c.mode === 'highfive');
    if (active) {
      active.hf.lastSeen = t;
      // contact?
      const hand = active.handWorld(active.ik.side);
      if (active.ik.w > 0.85 && t - active.hf.t0 > 0.6 && hand.distanceTo(r.pos) < 0.12) active.highFiveHit(hand.lerp(r.pos, 0.5));
      continue;
    }
    if (r.inp.raisedFor > 0.35 && !director.active) {
      let best = null;
      for (const c of chars) {
        if (c.mode !== 'idle' && c.mode !== 'walk') continue;
        const cp = c.root.getWorldPosition(new THREE.Vector3());
        const d = Math.hypot(cp.x - r.pos.x, cp.z - r.pos.z);
        if (d < 1.35 && (!best || d < best.d)) best = { c, d };
      }
      if (best) best.c.startHighFive(r.pos);
    }
  }
  // keep tracking the raised hand even if it dipped a little during the slap
  if (!raisedHand) {
    const active = chars.find((c) => c.mode === 'highfive');
    if (active) for (const r of stage.raisers) {
      const hand = active.handWorld(active.ik.side);
      if (active.ik.w > 0.85 && t - active.hf.t0 > 0.6 && hand.distanceTo(r.pos) < 0.12) { active.highFiveHit(hand.lerp(r.pos, 0.5)); break; }
    }
  }
  return raisedHand;
}

function pressPanel() {
  if (!panel.visible) return;
  for (const pk of stage.pokers) {
    if (!pk.inp.isHand) continue;
    for (const b of buttons) {
      const lp = b.mesh.worldToLocal(pk.pos.clone());
      const inside = Math.abs(lp.x) < 0.055 && Math.abs(lp.y) < 0.0275 && lp.z < 0.012 && lp.z > -0.04;
      if (inside && !b.latch) { b.latch = true; pressButton(b); }
      if (!inside && (lp.z > 0.02 || Math.abs(lp.x) > 0.06 || Math.abs(lp.y) > 0.035)) b.latch = false;
    }
  }
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  simT += dt;
  const t = simT;
  const presenting = renderer.xr.isPresenting;
  if (!presenting) controls.update();
  const cam = presenting ? renderer.xr.getCamera() : camera;
  cam.getWorldPosition(headW); cam.getWorldDirection(gazeW);

  if (ready) {
    if (presenting && needRecenter && headW.y > 0.4) { needRecenter = false; recenter(headW, gazeW); }
    world.updateMatrixWorld(true);
    const headL = world.worldToLocal(headW.clone());
    gatherInputs();
    const raisedHand = interact(dt, t);
    pressPanel();
    director.update(t);
    chars.forEach((c, i) => c.update(dt, t, { headW, headL, gazeW, raisedHand, other: chars[1 - i] }));
    for (const cl of clouds) {
      if (!cl.teased && t < cl.until && headW.distanceTo(cl.pos) < 0.7) {
        cl.teased = true; chars[0].say('Hahaha! You walked right into it!', 3); chars[1].say('Rookie error.', 3);
      }
    }
  }
  updateParticles(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

/* ---------------- XR session ---------------- */
async function startXR(mode) {
  try {
    await actx.resume();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'hand-tracking'] });
    const ar = mode === 'immersive-ar';
    scene.background = ar ? null : VR_BG;
    floor.visible = !ar; grid.visible = !ar;
    await renderer.xr.setSession(session);
    needRecenter = true; panel.visible = true;
    session.addEventListener('end', () => {
      scene.background = DESK_BG; floor.visible = grid.visible = true; panel.visible = false;
      world.position.set(0, 0, 0); world.rotation.set(0, 0, 0);
      chars.forEach((c) => { c.root.position.copy(c.home); c.toIdle(); });
    });
  } catch (e) { setStatus('Could not start: ' + e.message); }
}
$('btnAR').addEventListener('click', () => startXR('immersive-ar'));
$('btnVR').addEventListener('click', () => startXR('immersive-vr'));
if (navigator.xr) {
  Promise.all([navigator.xr.isSessionSupported('immersive-ar'), navigator.xr.isSessionSupported('immersive-vr')]).then(([ar, vr]) => {
    $('btnAR').disabled = !ar; $('btnVR').disabled = !vr;
    if (!ar && !vr) setStatus(window.isSecureContext ? 'No headset found — open this page in the Quest browser.' : 'Needs an https:// link to enter VR — see the setup notes.');
    else setStatus('Ready. Step in!');
  });
} else setStatus(window.isSecureContext ? 'Preview mode — open this page in the Quest browser to step in.' : 'Needs an https:// link to enter VR — see the setup notes.');

/* ---------------- load ---------------- */
const loader = new GLTFLoader();
Promise.all(CAST.map((cfg) => loader.loadAsync(cfg.file).then((g) => new Character(cfg, g))))
  .then((list) => {
    chars = list; ready = true;
    $('loading').remove();
  })
  .catch((e) => { $('loading').textContent = 'Could not load the characters: ' + (e.message || e); console.error(e); });

/* ---------------- test hooks ---------------- */
if (TEST) {
  window.APP = {
    THREE, camera, controls, scene, world,
    get chars() { return chars; }, get ready() { return ready; },
    setCam(p, tg) { camera.position.set(...p); controls.target.set(...tg); controls.update(); },
    hand(p) { testHand = p ? new THREE.Vector3(...p) : null; },
    poke(i, region = 'body') { const c = chars[i]; const cap = c.capsules().find((x) => x[3] === region); c.poked(cap[1].clone(), new THREE.Vector3(0, 0, -1), region); },
    cmd: command, director, stage, deskInput, headW, get t() { return simT; },
  };
}

/* ============================================================
   开场：网球小孩打球 → 球飞成标题里的「100」
   左下小人挥拍 → 球走长弧飞向右上 → 在标题处分裂成两颗
   → 落进「1 ○ ○ 种人生」的两个 0 占位，停住充当数字
   技术：RoughJS(手绘线条) + Canvas + GSAP(动效)
   ============================================================ */

const DPR = Math.min(window.devicePixelRatio || 1, 2);

const cScene = document.getElementById('c-scene');
const cPlayer = document.getElementById('c-player');
const cBall = document.getElementById('c-ball');

const ctxScene = cScene.getContext('2d');
const ctxPlayer = cPlayer.getContext('2d');
const ctxBall = cBall.getContext('2d');

let rScene, rPlayer, rBall;
let W = 0, H = 0;

const SEED = 42;
const ink = '#1a1a1a';
const accent = '#c2410c';
const ballColour = '#c9d83a';

// ---- 全局状态 ----
const state = {
  pose: {
    shoulder: -2.3, elbow: -0.6, torso: 0.08,
    backLeg: 0.5, frontLeg: -0.35, lean: 0,
  },
  // 飞行中的单球（绝对像素坐标）
  fly: { x: 0, y: 0, rot: 0, r: 20, trail: 0, visible: false },
  // 落定的两颗球＝标题里的两个 0
  zeros: [
    { x: 0, y: 0, r: 20, rot: 0, visible: false },
    { x: 0, y: 0, r: 20, rot: 0, visible: false },
  ],
  flashContact: 0,
  completed: false,
};

let _flyVel = null;
let _racketCenter = null;

// ---- 读取标题里两个 0 占位框的画布坐标 ----
function slotCenters() {
  const cov = document.getElementById('cover').getBoundingClientRect();
  return ['slot-0', 'slot-1'].map((id) => {
    const s = document.getElementById(id).getBoundingClientRect();
    return {
      x: s.left + s.width / 2 - cov.left,
      y: s.top + s.height / 2 - cov.top,
      r: Math.max(s.width, s.height) / 2,
    };
  });
}

// ---- 尺寸自适应 ----
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  [cScene, cPlayer, cBall].forEach((c) => {
    c.width = W * DPR;
    c.height = H * DPR;
  });
  [ctxScene, ctxPlayer, ctxBall].forEach((ctx) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  });
  rScene = rough.canvas(cScene);
  rPlayer = rough.canvas(cPlayer);
  rBall = rough.canvas(cBall);

  drawScene();
  drawPlayer();
  if (state.completed) snapZeros();
  drawBall();
}

// 极坐标推进
function step(p, a, len) {
  return { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len };
}

/* ============================================================
   1) 静态场景：左下角的地面
   ============================================================ */
function drawScene() {
  ctxScene.clearRect(0, 0, W, H);
  const groundY = H * 0.86;

  rScene.line(W * 0.02, groundY, W * 0.42, groundY, {
    stroke: ink, strokeWidth: 2, roughness: 1.6, bowing: 1.2, seed: SEED,
  });
  for (let i = 0; i < 5; i++) {
    const x = W * (0.05 + i * 0.06);
    rScene.line(x, groundY + 6, x - 14, groundY + 18, {
      stroke: ink, strokeWidth: 1, roughness: 1.8, seed: SEED + i,
    });
  }
}

/* ============================================================
   2) 小人骨骼（正向运动学）—— 定位在左下角
   ============================================================ */
function drawPlayer() {
  ctxPlayer.clearRect(0, 0, W, H);

  const p = state.pose;
  const groundY = H * 0.86;
  const baseX = W * 0.16 + p.lean * W; // 左下
  const unit = H * 0.072;              // 肢体长度单位
  const hipY = groundY - unit * 3.0;

  const hip = { x: baseX, y: hipY };

  const neck = step(hip, -Math.PI / 2 + p.torso, unit * 1.7);
  const head = step(neck, -Math.PI / 2 + p.torso, unit * 0.95);

  const frontKnee = step(hip, Math.PI / 2 + p.frontLeg, unit * 1.2);
  const frontFoot = step(frontKnee, Math.PI / 2 + p.frontLeg * 0.3, unit * 1.2);
  const backKnee = step(hip, Math.PI / 2 + p.backLeg, unit * 1.2);
  const backFoot = step(backKnee, Math.PI / 2 + p.backLeg * 1.4, unit * 1.2);

  const shoulderPt = step(neck, -Math.PI / 2 + p.torso, unit * 0.15);
  const lElbow = step(shoulderPt, Math.PI * 0.78, unit * 1.0);
  const lHand = step(lElbow, Math.PI * 0.55, unit * 1.0);

  const rElbow = step(shoulderPt, p.shoulder, unit * 1.1);
  const rHand = step(rElbow, p.shoulder + p.elbow, unit * 1.1);

  const racketDir = p.shoulder + p.elbow;
  const racketCenter = step(rHand, racketDir, unit * 1.0);
  _racketCenter = racketCenter;

  const O = { stroke: ink, strokeWidth: 2.4, roughness: 1.5, bowing: 1, seed: SEED };

  rPlayer.line(hip.x, hip.y, frontKnee.x, frontKnee.y, O);
  rPlayer.line(frontKnee.x, frontKnee.y, frontFoot.x, frontFoot.y, O);
  rPlayer.line(hip.x, hip.y, backKnee.x, backKnee.y, O);
  rPlayer.line(backKnee.x, backKnee.y, backFoot.x, backFoot.y, O);
  rPlayer.line(hip.x, hip.y, neck.x, neck.y, { ...O, strokeWidth: 3 });

  rPlayer.circle(head.x, head.y, unit * 1.05, {
    stroke: ink, strokeWidth: 2.4, roughness: 1.4, seed: SEED + 5,
    fill: '#f4f1ea', fillStyle: 'solid',
  });

  rPlayer.line(shoulderPt.x, shoulderPt.y, lElbow.x, lElbow.y, O);
  rPlayer.line(lElbow.x, lElbow.y, lHand.x, lHand.y, O);

  const A = { ...O, strokeWidth: 2.6 };
  rPlayer.line(shoulderPt.x, shoulderPt.y, rElbow.x, rElbow.y, A);
  rPlayer.line(rElbow.x, rElbow.y, rHand.x, rHand.y, A);

  rPlayer.line(rHand.x, rHand.y, racketCenter.x, racketCenter.y, {
    stroke: accent, strokeWidth: 3, roughness: 1.2, seed: SEED + 9,
  });
  const racketHead = step(racketCenter, racketDir, unit * 0.55);
  drawRacketFace(racketHead, racketDir, unit);
}

function drawRacketFace(center, angle, unit) {
  ctxPlayer.save();
  ctxPlayer.translate(center.x, center.y);
  ctxPlayer.rotate(angle);
  const rFace = rough.canvas(cPlayer);
  rFace.ellipse(0, 0, unit * 1.7, unit * 1.2, {
    stroke: accent, strokeWidth: 2.4, roughness: 1.1, seed: SEED + 11,
  });
  for (let i = -2; i <= 2; i++) {
    rFace.line(i * unit * 0.28, -unit * 0.5, i * unit * 0.28, unit * 0.5, {
      stroke: ink, strokeWidth: 0.6, roughness: 0.8, seed: SEED + 30 + i,
    });
  }
  for (let i = -1; i <= 1; i++) {
    rFace.line(-unit * 0.7, i * unit * 0.3, unit * 0.7, i * unit * 0.3, {
      stroke: ink, strokeWidth: 0.6, roughness: 0.8, seed: SEED + 40 + i,
    });
  }
  ctxPlayer.restore();
}

/* ============================================================
   3) 网球渲染：飞行中的球 + 落定的两个 0
   ============================================================ */

// 画一颗手绘网球（绝对像素，可指定 seed 让两颗略有差异）
function drawOneBall(px, py, r, rot, seedBase) {
  ctxBall.save();
  ctxBall.translate(px, py);
  ctxBall.rotate(rot);
  const rb = rough.canvas(cBall);
  rb.circle(0, 0, r * 2, {
    stroke: ink, strokeWidth: 2, roughness: 1.3, seed: seedBase,
    fill: ballColour, fillStyle: 'solid',
  });
  rb.path(`M ${-r} 0 Q 0 ${-r * 0.7}, ${r} 0`, {
    stroke: '#ffffff', strokeWidth: 1.4, roughness: 1, seed: seedBase + 1,
  });
  rb.path(`M ${-r} 0 Q 0 ${r * 0.7}, ${r} 0`, {
    stroke: '#ffffff', strokeWidth: 1.4, roughness: 1, seed: seedBase + 2,
  });
  ctxBall.restore();
}

function drawBall() {
  ctxBall.clearRect(0, 0, W, H);

  // 已落定的两个 0
  state.zeros.forEach((z, i) => {
    if (z.visible) drawOneBall(z.x, z.y, z.r, z.rot, SEED + 80 + i * 3);
  });

  const b = state.fly;
  if (!b.visible) return;

  // 速度拖尾线
  if (b.trail > 0.01 && _flyVel) {
    const { vx, vy } = _flyVel;
    const sp = Math.hypot(vx, vy) || 1;
    const ux = -vx / sp, uy = -vy / sp;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * b.r * 0.55;
      const nx = -uy * off, ny = ux * off;
      const len = b.r * (5 + i) * b.trail;
      rBall.line(
        b.x + nx, b.y + ny,
        b.x + nx + ux * len, b.y + ny + uy * len,
        { stroke: accent, strokeWidth: 2 - i * 0.4, roughness: 1.6, seed: SEED + 50 + i }
      );
    }
  }

  drawOneBall(b.x, b.y, b.r, b.rot, SEED + 60);

  // 击球瞬间星芒
  if (state.flashContact > 0.01 && _racketCenter) {
    const rc = _racketCenter;
    const f = state.flashContact;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const inner = b.r * 1.2;
      const outer = b.r * (1.6 + f * 1.8);
      rBall.line(
        rc.x + Math.cos(a) * inner, rc.y + Math.sin(a) * inner,
        rc.x + Math.cos(a) * outer, rc.y + Math.sin(a) * outer,
        { stroke: accent, strokeWidth: 2.5 * f, roughness: 1.5, seed: SEED + 70 + i }
      );
    }
  }
}

// 把两颗球对齐到标题里两个 0 的占位（resize 后复位用）
function snapZeros() {
  const c = slotCenters();
  state.zeros.forEach((z, i) => {
    z.x = c[i].x; z.y = c[i].y; z.r = c[i].r; z.visible = true;
  });
}

/* ============================================================
   4) 动效时间线：挥拍 → 球长弧飞向标题 → 分裂成两个 0
   ============================================================ */
let swinging = false;

// 球的起点（小人持拍处附近）
function ballStart() {
  return { x: W * 0.22, y: H * 0.62 };
}

function swing() {
  if (swinging) return;
  swinging = true;
  state.completed = false;

  const p = state.pose;
  const b = state.fly;
  const targets = slotCenters();
  // 飞行终点：取两个 0 的中点，再分裂到各自位置
  const mid = {
    x: (targets[0].x + targets[1].x) / 2,
    y: (targets[0].y + targets[1].y) / 2,
  };

  const start = ballStart();
  b.r = targets[0].r;
  state.zeros.forEach((z) => { z.visible = false; });

  const tl = gsap.timeline({
    onUpdate: () => { drawPlayer(); drawBall(); },
    onComplete: () => { swinging = false; },
  });

  // 阶段一：蓄力后摆
  tl.to(p, {
    shoulder: -2.9, elbow: -1.5, torso: -0.12, lean: -0.015,
    backLeg: 0.65, frontLeg: -0.5,
    duration: 0.45, ease: 'power2.in',
  });

  // 阶段二：挥拍前甩（接触点）
  tl.to(p, {
    shoulder: -0.5, elbow: 0.15, torso: 0.18, lean: 0.02,
    backLeg: 0.3, frontLeg: -0.2,
    duration: 0.16, ease: 'power4.out',
  }, 'contact');

  // 击球星芒
  tl.fromTo(state, { flashContact: 0 },
    { flashContact: 1, duration: 0.06, ease: 'power2.out' }, 'contact+=0.06');
  tl.to(state, { flashContact: 0, duration: 0.25, ease: 'power2.in' }, '>');

  // 阶段三：球走长弧飞向标题（左下 → 右上）
  const fly = { t: 0 };
  tl.fromTo(fly, { t: 0 }, {
    t: 1, duration: 1.0, ease: 'power1.out',
    onStart: () => { b.visible = true; b.trail = 1; },
    onUpdate: () => {
      const t = fly.t;
      const px = b.x, py = b.y;
      b.x = start.x + (mid.x - start.x) * t;
      // 抛物线：拱起的高度（像素），先上后下
      const arcH = (H * 0.22) * (4 * t * (1 - t));
      b.y = start.y + (mid.y - start.y) * t - arcH;
      b.rot += 0.5;
      _flyVel = { vx: b.x - px, vy: b.y - py };
    },
  }, 'contact+=0.04');

  // 拖尾衰减
  tl.to(b, { trail: 0.15, duration: 0.6, ease: 'power1.in' }, 'contact+=0.5');

  // 阶段四：到达标题 → 分裂成两颗，弹进两个 0 的占位
  tl.add(() => {
    b.visible = false;
    const z0 = state.zeros[0], z1 = state.zeros[1];
    [z0, z1].forEach((z, i) => {
      z.x = mid.x; z.y = mid.y; z.r = b.r; z.rot = 0; z.visible = true;
    });
    drawBall();
  }, '>');

  // 两颗球从中点弹开到各自 0 的位置（带一点回弹）
  const splitObj = { k: 0 };
  tl.to(splitObj, {
    k: 1, duration: 0.5, ease: 'back.out(1.7)',
    onUpdate: () => {
      const k = splitObj.k;
      state.zeros[0].x = mid.x + (targets[0].x - mid.x) * k;
      state.zeros[0].y = mid.y + (targets[0].y - mid.y) * k;
      state.zeros[1].x = mid.x + (targets[1].x - mid.x) * k;
      state.zeros[1].y = mid.y + (targets[1].y - mid.y) * k;
      state.zeros.forEach((z) => { z.rot += 0.12 * (1 - k); });
      drawBall();
    },
  });

  // 阶段五：随挥收拍 + 复位姿势
  tl.to(p, {
    shoulder: 0.6, elbow: 0.5, torso: 0.05, lean: 0,
    backLeg: 0.5, frontLeg: -0.35,
    duration: 0.5, ease: 'power2.out',
  }, 'contact+=0.2');

  // 标题"100"完成 → 显示正文/按钮浮层、提示语
  tl.add(() => {
    state.completed = true;
    revealText();
  }, '>');
}

/* ============================================================
   5) 文字浮层入场 + 交互
   ============================================================ */
function revealText() {
  gsap.to('.cover-lower', { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
  gsap.to('#hint', { opacity: 0.4, duration: 0.6, delay: 0.3 });
}

function init() {
  // 标题始终可见（小孩为它打出 100）；正文先藏，球落定后浮现
  gsap.set('.cover-lower', { opacity: 0, y: 20 });
  gsap.set('#hint', { opacity: 0 });

  resize();

  // 点击画面 / 空格 → 再打一球（重新演示）
  document.getElementById('cover').addEventListener('click', (e) => {
    if (e.target.id === 'start-btn') return; // 按钮另有用途
    swing();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); swing(); }
  });

  // 「开始人生」按钮：先留个占位行为，等你定义后续跳转
  document.getElementById('start-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    swing();
  });

  window.addEventListener('resize', () => {
    const wasDone = state.completed;
    resize();
    if (wasDone) { snapZeros(); drawBall(); }
  });

  // 入场：稍等字体/布局稳定后自动开球
  gsap.delayedCall(0.6, swing);
}

window.addEventListener('load', init);

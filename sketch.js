/* ============================================================
   开场：网球小孩打球 → 球飞成标题里的「100」
   时序：开场只有小人 + 「按空格发球」提示
        → 发球后小人挥拍，标题渐显，球走长弧飞向右上
        → 球在标题处分裂成两颗，弹进「1 ○ ○ 种人生」的两个 0
        → 落定后正文 + 按钮淡入
   技术：RoughJS(手绘线条) + Canvas + GSAP(动效)
   ============================================================ */

const DPR = Math.min(window.devicePixelRatio || 1, 2);

const cScene = document.getElementById("c-scene");
const cPlayer = document.getElementById("c-player");
const cBall = document.getElementById("c-ball");

const ctxScene = cScene.getContext("2d");
const ctxPlayer = cPlayer.getContext("2d");
const ctxBall = cBall.getContext("2d");

let rScene, rPlayer, rBall;
let W = 0,
  H = 0;

const SEED = 42;
const ink = "#1a1a1a";
const accent = "#c2410c";
const ballColour = "#c9d83a";
const paper = "#f4f1ea";

// ---- 全局状态 ----
const state = {
  // 小人整体挥拍：rot=绕脚下支点旋转角(度)，scale=轻微缩放(蓄力下沉/伸展)
  body: { rot: 0, scale: 1 },
  fly: { x: 0, y: 0, rot: 0, r: 20, trail: 0, visible: false },
  zeros: [
    { x: 0, y: 0, r: 20, rot: 0, visible: false },
    { x: 0, y: 0, r: 20, rot: 0, visible: false },
  ],
  flashContact: 0,
  completed: false,
};

let _flyVel = null;
let _racketCenter = null;
let babyFrameTimer = null;
let babyFrameIndex = 0;
const PAGE_ORDER = [
  "cover",
  "gender-page",
  "ratio-page",
  "equal-page",
  "achievement-page",
  "map-page",
  "journey-page",
  "industry-page",
  "photo-wall-page",
];
let currentPageId = "cover";

// ---- 读取标题里两个 0 占位框的画布坐标 ----
function slotCenters() {
  const cov = document.getElementById("cover").getBoundingClientRect();
  return ["slot-0", "slot-1"].map((id) => {
    const s = document.getElementById(id).getBoundingClientRect();
    return {
      x: s.left + s.width / 2 - cov.left,
      y: s.top + s.height / 2 - cov.top,
      r: (Math.max(s.width, s.height) / 2) * 0.92,
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
   1) 静态场景：左下角的地面 + 小人投影
   ============================================================ */
function drawScene() {
  ctxScene.clearRect(0, 0, W, H);
  const groundY = H * 0.86;

  rScene.line(W * 0.02, groundY, W * 0.42, groundY, {
    stroke: ink,
    strokeWidth: 2,
    roughness: 1.6,
    bowing: 1.2,
    seed: SEED,
  });
  for (let i = 0; i < 5; i++) {
    const x = W * (0.05 + i * 0.06);
    rScene.line(x, groundY + 6, x - 14, groundY + 18, {
      stroke: ink,
      strokeWidth: 1,
      roughness: 1.8,
      seed: SEED + i,
    });
  }

  // 小人脚下投影（手绘椭圆）
  rScene.ellipse(W * 0.16, groundY + 4, W * 0.1, H * 0.022, {
    stroke: "rgba(26,26,26,0.18)",
    strokeWidth: 1.2,
    roughness: 2,
    fill: "rgba(26,26,26,0.10)",
    fillStyle: "solid",
    seed: SEED + 8,
  });
}

/* ============================================================
   2) 小人 = 你的原图 begin.svg（矢量），定位在左下
   不再用 canvas 画火柴人；改为定位 <img> 并整体旋转做挥拍。
   造型 100% 等于参考图；只有“整体摆动”这一动作由 GSAP 驱动。
   state.body.rot 控制绕脚下支点的旋转角（度）。
   ============================================================ */

const SVG_W = 918,
  SVG_H = 1089; // begin.svg 原始视框

// figure 在屏幕上的几何：脚贴地面、水平中心对齐地面投影
function figGeom() {
  const groundY = H * 0.86;
  const h = H * 0.62;
  const w = h * (SVG_W / SVG_H);
  const cx = W * 0.16; // 与 drawScene 的脚下投影对齐
  const x = cx - w / 2;
  const y = groundY - h; // 脚贴地
  // 球拍头：参考图里高举在左上方
  const racket = { x: x + w * 0.24, y: y + h * 0.12 };
  return { x, y, w, h, cx, racket, groundY };
}

let _playerImg = null;
function drawPlayer() {
  // player 画布不再绘制，仅清空，避免残留
  ctxPlayer.clearRect(0, 0, W, H);

  if (!_playerImg) _playerImg = document.getElementById("player");
  const g = figGeom();
  const s = _playerImg.style;
  s.width = g.w + "px";
  s.height = g.h + "px";
  s.left = g.x + "px";
  s.top = g.y + "px";
  s.transformOrigin = "48% 94%"; // 支点≈脚下/重心
  s.transform = `rotate(${state.body.rot}deg)`;

  _racketCenter = g.racket; // 击球星芒/出球位置
}

/* ============================================================
   3) 网球渲染：飞行球 + 落定的两个 0
   接缝＝经典竖向双弧（左右各一条 C 形曲线）
   ============================================================ */
function drawOneBall(
  px,
  py,
  r,
  rot,
  seedBase,
  fill = ballColour,
  ctx = ctxBall,
  canvas = cBall,
) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rot);
  const rb = rough.canvas(canvas);
  rb.circle(0, 0, r * 2, {
    stroke: ink,
    strokeWidth: 2,
    roughness: 1.2,
    seed: seedBase,
    fill: fill,
    fillStyle: "solid",
  });
  // 接缝：经典网球的两条侧弧（偏左/偏右，端点向内收）
  // 右弧：靠右，但向左鼓
  rb.path(
    `M ${0.46 * r} ${-0.86 * r} Q ${-0.04 * r} 0, ${0.46 * r} ${0.86 * r}`,
    {
      stroke: "#ffffff",
      strokeWidth: 1.8,
      roughness: 0.9,
      seed: seedBase + 1,
    },
  );
  // 左弧：靠左，但向右鼓
  rb.path(
    `M ${-0.46 * r} ${-0.86 * r} Q ${0.04 * r} 0, ${-0.46 * r} ${0.86 * r}`,
    {
      stroke: "#ffffff",
      strokeWidth: 1.8,
      roughness: 0.9,
      seed: seedBase + 2,
    },
  );
  ctx.restore();
}

function drawBall() {
  ctxBall.clearRect(0, 0, W, H);

  state.zeros.forEach((z, i) => {
    if (z.visible) drawOneBall(z.x, z.y, z.r, z.rot, SEED + 80 + i * 3);
  });

  const b = state.fly;
  if (!b.visible) return;

  if (b.trail > 0.01 && _flyVel) {
    const { vx, vy } = _flyVel;
    const sp = Math.hypot(vx, vy) || 1;
    const ux = -vx / sp,
      uy = -vy / sp;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * b.r * 0.55;
      const nx = -uy * off,
        ny = ux * off;
      const len = b.r * (5 + i) * b.trail;
      rBall.line(b.x + nx, b.y + ny, b.x + nx + ux * len, b.y + ny + uy * len, {
        stroke: accent,
        strokeWidth: 2 - i * 0.4,
        roughness: 1.6,
        seed: SEED + 50 + i,
      });
    }
  }

  drawOneBall(b.x, b.y, b.r, b.rot, SEED + 60);

  if (state.flashContact > 0.01 && _racketCenter) {
    const rc = _racketCenter;
    const f = state.flashContact;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const inner = b.r * 1.2;
      const outer = b.r * (1.6 + f * 1.8);
      rBall.line(
        rc.x + Math.cos(a) * inner,
        rc.y + Math.sin(a) * inner,
        rc.x + Math.cos(a) * outer,
        rc.y + Math.sin(a) * outer,
        {
          stroke: accent,
          strokeWidth: 2.5 * f,
          roughness: 1.5,
          seed: SEED + 70 + i,
        },
      );
    }
  }
}

function snapZeros() {
  const c = slotCenters();
  state.zeros.forEach((z, i) => {
    z.x = c[i].x;
    z.y = c[i].y;
    z.r = c[i].r;
    z.visible = true;
  });
}

/* ============================================================
   4) 动效时间线：发球 → 标题渐显 → 球落定成 100 → 正文淡入
   ============================================================ */
let swinging = false;
let served = false; // 是否已经发过第一球（控制开场提示）

function ballStart() {
  return { x: W * 0.22, y: H * 0.62 };
}

function swing() {
  if (swinging) return;
  swinging = true;
  state.completed = false;

  const firstServe = !served;
  served = true;

  const bd = state.body;
  const b = state.fly;
  const targets = slotCenters();
  const mid = {
    x: (targets[0].x + targets[1].x) / 2,
    y: (targets[0].y + targets[1].y) / 2,
  };

  const start = ballStart();
  b.r = targets[0].r;
  state.zeros.forEach((z) => {
    z.visible = false;
  });

  const tl = gsap.timeline({
    onUpdate: () => {
      drawPlayer();
      drawBall();
    },
    onComplete: () => {
      swinging = false;
    },
  });

  // 首次发球：隐去提示语
  if (firstServe) {
    tl.to(
      "#serve-hint",
      { opacity: 0, y: 10, duration: 0.3, ease: "power2.in" },
      0,
    );
  }

  // 阶段一：蓄力后摆（整体向后倾、略下沉）
  tl.to(
    bd,
    {
      rot: -14,
      scale: 0.97,
      duration: 0.45,
      ease: "power2.in",
    },
    0,
  );

  // 阶段二：挥拍前甩（整体前摆到接触点）
  tl.to(
    bd,
    {
      rot: 10,
      scale: 1.02,
      duration: 0.16,
      ease: "power4.out",
    },
    "contact",
  );

  // 标题在挥拍瞬间开始渐显（首次发球）——只做透明度，
  // 不做位移：避免占位坐标在球落定后还在移动，导致球与文字错位
  if (firstServe) {
    tl.to(
      ".title",
      { opacity: 1, duration: 0.6, ease: "power2.out" },
      "contact",
    );
    tl.to(
      ".subtitle",
      { opacity: 1, duration: 0.6, ease: "power2.out" },
      "contact+=0.1",
    );
  }

  // 击球星芒
  tl.fromTo(
    state,
    { flashContact: 0 },
    { flashContact: 1, duration: 0.06, ease: "power2.out" },
    "contact+=0.06",
  );
  tl.to(state, { flashContact: 0, duration: 0.25, ease: "power2.in" }, ">");

  // 阶段三：球走长弧飞向标题
  const fly = { t: 0 };
  tl.fromTo(
    fly,
    { t: 0 },
    {
      t: 1,
      duration: 1.0,
      ease: "power1.out",
      onStart: () => {
        b.visible = true;
        b.trail = 1;
      },
      onUpdate: () => {
        const t = fly.t;
        const px = b.x,
          py = b.y;
        b.x = start.x + (mid.x - start.x) * t;
        const arcH = H * 0.24 * (4 * t * (1 - t));
        b.y = start.y + (mid.y - start.y) * t - arcH;
        b.rot += 0.5;
        _flyVel = { vx: b.x - px, vy: b.y - py };
      },
    },
    "contact+=0.04",
  );

  tl.to(b, { trail: 0.15, duration: 0.6, ease: "power1.in" }, "contact+=0.5");

  // 阶段四：到达标题 → 分裂成两颗
  tl.add(() => {
    b.visible = false;
    state.zeros.forEach((z) => {
      z.x = mid.x;
      z.y = mid.y;
      z.r = b.r;
      z.rot = 0;
      z.visible = true;
    });
    drawBall();
  }, ">");

  // 两颗球弹进各自 0 位（back.out 回弹）
  const splitObj = { k: 0 };
  tl.to(splitObj, {
    k: 1,
    duration: 0.55,
    ease: "back.out(1.9)",
    onUpdate: () => {
      const k = splitObj.k;
      state.zeros[0].x = mid.x + (targets[0].x - mid.x) * k;
      state.zeros[0].y = mid.y + (targets[0].y - mid.y) * k;
      state.zeros[1].x = mid.x + (targets[1].x - mid.x) * k;
      state.zeros[1].y = mid.y + (targets[1].y - mid.y) * k;
      state.zeros.forEach((z) => {
        z.rot += 0.12 * (1 - k);
      });
      drawBall();
    },
  });

  // 落定后两个 0 轻微下沉回弹（坐实"变成数字"）
  tl.to(state.zeros, {
    y: "+=4",
    duration: 0.12,
    ease: "power1.in",
    yoyo: true,
    repeat: 1,
    onUpdate: () => drawBall(),
  });

  // 阶段五：随挥收拍 + 复位（回到直立）
  tl.to(
    bd,
    {
      rot: 0,
      scale: 1,
      duration: 0.5,
      ease: "power2.out",
    },
    "contact+=0.2",
  );

  // 标题"100"完成 → 正文 + 按钮淡入
  tl.add(() => {
    state.completed = true;
    updatePageNav();
    if (firstServe) revealText();
  }, ">");
}

/* ============================================================
   5) 文字浮层入场 + 交互
   ============================================================ */
function revealText() {
  gsap.to(".body", { opacity: 0.82, y: 0, duration: 0.7, ease: "power2.out" });
  gsap.to(".start-btn", {
    opacity: 1,
    y: 0,
    duration: 0.6,
    delay: 0.15,
    ease: "back.out(1.6)",
  });
  setPageNavReady("cover", true);
}

function setCurrentPage(id) {
  currentPageId = id;
  updatePageNav();
}

function pageIndexOf(id) {
  return PAGE_ORDER.indexOf(id);
}

function setPageNavReady(pageId, ready) {
  const nav = document
    .querySelector(`.page-nav-btn[data-page="${pageId}"]`)
    ?.closest(".page-nav");
  if (!nav) return;
  nav.classList.toggle("is-ready", !!ready);
}

function updatePageNav() {
  const idx = pageIndexOf(currentPageId);
  const hasGender = !!document.querySelector(".gender-option.is-selected");
  const canGoCoverNext = state.completed;
  const canGoGenderNext = hasGender;
  const canGoRatioNext = true;
  const canGoEqualNext = true;
  const canGoMapNext = !!mapState.selected;

  document.querySelectorAll(".page-nav").forEach((nav) => {
    const page = nav.querySelector(".page-nav-btn")?.dataset.page;
    if (!page) return;
    const pIdx = pageIndexOf(page);
    const prevBtn = nav.querySelector('[data-dir="prev"]');
    const nextBtn = nav.querySelector('[data-dir="next"]');
    if (prevBtn) prevBtn.disabled = pIdx <= 0;
    if (nextBtn) {
      let disabled = pIdx >= PAGE_ORDER.length - 1;
      if (page === "cover") disabled = disabled || !canGoCoverNext;
      if (page === "gender-page") disabled = disabled || !canGoGenderNext;
      if (page === "ratio-page") disabled = disabled || !canGoRatioNext;
      if (page === "equal-page") disabled = disabled || !canGoEqualNext;
      if (page === "map-page") disabled = disabled || !canGoMapNext;
      if (page === "industry-page") disabled = false;
      nextBtn.disabled = disabled;
    }
  });
}

function startBabyLoop() {
  const frame = document.getElementById("baby-frame");
  if (!frame || babyFrameTimer) return;
  const frames = ["photos/baby0.png", "photos/baby1.png"];

  babyFrameIndex = 0;
  frame.src = frames[babyFrameIndex];
  babyFrameTimer = window.setInterval(() => {
    babyFrameIndex = (babyFrameIndex + 1) % frames.length;
    frame.src = frames[babyFrameIndex];
  }, 520);
}

function showOnlyPage(id) {
  const cover = document.getElementById("cover");
  const gender = document.getElementById("gender-page");
  const ratio = document.getElementById("ratio-page");
  const equal = document.getElementById("equal-page");
  const achievement = document.getElementById("achievement-page");
  const map = document.getElementById("map-page");
  const journey = document.getElementById("journey-page");
  const industry = document.getElementById("industry-page");
  const photoWall = document.getElementById("photo-wall-page");

  cover.style.visibility = id === "cover" ? "visible" : "hidden";
  cover.style.opacity = id === "cover" ? "1" : "0";

  gender.classList.toggle("is-active", id === "gender-page");
  gender.style.visibility = id === "gender-page" ? "visible" : "hidden";
  gender.style.opacity = id === "gender-page" ? "1" : "0";
  gender.setAttribute("aria-hidden", id === "gender-page" ? "false" : "true");

  ratio.classList.toggle("is-active", id === "ratio-page");
  ratio.style.visibility = id === "ratio-page" ? "visible" : "hidden";
  ratio.style.opacity = id === "ratio-page" ? "1" : "0";
  ratio.setAttribute("aria-hidden", id === "ratio-page" ? "false" : "true");

  equal.classList.toggle("is-active", id === "equal-page");
  equal.style.visibility = id === "equal-page" ? "visible" : "hidden";
  equal.style.opacity = id === "equal-page" ? "1" : "0";
  equal.setAttribute("aria-hidden", id === "equal-page" ? "false" : "true");

  achievement.classList.toggle("is-active", id === "achievement-page");
  achievement.style.visibility =
    id === "achievement-page" ? "visible" : "hidden";
  achievement.style.opacity = id === "achievement-page" ? "1" : "0";
  achievement.setAttribute(
    "aria-hidden",
    id === "achievement-page" ? "false" : "true",
  );

  map.classList.toggle("is-active", id === "map-page");
  map.style.visibility = id === "map-page" ? "visible" : "hidden";
  map.style.opacity = id === "map-page" ? "1" : "0";
  map.setAttribute("aria-hidden", id === "map-page" ? "false" : "true");

  journey.classList.toggle("is-active", id === "journey-page");
  journey.style.visibility = id === "journey-page" ? "visible" : "hidden";
  journey.style.opacity = id === "journey-page" ? "1" : "0";
  journey.setAttribute("aria-hidden", id === "journey-page" ? "false" : "true");

  industry.classList.toggle("is-active", id === "industry-page");
  industry.style.visibility = id === "industry-page" ? "visible" : "hidden";
  industry.style.opacity = id === "industry-page" ? "1" : "0";
  industry.setAttribute(
    "aria-hidden",
    id === "industry-page" ? "false" : "true",
  );

  photoWall.classList.toggle("is-active", id === "photo-wall-page");
  photoWall.style.visibility = id === "photo-wall-page" ? "visible" : "hidden";
  photoWall.style.opacity = id === "photo-wall-page" ? "1" : "0";
  photoWall.setAttribute(
    "aria-hidden",
    id === "photo-wall-page" ? "false" : "true",
  );

  ratioState.active = id === "ratio-page";
  equalState.active = id === "equal-page";
  achievementState.active = id === "achievement-page";
  mapState.active = id === "map-page";
  journeyState.active = id === "journey-page";
  industryState.active = id === "industry-page";
  if (id !== "equal-page" && equalTween) {
    equalTween.kill();
    equalTween = null;
  }
  setPageNavReady(id, false);
  setCurrentPage(id);
}

function hydrateRatioStatic() {
  const picked = document.querySelector(".gender-option.is-selected");
  ratioState.playerGender =
    picked && picked.dataset.gender === "girl" ? "girl" : "boy";
  sizeRatioCanvas();
  setupRatioCars();
  ["boy", "girl"].forEach((side) => {
    ratioState.cars[side].balls.forEach((b, i) => {
      if (i < ratioState.cars[side].autoCount) b.y = b.slotY;
    });
  });
  const p = ratioState.player;
  if (p) {
    p.y = p.restY;
    p.glow = 0.4;
  }
  const body = document.getElementById("ratio-body");
  if (body) {
    const who = ratioState.playerGender === "boy" ? "男生" : "女生";
    body.textContent = `每 100 个网球人口里，就有一个是${who}的你。`;
  }
  const btn = document.getElementById("ratio-next-btn");
  if (btn) btn.classList.add("is-ready");
  drawRatioScene();
}

function showPageInstant(id) {
  showOnlyPage(id);
  if (id === "gender-page") {
    gsap.set(".gender-paper", { opacity: 1, y: 0, scale: 1 });
    gsap.set(".gender-copy > *", { opacity: 1, y: 0 });
    gsap.set(".baby-stage", { opacity: 1, x: 0 });
    startBabyLoop();
  }
  if (id === "ratio-page") {
    gsap.set(".ratio-copy > *", { opacity: 1, y: 0 });
    gsap.set(".ratio-cars-label", { opacity: 1 });
    hydrateRatioStatic();
  }
  if (id === "equal-page") {
    gsap.set(".equal-copy > *", { opacity: 1, y: 0 });
    gsap.set("#equal-next-btn", { opacity: 1, y: 0 });
    document.getElementById("equal-next-btn")?.classList.add("is-ready");
    sizeEqualCanvas();
    prepareEqualScene();
    equalState.progress = 1;
    drawEqualScene();
  }
  if (id === "achievement-page") {
    gsap.set(".achievement-copy > *", { opacity: 1, y: 0 });
    renderAchievementPlot(true);
  }
  if (id === "map-page") {
    const hasSelection = !!mapState.selected;
    gsap.set("#map-hint", { opacity: hasSelection ? 0 : 1, y: 0 });
    gsap.set("#map-copy", { opacity: hasSelection ? 1 : 0 });
    gsap.set("#map-copy > *", { opacity: hasSelection ? 1 : 0, y: 0 });
    gsap.set("#map-legend", { opacity: hasSelection ? 1 : 0 });
    ensureMapChart();
    computeMapGeom();
    drawMap();
  }
  if (id === "journey-page") {
    if (!journeyState.currentNodeId) {
      resetJourney();
    }
    renderJourneyNode();
    gsap.set(".journey-paper", { opacity: 1, y: 0, scale: 1 });
  }
  if (id === "industry-page") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initIndustryCanvas();
        if (industryState.canvasReady) {
          drawIndustryChart(industryState.currentKey, 1);
        }
      });
    });
  }
  if (id === "photo-wall-page") {
    initPhotoWall();
  }
  setPageNavReady(id, true);
}

function navigatePage(dir, fromPage) {
  if (fromPage === "journey-page") {
    if (dir === "prev") {
      navigateJourneyBack();
    }
    return;
  }
  if (fromPage === "industry-page") {
    if (dir === "prev") {
      debugOpenJourneyNode("overseas-tour");
      return;
    }
    if (dir === "next") {
      debugOpenJourneyNode("ending-business");
      return;
    }
  }
  const idx = pageIndexOf(fromPage);
  if (idx < 0) return;
  const target = PAGE_ORDER[idx + (dir === "next" ? 1 : -1)];
  if (!target) return;
  if (fromPage === "cover" && dir === "next" && !state.completed) return;
  if (
    fromPage === "gender-page" &&
    dir === "next" &&
    !document.querySelector(".gender-option.is-selected")
  )
    return;
  if (fromPage === "ratio-page" && dir === "next" && target === "equal-page") {
    openEqualPage();
    return;
  }
  if (fromPage === "map-page" && dir === "next" && target === "journey-page") {
    openJourneyPage();
    return;
  }
  showPageInstant(target);
}

function openGenderPage() {
  const cover = document.getElementById("cover");
  const page = document.getElementById("gender-page");
  if (!cover || !page || page.classList.contains("is-active")) return;

  page.setAttribute("aria-hidden", "false");
  page.classList.add("is-active");
  page.style.visibility = "visible";
  page.style.opacity = "1";
  setPageNavReady("gender-page", false);
  startBabyLoop();
  setCurrentPage("gender-page");

  const tl = gsap.timeline();
  tl.to("#cover", {
    opacity: 0,
    duration: 0.45,
    ease: "power2.inOut",
    onComplete: () => {
      cover.style.visibility = "hidden";
    },
  });
  tl.fromTo(
    ".gender-paper",
    { opacity: 0, y: 36, scale: 0.985 },
    { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "power3.out" },
    "-=0.08",
  );
  tl.fromTo(
    ".gender-copy > *",
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out" },
    "-=0.38",
  );
  tl.fromTo(
    ".baby-stage",
    { opacity: 0, x: 12 },
    { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" },
    "-=0.5",
  );
  tl.add(() => setPageNavReady("gender-page", true));
}

/* ============================================================
   6) 第三幕：中国网球人口男女比例
   左车 53 颗（男/蓝）、右车 47 颗（女/粉），共 100 = 100%。
   玩家作为"你"那颗球，从顶部落入自己性别对应的车里。
   ============================================================ */
const RATIO = { boy: 53, girl: 47 };
const carColour = { boy: "#3b6fb0", girl: "#d76b95" };

let cRatio, ctxRatio, rRatio;
const ratioState = {
  active: false,
  playerGender: "boy",
  cars: { boy: { geom: null, balls: [] }, girl: { geom: null, balls: [] } },
  player: null, // {x,y,r,rot,glow,restX,restY}
};

let cEqual, ctxEqual, rEqual;
let equalTween = null;
const equalState = {
  active: false,
  progress: 0,
  geom: null,
  grass: [],
  events: [],
};

const achievementState = {
  active: false,
  rendered: false,
  view: "slam",
};

// 第三幕 canvas 尺寸（必须在 is-active 后调用，否则拿不到真实宽高）
function sizeRatioCanvas() {
  if (!cRatio) {
    cRatio = document.getElementById("c-ratio");
    ctxRatio = cRatio.getContext("2d");
  }
  cRatio.width = W * DPR;
  cRatio.height = H * DPR;
  ctxRatio.setTransform(DPR, 0, 0, DPR, 0, 0);
  rRatio = rough.canvas(cRatio);
}

// 网球车几何：坐标全部可控，球落点据此计算
function ratioCarGeom(side) {
  const cols = 10;
  const innerW = Math.min(W * 0.3, 440);
  const d = innerW / cols; // 落点间距 = 球直径
  const r = (d / 2) * 0.92; // 球半径（留缝）
  const maxCount = Math.max(RATIO.boy, RATIO.girl);
  const rows = Math.ceil(maxCount / cols); // 两车同高
  const innerH = rows * d + d * 0.45;
  const cx = side === "boy" ? W * 0.3 : W * 0.7;
  const floorY = H * 0.72; // 筐内底
  const mouthY = floorY - innerH; // 筐口（开口顶沿）
  const wallL = cx - innerW / 2;
  const wallR = cx + innerW / 2;
  const flare = d * 0.7; // 上宽下窄的外扩量
  const legH = H * 0.14;
  return {
    cx,
    cols,
    d,
    r,
    rows,
    innerW,
    innerH,
    floorY,
    mouthY,
    wallL,
    wallR,
    flare,
    legH,
  };
}

// 网格落点：从底向上、逐行从左到右；返回顺序 = 落入顺序
function computeSlots(g, count) {
  const slots = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / g.cols);
    const col = i % g.cols;
    slots.push({
      x: g.wallL + g.r + col * g.d,
      y: g.floorY - g.r - row * g.d,
    });
  }
  return slots;
}

// 画一辆手绘铁丝网球车（篮筐 + 网格 + 四条腿）
function drawCar(side) {
  const g = ratioState.cars[side].geom;
  if (!g) return;
  const col = carColour[side];
  const seed = SEED + (side === "boy" ? 200 : 300);

  // 筐体：上宽下窄的梯形（手绘四边形）
  const tl = { x: g.wallL - g.flare, y: g.mouthY };
  const tr = { x: g.wallR + g.flare, y: g.mouthY };
  const br = { x: g.wallR, y: g.floorY };
  const bl = { x: g.wallL, y: g.floorY };
  rRatio.polygon(
    [
      [tl.x, tl.y],
      [tr.x, tr.y],
      [br.x, br.y],
      [bl.x, bl.y],
    ],
    {
      stroke: ink,
      strokeWidth: 2.4,
      roughness: 1.6,
      bowing: 1.1,
      seed,
    },
  );
  // 筐口加一道厚边
  rRatio.line(tl.x, tl.y, tr.x, tr.y, {
    stroke: ink,
    strokeWidth: 3,
    roughness: 1.4,
    seed: seed + 1,
  });

  // 铁丝网：竖线（按上下沿插值，斜向收口）
  const netCol = col;
  for (let i = 1; i < g.cols; i++) {
    const f = i / g.cols;
    const xt = tl.x + (tr.x - tl.x) * f;
    const xb = bl.x + (br.x - bl.x) * f;
    rRatio.line(xt, g.mouthY, xb, g.floorY, {
      stroke: netCol,
      strokeWidth: 1,
      roughness: 1.8,
      seed: seed + 10 + i,
    });
  }
  // 铁丝网：横线
  const netRows = g.rows;
  for (let j = 1; j < netRows; j++) {
    const f = j / netRows;
    const y = g.mouthY + (g.floorY - g.mouthY) * f;
    const xl = tl.x + (bl.x - tl.x) * f;
    const xr = tr.x + (br.x - tr.x) * f;
    rRatio.line(xl, y, xr, y, {
      stroke: netCol,
      strokeWidth: 1,
      roughness: 1.8,
      seed: seed + 40 + j,
    });
  }

  // 四条腿：从筐底四角向下发散
  const legSpread = g.innerW * 0.06;
  rRatio.line(bl.x, g.floorY, bl.x - legSpread, g.floorY + g.legH, {
    stroke: ink,
    strokeWidth: 2.2,
    roughness: 1.6,
    seed: seed + 70,
  });
  rRatio.line(br.x, g.floorY, br.x + legSpread, g.floorY + g.legH, {
    stroke: ink,
    strokeWidth: 2.2,
    roughness: 1.6,
    seed: seed + 71,
  });
  // 内侧两条腿（略短，制造透视）
  rRatio.line(
    g.wallL + g.innerW * 0.28,
    g.floorY,
    g.wallL + g.innerW * 0.24,
    g.floorY + g.legH * 0.92,
    {
      stroke: ink,
      strokeWidth: 2,
      roughness: 1.6,
      seed: seed + 72,
    },
  );
  rRatio.line(
    g.wallR - g.innerW * 0.28,
    g.floorY,
    g.wallR - g.innerW * 0.24,
    g.floorY + g.legH * 0.92,
    {
      stroke: ink,
      strokeWidth: 2,
      roughness: 1.6,
      seed: seed + 73,
    },
  );
}

// 画两车里的所有球（复用开场 drawOneBall）
function drawRatioBalls() {
  ["boy", "girl"].forEach((side) => {
    const car = ratioState.cars[side];
    const g = car.geom;
    if (!g) return;
    const fill = carColour[side];
    car.balls.forEach((b, i) => {
      if (b.y == null) return;
      drawOneBall(
        b.x,
        b.y,
        g.r,
        b.rot,
        SEED + 400 + (side === "boy" ? 0 : 500) + i,
        fill,
        ctxRatio,
        cRatio,
      );
    });
  });
}

// 玩家球（"你"）：带 accent 高亮描边
function drawPlayerBall() {
  const p = ratioState.player;
  if (!p || p.y == null) return;
  const fill = carColour[ratioState.playerGender];
  // 先画球本体
  drawOneBall(p.x, p.y, p.r, p.rot, SEED + 999, fill, ctxRatio, cRatio);
  // 高亮光环（落定后脉冲）
  if (p.glow > 0.01) {
    const rb = rough.canvas(cRatio);
    rb.circle(p.x, p.y, p.r * 2 * (1.25 + p.glow * 0.25), {
      stroke: accent,
      strokeWidth: 2.5,
      roughness: 1.2,
      seed: SEED + 1001,
    });
  }
}

// 重绘整个第三幕
function drawRatioScene() {
  if (!ctxRatio) return;
  ctxRatio.clearRect(0, 0, W, H);
  drawCar("boy");
  drawCar("girl");
  drawRatioBalls();
  drawPlayerBall();
}

// 计算两车几何 + 生成球数组（保留最后一格给玩家球）
function setupRatioCars() {
  ["boy", "girl"].forEach((side) => {
    const g = ratioCarGeom(side);
    const total = RATIO[side];
    const isPlayerCar = side === ratioState.playerGender;
    const autoCount = isPlayerCar ? total - 1 : total; // 玩家车留一格
    const slots = computeSlots(g, total);
    const balls = slots.map((s, i) => ({
      slotX: s.x,
      slotY: s.y,
      x: s.x,
      y: null, // y=null 表示还没落下
      rot: (Math.random() - 0.5) * 0.5,
      isPlayerSlot: isPlayerCar && i === total - 1,
    }));
    ratioState.cars[side] = { geom: g, balls, autoCount };
  });
  // 玩家球：落点 = 自己车的最后一格
  const pc = ratioState.cars[ratioState.playerGender];
  const last = pc.balls[pc.balls.length - 1];
  ratioState.player = {
    x: last.slotX,
    y: null,
    restX: last.slotX,
    restY: last.slotY,
    r: pc.geom.r,
    rot: 0,
    glow: 0,
  };
}

// 落球动效：两车普通球错峰下落 → 玩家球从顶部单独落入 → 高亮
function runRatioFill() {
  const body = document.getElementById("ratio-body");
  const tl = gsap.timeline({
    onUpdate: drawRatioScene,
  });

  // 计数文案
  let shownBoy = 0,
    shownGirl = 0;
  function refreshCopy() {
    body.textContent = `男生 ${shownBoy} 个，女生 ${shownGirl} 个`;
  }
  refreshCopy();

  // 两车普通球并行错峰落下
  ["boy", "girl"].forEach((side) => {
    const car = ratioState.cars[side];
    const g = car.geom;
    for (let i = 0; i < car.autoCount; i++) {
      const b = car.balls[i];
      const startY = g.mouthY - g.r - (H * 0.1 + Math.random() * H * 0.04);
      tl.fromTo(
        b,
        { y: startY },
        {
          y: b.slotY,
          duration: 0.5,
          ease: "bounce.out",
          onStart: () => {
            b.y = startY;
          },
          onComplete: () => {
            if (side === "boy") shownBoy++;
            else shownGirl++;
            refreshCopy();
          },
        },
        i * 0.03,
      ); // 错峰
    }
  });

  // 普通球落定后短暂停顿，再让玩家球登场
  tl.add(() => {
    body.textContent = "还差一个……那就是你。";
  }, "+=0.2");

  // 玩家球：从屏幕正上方、走更长更慢的轨迹落入最后一格
  const p = ratioState.player;
  const dropFrom = -p.r * 2;
  tl.fromTo(
    p,
    { y: dropFrom, rot: 0 },
    {
      y: p.restY,
      duration: 1.1,
      ease: "bounce.out",
      onStart: () => {
        p.y = dropFrom;
      },
      onUpdate: () => {
        p.rot += 0.06;
      },
    },
    "+=0.15",
  );

  // 落定高亮脉冲
  tl.fromTo(p, { glow: 0 }, { glow: 1, duration: 0.3, ease: "power2.out" });
  tl.to(p, {
    glow: 0.4,
    duration: 0.9,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    onUpdate: drawRatioScene,
  });

  // 文案收尾
  tl.add(() => {
    const who = ratioState.playerGender === "boy" ? "男生" : "女生";
    body.textContent = `每 100 个网球人口里，就有一个是${who}的你。`;
  }, "<");

  // 收尾后浮出「去看看你的家乡」按钮
  tl.add(() => {
    const btn = document.getElementById("ratio-next-btn");
    if (btn) {
      btn.classList.add("is-ready");
      gsap.fromTo(
        btn,
        { y: 14 },
        { y: 0, duration: 0.5, ease: "back.out(1.6)" },
      );
    }
    setPageNavReady("ratio-page", true);
  }, "+=0.4");
}

function runRatioFillNarrative() {
  const body = document.getElementById("ratio-body");
  const tl = gsap.timeline({
    onUpdate: drawRatioScene,
  });

  if (body) {
    body.innerHTML =
      "我国网球人口总数达 25,188,388人（2024年数据）。<br>其中 53% 是男性，47% 是女性。";
  }

  ["boy", "girl"].forEach((side) => {
    const car = ratioState.cars[side];
    const g = car.geom;
    for (let i = 0; i < car.autoCount; i++) {
      const b = car.balls[i];
      const startY = g.mouthY - g.r - (H * 0.1 + Math.random() * H * 0.04);
      tl.fromTo(
        b,
        { y: startY },
        {
          y: b.slotY,
          duration: 0.5,
          ease: "bounce.out",
          onStart: () => {
            b.y = startY;
          },
        },
        i * 0.03,
      );
    }
  });

  const p = ratioState.player;
  const dropFrom = -p.r * 2;
  tl.fromTo(
    p,
    { y: dropFrom, rot: 0 },
    {
      y: p.restY,
      duration: 1.1,
      ease: "bounce.out",
      onStart: () => {
        p.y = dropFrom;
      },
      onUpdate: () => {
        p.rot += 0.06;
      },
    },
    "+=0.15",
  );

  tl.fromTo(p, { glow: 0 }, { glow: 1, duration: 0.3, ease: "power2.out" });
  tl.to(p, {
    glow: 0.4,
    duration: 0.9,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    onUpdate: drawRatioScene,
  });

  tl.add(() => {
    if (body) {
      body.innerHTML =
        "我国网球人口总数达 25,188,388人（2024年数据）。<br>其中 53% 是男性，47% 是女性。<br>也就是说，每100个网球人里，就有大约 47个是女生，你的身影就在其中。";
    }
  }, "<");

  tl.add(() => {
    const btn = document.getElementById("ratio-next-btn");
    if (btn) {
      btn.classList.add("is-ready");
      gsap.fromTo(
        btn,
        { y: 14 },
        { y: 0, duration: 0.5, ease: "back.out(1.6)" },
      );
    }
    setPageNavReady("ratio-page", true);
  }, "+=0.4");
}

function openRatioPage() {
  const gender = document.getElementById("gender-page");
  const page = document.getElementById("ratio-page");
  if (!page || page.classList.contains("is-active")) return;

  // 读第二幕的选择
  const picked = document.querySelector(".gender-option.is-selected");
  ratioState.playerGender =
    picked && picked.dataset.gender === "girl" ? "girl" : "boy";
  ratioState.active = true;
  setPageNavReady("ratio-page", false);
  setCurrentPage("ratio-page");

  page.setAttribute("aria-hidden", "false");
  page.classList.add("is-active");
  page.style.visibility = "visible";
  page.style.opacity = "1";

  const tl = gsap.timeline();
  tl.to("#gender-page", {
    opacity: 0,
    duration: 0.45,
    ease: "power2.inOut",
    onComplete: () => {
      gender.classList.remove("is-active");
      gender.setAttribute("aria-hidden", "true");
      gender.style.visibility = "hidden";
    },
  });
  // 页面可见后再 size canvas（此时才有真实尺寸）
  tl.add(() => {
    sizeRatioCanvas();
    setupRatioCars();
    drawRatioScene();
  });
  tl.fromTo(
    ".ratio-copy > *",
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out" },
  );
  tl.fromTo(
    ".ratio-cars-label",
    { opacity: 0 },
    { opacity: 1, duration: 0.5, ease: "power2.out" },
    "<",
  );
  tl.add(() => runRatioFillNarrative(), "+=0.1");
}

function sizeEqualCanvas() {
  if (!cEqual) {
    cEqual = document.getElementById("c-equal");
    ctxEqual = cEqual.getContext("2d");
  }
  cEqual.width = W * DPR;
  cEqual.height = H * DPR;
  ctxEqual.setTransform(DPR, 0, 0, DPR, 0, 0);
  rEqual = rough.canvas(cEqual);
}

function equalEventData() {
  return Array.isArray(window.EQUAL_PAY_EVENTS) ? window.EQUAL_PAY_EVENTS : [];
}

function prepareEqualScene() {
  const lineLeft = W * 0.1;
  const lineRight = W * 0.9;
  const lineY = H * 0.64;
  const minYear = 1973;
  const maxYear = 2007;
  equalState.geom = {
    left: lineLeft,
    right: lineRight,
    y: lineY,
    width: lineRight - lineLeft,
    ballR: Math.max(16, Math.min(26, W * 0.018)),
  };

  equalState.grass = Array.from({ length: 220 }, (_, i) => {
    const t = i / 219;
    const x = lineLeft + (lineRight - lineLeft) * t;
    const h = 12 + Math.sin(i * 0.8) * 3 + ((i % 5) - 2) * 1.2;
    const lean = ((i % 9) - 4) * 0.05;
    const cluster = 2 + (i % 3);
    return { x, h, lean, seed: SEED + 1500 + i, cluster };
  });

  const lanes = [1, 1, -1, 1];
  const stacks = [0, 1, 0, 1];
  equalState.events = equalEventData().map((item, i) => {
    const t = (item.year - minYear) / Math.max(1, maxYear - minYear);
    const x = lineLeft + (lineRight - lineLeft) * t;
    return {
      ...item,
      x,
      t,
      lane: lanes[i % lanes.length],
      stack: stacks[i % stacks.length],
      y: lineY,
    };
  });
}

function drawGrassBlade(x, baseY, h, lean, seed) {
  const tipX = x + lean * h * 3.2;
  const tipY = baseY - h;
  rEqual.line(x, baseY, tipX, tipY, {
    stroke: "#6d8e2a",
    strokeWidth: 1.35,
    roughness: 1.8,
    bowing: 1.3,
    seed,
  });
  rEqual.line(x + 1.5, baseY, tipX + 2, tipY + h * 0.12, {
    stroke: "rgba(201, 216, 58, 0.85)",
    strokeWidth: 1,
    roughness: 1.6,
    bowing: 1.1,
    seed: seed + 1,
  });
}

function drawGrassCluster(blade, baseY, grow, index) {
  const density = blade.cluster || 2;
  for (let j = 0; j < density; j++) {
    const offset = (j - (density - 1) / 2) * 3.1;
    const h = blade.h * (0.82 + j * 0.12) * grow;
    const lean = blade.lean + (j - 1) * 0.025;
    drawGrassBlade(
      blade.x + offset,
      baseY,
      h,
      lean,
      blade.seed + index * 7 + j * 2,
    );
  }
}

function drawEqualScene() {
  if (!ctxEqual || !equalState.geom) return;
  const { left, right, y, width, ballR } = equalState.geom;
  const progress = equalState.progress;
  const ballX = left + width * progress;

  ctxEqual.clearRect(0, 0, W, H);

  rEqual.line(left, y, right, y, {
    stroke: "rgba(26, 26, 26, 0.9)",
    strokeWidth: 2.2,
    roughness: 1.4,
    bowing: 0.6,
    seed: SEED + 1200,
  });

  equalState.grass.forEach((blade, i) => {
    if (blade.x > ballX - ballR * 0.2) return;
    const fade = Math.min(1, Math.max(0, (ballX - blade.x) / 38));
    drawGrassCluster(blade, y + 2, 0.45 + fade * 0.55, i);
  });

  equalState.events.forEach((event, i) => {
    const reached = progress >= event.t;
    const alpha = reached ? 1 : 0.28;
    const stemEnd =
      event.lane < 0
        ? y - (58 + event.stack * 18)
        : y + (56 + event.stack * 18);
    rEqual.line(event.x, y - 2, event.x, stemEnd, {
      stroke: `rgba(26, 26, 26, ${reached ? 0.92 : 0.28})`,
      strokeWidth: reached ? 1.8 : 1.1,
      roughness: 1.6,
      bowing: 0.7,
      seed: SEED + 1300 + i,
    });

    ctxEqual.save();
    ctxEqual.globalAlpha = alpha;
    ctxEqual.fillStyle = ink;
    ctxEqual.textAlign = "center";
    ctxEqual.textBaseline = event.lane < 0 ? "bottom" : "top";
    ctxEqual.font = `${Math.round(Math.max(16, Math.min(24, W * 0.016)))}px "PF HuTu", sans-serif`;
    ctxEqual.fillText(
      event.yearLabel,
      event.x,
      stemEnd + (event.lane < 0 ? -14 : 14),
    );
    ctxEqual.font = `${Math.round(Math.max(14, Math.min(22, W * 0.0125)))}px "PF HuTu", sans-serif`;
    const wrapY = stemEnd + (event.lane < 0 ? -42 : 42);
    const nameLines = event.nameLines || [event.name];
    nameLines.forEach((line, lineIndex) => {
      const lineGap = 22;
      const yy =
        wrapY + (event.lane < 0 ? -lineIndex * lineGap : lineIndex * lineGap);
      ctxEqual.fillText(line, event.x, yy);
    });
    ctxEqual.restore();
  });

  ctxEqual.save();
  ctxEqual.strokeStyle = "rgba(26, 26, 26, 0.2)";
  ctxEqual.lineWidth = 1;
  [1973, 1980, 1990, 2000, 2007].forEach((year, i) => {
    const t = (year - 1973) / (2007 - 1973);
    const x = left + width * t;
    ctxEqual.beginPath();
    ctxEqual.moveTo(x, y - 10);
    ctxEqual.lineTo(x, y + 10);
    ctxEqual.stroke();
    ctxEqual.fillStyle = "rgba(26, 26, 26, 0.42)";
    ctxEqual.font = `${Math.round(Math.max(12, Math.min(17, W * 0.01)))}px "PF HuTu", sans-serif`;
    ctxEqual.textAlign = i === 0 ? "left" : i === 4 ? "right" : "center";
    ctxEqual.fillText(String(year), x, y + 28);
  });
  ctxEqual.restore();

  drawOneBall(
    ballX,
    y - ballR * 0.7,
    ballR,
    progress * Math.PI * 3.4,
    SEED + 1700,
    ballColour,
    ctxEqual,
    cEqual,
  );
  rEqual.line(
    ballX - ballR * 0.8,
    y + ballR * 0.35,
    ballX + ballR * 0.6,
    y + ballR * 0.45,
    {
      stroke: "rgba(26, 26, 26, 0.14)",
      strokeWidth: 2,
      roughness: 1.7,
      bowing: 1.2,
      seed: SEED + 1705,
    },
  );
}

function openEqualPage() {
  const ratio = document.getElementById("ratio-page");
  const page = document.getElementById("equal-page");
  if (!page || page.classList.contains("is-active")) return;

  equalState.active = true;
  equalState.progress = 0;
  setPageNavReady("equal-page", false);
  setCurrentPage("equal-page");
  page.setAttribute("aria-hidden", "false");
  page.classList.add("is-active");
  page.style.visibility = "visible";
  page.style.opacity = "1";

  const nextBtn = document.getElementById("equal-next-btn");
  if (nextBtn) {
    nextBtn.classList.remove("is-ready");
    gsap.set(nextBtn, { opacity: 0, y: 0 });
  }
  gsap.set(".equal-copy > *", { opacity: 0, y: 20 });

  const tl = gsap.timeline();
  tl.to("#ratio-page", {
    opacity: 0,
    duration: 0.45,
    ease: "power2.inOut",
    onComplete: () => {
      ratio.classList.remove("is-active");
      ratio.setAttribute("aria-hidden", "true");
      ratio.style.visibility = "hidden";
    },
  });
  tl.add(() => {
    sizeEqualCanvas();
    prepareEqualScene();
    drawEqualScene();
  });
  tl.fromTo(
    ".equal-copy > *",
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out" },
    0.08,
  );
  tl.add(() => {
    if (equalTween) equalTween.kill();
    equalTween = gsap.to(equalState, {
      progress: 1,
      duration: 5.4,
      ease: "power1.inOut",
      onUpdate: drawEqualScene,
      onComplete: () => {
        if (nextBtn) {
          nextBtn.classList.add("is-ready");
          gsap.to(nextBtn, {
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: "power2.out",
          });
        }
        setPageNavReady("equal-page", true);
      },
    });
  }, 0.18);
}

function achievementData() {
  if (achievementState.view === "olympics") {
    return Array.isArray(window.OLYMPIC_BREAKTHROUGHS)
      ? window.OLYMPIC_BREAKTHROUGHS
      : [];
  }
  if (achievementState.view === "rankings") {
    return Array.isArray(window.WORLD_RANKING_BREAKTHROUGHS)
      ? window.WORLD_RANKING_BREAKTHROUGHS
      : [];
  }
  return Array.isArray(window.SLAM_BREAKTHROUGHS)
    ? window.SLAM_BREAKTHROUGHS
    : [];
}

function achievementKindClass(kind) {
  if (kind === "女单" || kind === "女子单打") return "is-ws";
  if (kind === "男单" || kind === "男子单打") return "is-ms";
  if (kind === "女双") return "is-wd";
  if (kind === "混双") return "is-xd";
  return "is-ws";
}

function achievementLevelValue(result) {
  if (achievementState.view === "olympics") {
    if (result.includes("金牌")) return 0.18;
    if (result.includes("银牌") || result.includes("铜牌")) return 0.42;
    return 0.74;
  }
  if (achievementState.view === "rankings") {
    if (
      result.includes("第2") ||
      result.includes("第5") ||
      result.includes("第31")
    )
      return 0.18;
    if (result.includes("第50") || result.includes("第99")) return 0.46;
    return 0.74;
  }
  if (result.includes("冠军")) return 0.16;
  if (result.includes("亚军")) return 0.34;
  if (result.includes("四强")) return 0.46;
  if (result.includes("第三轮") || result.includes("32强")) return 0.72;
  return 0.58;
}

function achievementZoneLabels() {
  if (achievementState.view === "olympics") {
    return ["金牌", "银牌 / 铜牌", "历史突破"];
  }
  if (achievementState.view === "rankings") {
    return ["世界前列", "前100 / 前50", "历史突破"];
  }
  return ["冠军", "亚军 / 四强", "排名突破"];
}

function achievementLegendItems() {
  if (achievementState.view === "rankings") {
    return [
      { cls: "is-ws", label: "女子单打" },
      { cls: "is-ms", label: "男子单打" },
    ];
  }
  return [
    { cls: "is-ws", label: "女单" },
    { cls: "is-ms", label: "男单" },
    { cls: "is-wd", label: "女双" },
    { cls: "is-xd", label: "混双" },
  ];
}

function renderAchievementMeta() {
  const zones = document.getElementById("achievement-zones");
  const legend = document.getElementById("achievement-legend");
  if (zones) {
    zones.innerHTML = achievementZoneLabels()
      .map((label) => `<span>${label}</span>`)
      .join("");
  }
  if (legend) {
    legend.innerHTML = achievementLegendItems()
      .map(
        (item) =>
          `<span class="legend-item"><i class="legend-dot ${item.cls}"></i>${item.label}</span>`,
      )
      .join("");
  }
}

function showAchievementTooltip(item, dot, courtRect) {
  const tooltip = document.getElementById("achievement-tooltip");
  if (!tooltip) return;
  const dotRect = dot.getBoundingClientRect();
  const heading = item.event
    ? `${item.year} ${item.event}`
    : `${item.year} ${item.tournament}`;
  tooltip.innerHTML = `<strong>${heading}</strong>
    <span>${item.kind} · ${item.players}</span>
    <span>${item.result}</span>
    <small>${item.note}</small>`;
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.style.left = `${dotRect.left - courtRect.left + dotRect.width / 2}px`;
  tooltip.style.top = `${dotRect.top - courtRect.top - 10}px`;
}

function hideAchievementTooltip() {
  const tooltip = document.getElementById("achievement-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
}

function renderAchievementPlot(skipAnim = false) {
  const court = document.getElementById("achievement-court");
  const points = document.getElementById("achievement-points");
  const years = document.getElementById("achievement-years");
  if (!court || !points || !years) return;

  const items = achievementData();
  const minYear = 2004;
  const maxYear = 2024;
  const innerLeft = 0.08;
  const innerRight = 0.92;
  const innerTop = 0.12;
  const innerBottom = 0.86;
  const lanes = {};

  years.innerHTML = "";
  points.innerHTML = "";
  hideAchievementTooltip();
  renderAchievementMeta();

  [2004, 2008, 2012, 2016, 2020, 2024].forEach((year) => {
    const t = (year - minYear) / (maxYear - minYear);
    const label = document.createElement("span");
    label.className = "achievement-year";
    label.style.left = `${(innerLeft + (innerRight - innerLeft) * t) * 100}%`;
    label.textContent = year;
    years.appendChild(label);
  });

  items.forEach((item, index) => {
    const yearCount = lanes[item.year] || 0;
    lanes[item.year] = yearCount + 1;
    const t = (item.year - minYear) / (maxYear - minYear);
    const x = innerLeft + (innerRight - innerLeft) * t;
    const baseY = achievementLevelValue(item.result);
    const offsetY = yearCount * 0.048;
    const jitterX = ((index % 3) - 1) * 0.012;
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `achievement-ball ${achievementKindClass(item.kind)}`;
    dot.style.left = `${(x + jitterX) * 100}%`;
    dot.style.top = `${(innerTop + (innerBottom - innerTop) * (baseY + offsetY)) * 100}%`;
    dot.setAttribute(
      "aria-label",
      `${item.year} ${item.event || item.tournament} ${item.players} ${item.result}`,
    );
    dot.addEventListener("mouseenter", () =>
      showAchievementTooltip(item, dot, court.getBoundingClientRect()),
    );
    dot.addEventListener("mousemove", () =>
      showAchievementTooltip(item, dot, court.getBoundingClientRect()),
    );
    dot.addEventListener("mouseleave", hideAchievementTooltip);
    dot.addEventListener("focus", () =>
      showAchievementTooltip(item, dot, court.getBoundingClientRect()),
    );
    dot.addEventListener("blur", hideAchievementTooltip);
    points.appendChild(dot);
  });

  achievementState.rendered = true;
  if (!skipAnim) {
    setPageNavReady("achievement-page", false);
    gsap.fromTo(
      ".achievement-ball",
      { scale: 0.2, opacity: 0, y: 12 },
      {
        scale: 1,
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.05,
        ease: "back.out(1.6)",
        onComplete: () => setPageNavReady("achievement-page", true),
      },
    );
  } else {
    setPageNavReady("achievement-page", true);
  }
}

function setAchievementView(view) {
  achievementState.view = view;
  document.querySelectorAll(".achievement-view-btn").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
  });
  renderAchievementPlot(true);
}

/* ============================================================
   7) 第四幕：选择出生地 → 全国网球场地热力图
   改用 ECharts 稳定渲染地图与点击交互；视觉上继续沿用当前页面的纸张底色、
   墨线描边和暖色热力渐变。
   ============================================================ */
const mapState = {
  active: false,
  selected: null,
  reveal: 0,
  features: [],
  minN: 0,
  maxN: 1,
  ranking: [],
  chart: null,
  registered: false,
};

const journeyState = {
  active: false,
  currentNodeId: "",
  history: [],
};

const industryState = {
  active: false,
  currentKey: "market",
  canvasReady: false,
  animating: false,
  _points: null,
  _metric: null,
};

let cIndustry, ctxIndustry, rIndustry;
let industryW = 0,
  industryH = 0;

const JOURNEY_APPAREL_BASE_COUNT = 100;
const JOURNEY_APPAREL_GROWTH_COUNT = 216;
const JOURNEY_DESK_GYM_BOOK_FRAMES = Array.from(
  { length: 8 },
  (_, i) => `desk_gym/desk_book/image (${i + 1}).png`,
);
const JOURNEY_DESK_GYM_A_FRAMES = [
  "desk_gym/desk_A/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 22_25_08 (1).png"),
  "desk_gym/desk_A/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 22_25_08 (2).png"),
  "desk_gym/desk_A/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 22_25_10 (3).png"),
  "desk_gym/desk_A/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 22_25_11 (4).png"),
];
const JOURNEY_DESK_GYM_B_FRAMES = [
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_50 (1).png"),
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_50 (2).png"),
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_52 (3).png"),
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_53 (4).png"),
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_54 (5).png"),
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_54 (6).png"),
  "desk_gym/desk_B/" +
    encodeURIComponent("ChatGPT Image 2026年6月4日 21_51_55 (7).png"),
];
const journeyDeskGymState = {
  frameTimer: null,
  typingTimer: null,
  token: 0,
  locked: false,
};

const JOURNEY_PRIMARY_TENNIS_IMAGE =
  "primary_teinns/primary_tennis_left_bg.png";
const JOURNEY_FAMILY_ABOARD_IMAGE = "family_aboard/family_aboard_right_bg.png";
const JOURNEY_DINNER_BIZ_IMAGE =
  "dinner_binessman/dinner_binessman_left_bg.png";

const ENDING_FLIP_DEFAULT_CLOSE = "ending/01close_champion.png";
const ENDING_FLIP_DEFAULT_OPEN = "ending/01open_champion.png";

const journeyEndingFlipState = { opened: false };
function clearJourneyEndingFlipState() { journeyEndingFlipState.opened = false; }

const journeyPrimaryTennisState = {
  typingTimer: null,
  locked: false,
};

function clearJourneyPrimaryTennisState() {
  journeyPrimaryTennisState.locked = false;
  if (journeyPrimaryTennisState.typingTimer) {
    clearTimeout(journeyPrimaryTennisState.typingTimer);
    journeyPrimaryTennisState.typingTimer = null;
  }
}

const journeyFamilyAboardState = {
  typingTimer: null,
  locked: false,
};

function clearJourneyFamilyAboardState() {
  journeyFamilyAboardState.locked = false;
  if (journeyFamilyAboardState.typingTimer) {
    clearTimeout(journeyFamilyAboardState.typingTimer);
    journeyFamilyAboardState.typingTimer = null;
  }
}

const journeyDinnerBizState = {
  typingTimer: null,
  locked: false,
};

function clearJourneyDinnerBizState() {
  journeyDinnerBizState.locked = false;
  if (journeyDinnerBizState.typingTimer) {
    clearTimeout(journeyDinnerBizState.typingTimer);
    journeyDinnerBizState.typingTimer = null;
  }
}

function clearJourneyDeskGymState() {
  journeyDeskGymState.token += 1;
  journeyDeskGymState.locked = false;
  if (journeyDeskGymState.frameTimer) {
    clearInterval(journeyDeskGymState.frameTimer);
    journeyDeskGymState.frameTimer = null;
  }
  if (journeyDeskGymState.typingTimer) {
    clearTimeout(journeyDeskGymState.typingTimer);
    journeyDeskGymState.typingTimer = null;
  }
}

function preloadJourneyDeskGymFrames(frames) {
  return Promise.all(
    frames.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = resolve;
          img.src = src;
        }),
    ),
  );
}

function runJourneyDeskGymFrames(imageEl, frames, interval, done) {
  if (!imageEl || !frames.length) {
    done?.();
    return;
  }
  if (journeyDeskGymState.frameTimer) {
    clearInterval(journeyDeskGymState.frameTimer);
  }
  let index = 0;
  imageEl.src = frames[0];
  journeyDeskGymState.frameTimer = setInterval(() => {
    index += 1;
    imageEl.src = frames[index];
    if (index >= frames.length - 1) {
      clearInterval(journeyDeskGymState.frameTimer);
      journeyDeskGymState.frameTimer = null;
      done?.();
    }
  }, interval);
}

function journeyTeeSvg(className = "") {
  return `
    <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M24 10h16l8 7 8 3-5 12-8-5v27H21V27l-8 5-5-12 8-3 8-7z" />
      <path d="M27 10c1.9 3.3 4.4 5 5 5s3.1-1.7 5-5" fill="none" />
    </svg>
  `;
}

function buildJourneyApparelVisual(node) {
  const data = node.apparelData || {};
  const baseCount = Number.isFinite(data.baseCount)
    ? data.baseCount
    : JOURNEY_APPAREL_BASE_COUNT;
  const growthCount = Number.isFinite(data.growthCount)
    ? data.growthCount
    : JOURNEY_APPAREL_GROWTH_COUNT;
  const nextLabel = data.nextLabel || "继续";
  const nextId = data.next || "ending-campus";
  const imageSrc = data.imageSrc || "photos/t_shirt.png";
  const title = data.title || "网球服成交额同比增长";
  const valueLabel = data.valueLabel || "+216%";
  const insight = data.insight || "网球走出训练场，也走进了城市日常穿搭。";
  const accent = data.accent || "#78c88a";
  const accentStroke = data.accentStroke || "rgba(91, 156, 102, 0.8)";
  const glow = data.glow || "rgba(120, 200, 138, 0.05)";
  const baseIcons = Array.from(
    { length: baseCount },
    () => `
    <span class="apparel-icon apparel-icon--base">${journeyTeeSvg("apparel-icon-svg")}</span>
  `,
  ).join("");
  const growthIcons = Array.from(
    { length: growthCount },
    () => `
    <span class="apparel-icon apparel-icon--growth">${journeyTeeSvg("apparel-icon-svg")}</span>
  `,
  ).join("");

  return `
    <div class="journey-visual-panel apparel-growth-panel" style="--apparel-accent: ${accent}; --apparel-accent-stroke: ${accentStroke}; --apparel-glow: ${glow};">
      <div class="apparel-growth-left">
        <div class="apparel-shirt-stage" aria-hidden="true">
          <div class="apparel-shirt-shadow"></div>
          <img class="apparel-shirt-hero" src="${imageSrc}" alt="" />
        </div>

        <div class="apparel-growth-copy">
          <p class="apparel-growth-stat">${title} <strong>${valueLabel}</strong></p>
          <p class="apparel-growth-insight">${insight}</p>
        </div>
      </div>

      <div class="apparel-growth-right">
        <div class="apparel-icon-grid" aria-label="${title} ${valueLabel}">
          ${baseIcons}${growthIcons}
        </div>
      </div>
    </div>

    <div class="journey-visual-actions">
      <button class="journey-action-btn" type="button" data-next="${nextId}">${nextLabel}</button>
    </div>
  `;
}

function buildJourneyDeskGymVisual(node) {
  const data = node.deskGymData || {};
  const narrative = (data.narrative || [])
    .map((text) => `<p>${text}</p>`)
    .join("");
  const choices = (data.choices || [])
    .map(
      (choice) => `
    <div class="choice" data-action="desk-gym-choice" data-choice="${choice.key}" data-next="${choice.next}">
      <div class="choice-box">
        <div class="opt"><span class="tag">${choice.key}.</span>${choice.label}</div>
        <div class="hint">
          <span class="quote">${choice.quote || ""}</span>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  return `
    <svg class="squiggle-defs" aria-hidden="true">
      <filter id="hand-drawn">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" seed="7" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <main class="stage">
      <section class="illus">
        <img id="book-anim" src="desk_gym/desk_book/image (1).png" alt="堆满课本的书桌、成绩单与窗外的网球场" />
      </section>
      <section class="content">
        <div class="narrative">${narrative}</div>
        <div class="question">${data.question || "你会怎么选择？"}</div>
        <div class="choices">${choices}</div>
      </section>
    </main>
  `;
}

function buildTrainingBillsModal() {
  return `
    <section class="training-bills-modal" aria-hidden="true">
      <button class="training-bills-backdrop" type="button" data-action="close-training-bills" aria-label="Close bill modal"></button>
      <div class="training-bills-dialog" role="dialog" aria-modal="true" aria-label="Training cost bills">
        <button class="training-bills-close" type="button" data-action="close-training-bills" aria-label="Close">x</button>
        <div class="training-bills-grid">
          <div class="training-bill-figure training-bill-figure--family">
            ${buildFamilyReceiptSvg()}
          </div>
          <div class="training-bill-figure training-bill-figure--camp">
            ${buildCampReceiptSvg()}
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildFamilyReceiptSvg() {
  const BILL_ITEMS = [
    { label: "私教课", amount: "¥300—1000 / 小时" },
    { label: "场地费", amount: "¥100—600 / 小时" },
    { label: "团课", amount: "¥100—150 / 人 / 节" },
    { label: "专业球拍", amount: "¥1000—2000 / 支" },
    { label: "月卡场地 / 会员", amount: "≈ ¥2000—2800 / 月" },
    { label: "年卡场地 / 会员", amount: "≈ ¥18000—22000 / 年" },
    { label: "全训型网校", amount: "≈ ¥19.7万—22.7万 / 年" },
    { label: "国内两站赛事", amount: "≈ ¥6000—7000" },
    { label: "出国参赛", amount: "机票、住宿等可达数万元" },
  ];

  const N = BILL_ITEMS.length;
  const ROW_H  = 28;
  const HEAD_Y = 210;
  const BODY_H = N * ROW_H;
  const GAP    = 32;
  const FOOT_H = 60;
  const PAD_BOT = 56;

  const VIEW_W = 340;
  const VIEW_H = Math.ceil(HEAD_Y + BODY_H + GAP + FOOT_H + PAD_BOT);

  // Camp bill shape mirrored, X-scaled 6% wider for Chinese text
  const outerPath = "M 287 136 C 231 110 160 90 103 102 C 82 106 69 142 65 204 C 57 310 52 446 44 510 C 36 564 23 602 7 630 L 173 640 C 203 602 222 550 232 480 C 242 404 244 334 252 270 C 259 214 270 168 287 136 Z";
  const clipPath  = "M 242 168 C 200 148 152 134 113 142 C 102 146 96 162 92 190 C 87 276 82 382 74 462 C 69 514 60 556 47 588 L 166 600 C 188 572 203 532 210 476 C 219 410 222 342 230 280 C 235 232 239 196 242 168 Z";

  const AMT_X = 226;
  const billRows = BILL_ITEMS.map((item, i) => {
    const y = HEAD_Y + i * ROW_H;
    const amountClass = item.amount.length > 12 ? " bill-amount--small" : "";
    return (
      '<circle class="bill-bullet" cx="57" cy="' + (y - 2) + '" r="2.2" />' +
      '<text class="bill-row-label" x="63" y="' + (y + 1) + '">' + item.label + '</text>' +
      '<text class="bill-amount' + amountClass + '" x="' + AMT_X + '" y="' + (y + 1) + '" text-anchor="end">' + item.amount + '</text>'
    );
  }).join("");

  const t0    = HEAD_Y + BODY_H + GAP;
  const t1    = t0 + 14;
  const tText = t1 + 16;

  return (
    '<svg class="training-bill-svg training-bill-svg--family" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" aria-label="Family investment bill" role="img">' +
      '<defs>' +
        '<radialGradient id="familyPaperGlow" cx="42%" cy="32%" r="82%">' +
          '<stop offset="0%" stop-color="#fffdf7" />' +
          '<stop offset="100%" stop-color="#f2ebd8" />' +
        '</radialGradient>' +
        '<clipPath id="familyScrollClip">' +
          '<path d="' + clipPath + '" />' +
        '</clipPath>' +
      '</defs>' +

      '<path class="bill-shadow bill-shadow-soft" d="' + outerPath + '" transform="translate(7 8)" />' +
      '<path class="bill-paper" d="' + outerPath + '" fill="url(#familyPaperGlow)" />' +
      '<path class="bill-content-guide" d="' + clipPath + '" />' +

      '<g clip-path="url(#familyScrollClip)">' +
        '<text class="bill-title" x="63" y="186">FAMILY</text>' +
        '<text class="bill-subtitle" x="67" y="208">家庭训练投入</text>' +
        '<text class="bill-mini-note" x="67" y="224">2026 cost sketch</text>' +

        '<text class="bill-column-label" x="63" y="178">项目</text>' +
        '<text class="bill-column-label" x="' + AMT_X + '" y="178" text-anchor="end">参考金额</text>' +
        '<path class="bill-line" d="M61 186 C99 184, 145 185, 228 188" />' +

        billRows +

        '<path class="bill-total-line" d="M61 ' + t0 + ' C99 ' + (t0-1) + ', 145 ' + (t0+1) + ', 228 ' + t0 + '" />' +
        '<path class="bill-total-line" d="M55 ' + t1 + ' C93 ' + (t1-2) + ', 145 ' + t1 + ', 232 ' + (t1+1) + '" />' +
        '<text class="bill-total" x="63" y="' + tText + '">TOTAL</text>' +
        '<text class="bill-total-note" x="115" y="' + tText + '">越打越长的账单</text>' +
      '</g>' +

      '<path class="bill-outline-top" d="' + outerPath + '" />' +
    '</svg>'
  );
}

function buildCampReceiptSvg() {
  const outerPath =
    "M50 68 C103 55 169 45 223 51 C243 53 255 71 259 102 C266 155 271 223 279 255 C286 282 298 301 313 315 L157 320 C129 301 111 275 102 240 C92 202 90 167 83 135 C76 107 66 84 50 68 Z";
  const clipPath =
    "M92 84 C132 74 177 67 214 71 C224 73 230 81 233 95 C238 138 243 191 250 231 C255 257 264 278 276 294 L164 300 C143 286 129 266 122 238 C114 205 111 171 104 140 C99 116 95 98 92 84 Z";

  return `
    <svg class="training-bill-svg training-bill-svg--camp" viewBox="0 0 320 340" aria-label="National camp bill" role="img">
      <defs>
        <radialGradient id="campPaperGlow" cx="48%" cy="34%" r="78%">
          <stop offset="0%" stop-color="#fffdf8" />
          <stop offset="100%" stop-color="#f5eee2" />
        </radialGradient>
        <clipPath id="campScrollClip">
          <path d="${clipPath}" />
        </clipPath>
      </defs>

      <path class="bill-shadow bill-shadow-soft" d="${outerPath}" transform="translate(8 8)" />
      <path class="bill-paper" d="${outerPath}" fill="url(#campPaperGlow)" />
      <path class="bill-content-guide" d="${clipPath}" />

      <g clip-path="url(#campScrollClip)">
        <text class="bill-title bill-title--small" x="108" y="94">NATIONAL CAMP</text>
        <text class="bill-subtitle" x="109" y="116">expense sketch</text>

        <circle class="bill-chart" cx="170" cy="172" r="42" />
        <path class="bill-chart" d="M170 172 L170 130 A42 42 0 0 1 210 154 Z" />
        <text class="bill-note" x="94" y="147">system support</text>
        <path class="bill-arrow" d="M126 153 C139 149 148 142 159 132" />
        <text class="bill-note" x="223" y="142">family add-on</text>
        <text class="bill-note-em" x="238" y="161">~ 5%</text>
        <path class="bill-arrow" d="M214 155 C224 147 231 142 240 139" />

        <path class="bill-funnel" d="M110 244 C145 238 179 238 238 244 C232 269 219 291 201 312 C190 325 181 340 177 357 C171 338 160 324 147 309 C124 284 111 263 110 244 Z" transform="translate(0 -20)" />
        <path class="bill-funnel-mark" d="M152 282 C165 286 177 286 189 281" />
        <path class="bill-funnel-mark" d="M158 298 C168 301 176 301 184 297" />

        <text class="bill-note" x="224" y="245">50: shortlist</text>
        <path class="bill-arrow" d="M208 247 C196 251 187 257 179 268" />
        <text class="bill-note" x="201" y="302">20: final spots</text>
        <path class="bill-arrow" d="M197 299 C187 295 178 292 170 286" />

        <path class="bill-total-line" d="M96 309 C141 315 194 315 254 305" />
        <text class="bill-total" x="92" y="334">shared cost, tighter gate</text>
      </g>

      <path class="bill-outline-top" d="${outerPath}" />
    </svg>
  `;
}

function revealJourneyDeskGymChoices() {
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");
  if (questionEl) {
    questionEl.style.opacity = "1";
  }
  if (choicesEl) {
    choicesEl.style.opacity = "1";
    choicesEl.style.pointerEvents = "auto";
  }
}

function typeJourneyDeskGymNarrative() {
  const paras = Array.from(document.querySelectorAll(".narrative p"));
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");

  if (!paras.length || !questionEl || !choicesEl) return;

  const texts = paras.map((p) => {
    const t = p.textContent;
    p.textContent = "";
    return t;
  });

  let paraIndex = 0;
  let charIndex = 0;

  function typeNext() {
    if (journeyDeskGymState.locked) return;
    if (paraIndex >= paras.length) {
      questionEl.style.opacity = "1";
      choicesEl.style.opacity = "1";
      choicesEl.style.pointerEvents = "auto";
      return;
    }

    const p = paras[paraIndex];
    p.style.visibility = "visible";

    if (charIndex < texts[paraIndex].length) {
      p.textContent += texts[paraIndex][charIndex];
      charIndex += 1;
      journeyDeskGymState.typingTimer = setTimeout(typeNext, 80);
    } else {
      paraIndex += 1;
      charIndex = 0;
      journeyDeskGymState.typingTimer = setTimeout(typeNext, 200);
    }
  }

  typeNext();
}

function activateJourneyDeskGym(node) {
  const imageEl = document.getElementById("book-anim");
  if (!imageEl) return;

  // Reset: remove active/fade-out states (matching page-load fresh state)
  document
    .querySelectorAll(".choice")
    .forEach((el) => el.classList.remove("active"));
  document.querySelector(".narrative")?.classList.remove("fade-out");
  document.querySelector(".question")?.classList.remove("fade-out");
  document.querySelector(".choices")?.classList.remove("fade-out");
  // Reset question/choices to initial hidden state (CSS handles opacity:0)
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");
  if (questionEl) {
    questionEl.style.opacity = "";
  }
  if (choicesEl) {
    choicesEl.style.opacity = "";
    choicesEl.style.pointerEvents = "";
  }

  // Match original: preload book frames, then play; also preload choice frames in background
  preloadJourneyDeskGymFrames(JOURNEY_DESK_GYM_BOOK_FRAMES).then(() => {
    runJourneyDeskGymFrames(imageEl, JOURNEY_DESK_GYM_BOOK_FRAMES, 500);
  });
  preloadJourneyDeskGymFrames([
    ...JOURNEY_DESK_GYM_A_FRAMES,
    ...JOURNEY_DESK_GYM_B_FRAMES,
  ]);

  // Match original: typewriter starts immediately
  typeJourneyDeskGymNarrative();
}

function playJourneyDeskGymChoice(nextId, choiceKey) {
  if (journeyDeskGymState.locked) return;
  const imageEl = document.getElementById("book-anim");
  const frames =
    choiceKey === "A" ? JOURNEY_DESK_GYM_A_FRAMES : JOURNEY_DESK_GYM_B_FRAMES;
  if (!imageEl) {
    if (nextId) goToJourneyNode(nextId);
    return;
  }

  journeyDeskGymState.locked = true;

  // Match original: fadeOutContent()
  const fadeEls = [
    document.querySelector(".narrative"),
    document.querySelector(".question"),
    document.querySelector(".choices"),
  ];
  fadeEls.forEach((el) => el?.classList.add("fade-out"));

  // Match original: toggle active class on choices
  document.querySelectorAll(".choice").forEach((el) => {
    el.classList.toggle("active", el.dataset.choice === choiceKey);
  });

  // Clear ongoing timers
  if (journeyDeskGymState.typingTimer) {
    clearTimeout(journeyDeskGymState.typingTimer);
    journeyDeskGymState.typingTimer = null;
  }
  if (journeyDeskGymState.frameTimer) {
    clearInterval(journeyDeskGymState.frameTimer);
    journeyDeskGymState.frameTimer = null;
  }

  // Match original: setTimeout(() => { preload(frames).then(() => runFrames(frames, 500)); }, 220);
  // Only addition: navigate to next journey node after animation completes
  window.setTimeout(() => {
    preloadJourneyDeskGymFrames(frames).then(() => {
      runJourneyDeskGymFrames(imageEl, frames, 500, () => {
        window.setTimeout(() => {
          if (nextId) goToJourneyNode(nextId);
        }, 2000);
      });
    });
  }, 220);
}

function buildJourneyPrimaryTennisVisual(node) {
  const data = node.primaryTennisData || {};
  const narrative = (data.narrative || [])
    .map((text) => `<p>${text}</p>`)
    .join("");
  const choices = (data.choices || [])
    .map(
      (choice) => `
    <div class="choice" data-action="primary-tennis-choice" data-choice="${choice.key}" data-next="${choice.next}">
      <div class="choice-box">
        <div class="opt"><span class="tag">${choice.key}.</span>${choice.label}</div>
        <div class="hint">
          <span class="quote">${choice.quote || ""}</span>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  return `
    <svg class="squiggle-defs" aria-hidden="true">
      <filter id="hand-drawn">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" seed="7" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <main class="stage">
      <section class="illus">
        <button class="training-bills-trigger" type="button" data-action="open-training-bills" aria-label="Open training cost bills">
          <img src="${data.imageSrc || JOURNEY_PRIMARY_TENNIS_IMAGE}" alt="${data.imageAlt || "初中网球训练场景"}" />
          <span class="training-bills-trigger-label">Tap image for cost bills</span>
        </button>
      </section>
      <section class="content">
        <div class="narrative">${narrative}</div>
        <div class="question">${data.question || "你会怎么选择？"}</div>
        <div class="choices">${choices}</div>
      </section>
    </main>
    ${buildTrainingBillsModal()}
  `;
}

function typeJourneyPrimaryTennisNarrative() {
  const paras = Array.from(document.querySelectorAll(".narrative p"));
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");

  if (!paras.length || !questionEl || !choicesEl) return;

  const texts = paras.map((p) => {
    const t = p.textContent;
    p.textContent = "";
    return t;
  });

  let paraIndex = 0;
  let charIndex = 0;

  function typeNext() {
    if (journeyPrimaryTennisState.locked) return;
    if (paraIndex >= paras.length) {
      questionEl.style.opacity = "1";
      choicesEl.style.opacity = "1";
      choicesEl.style.pointerEvents = "auto";
      return;
    }

    const p = paras[paraIndex];
    p.style.visibility = "visible";

    if (charIndex < texts[paraIndex].length) {
      p.textContent += texts[paraIndex][charIndex];
      charIndex += 1;
      journeyPrimaryTennisState.typingTimer = setTimeout(typeNext, 80);
    } else {
      paraIndex += 1;
      charIndex = 0;
      journeyPrimaryTennisState.typingTimer = setTimeout(typeNext, 200);
    }
  }

  typeNext();
}

function activateJourneyPrimaryTennis() {
  // Reset
  document
    .querySelectorAll(".choice")
    .forEach((el) => el.classList.remove("active"));
  document.querySelector(".narrative")?.classList.remove("fade-out");
  document.querySelector(".question")?.classList.remove("fade-out");
  document.querySelector(".choices")?.classList.remove("fade-out");
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");
  if (questionEl) {
    questionEl.style.opacity = "";
  }
  if (choicesEl) {
    choicesEl.style.opacity = "";
    choicesEl.style.pointerEvents = "";
  }

  // Preload the static image just in case
  const img = new Image();
  img.onload = img.onerror = () => {};
  img.src = JOURNEY_PRIMARY_TENNIS_IMAGE;

  // Match original: typewriter starts immediately
  typeJourneyPrimaryTennisNarrative();
}

function playJourneyPrimaryTennisChoice(nextId, choiceKey) {
  if (journeyPrimaryTennisState.locked) return;
  journeyPrimaryTennisState.locked = true;

  // Match original: toggle active class on choice
  document.querySelectorAll(".choice").forEach((el) => {
    el.classList.remove("active");
    el.classList.toggle("active", el.dataset.choice === choiceKey);
  });

  // Clear typing timer
  if (journeyPrimaryTennisState.typingTimer) {
    clearTimeout(journeyPrimaryTennisState.typingTimer);
    journeyPrimaryTennisState.typingTimer = null;
  }

  // Fade out narrative + question + choices
  const fadeEls = [
    document.querySelector(".narrative"),
    document.querySelector(".question"),
    document.querySelector(".choices"),
  ];
  fadeEls.forEach((el) => el?.classList.add("fade-out"));

  // Navigate after a short pause
  window.setTimeout(() => {
    if (nextId) goToJourneyNode(nextId);
  }, 1500);
}

function buildJourneyFamilyAboardVisual(node) {
  const data = node.familyAboardData || {};
  const narrative = (data.narrative || [])
    .map((text) => `<p>${text}</p>`)
    .join("");
  const choices = (data.choices || [])
    .map(
      (choice) => `
    <div class="choice" data-action="family-aboard-choice" data-choice="${choice.key}" data-next="${choice.next}">
      <div class="choice-box">
        <div class="opt"><span class="tag">${choice.key}.</span>${choice.label}</div>
        <div class="hint">
          ${choice.fact ? `<span class="fact">${choice.fact}</span>` : ""}
          <span class="quote">${choice.quote || ""}</span>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  return `
    <svg class="squiggle-defs" aria-hidden="true">
      <filter id="hand-drawn">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" seed="7" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <main class="stage">
      <section class="content">
        <div class="narrative">${narrative}</div>
        <div class="question">${data.question || "你会怎么选择？"}</div>
        <div class="choices">${choices}</div>
      </section>
      <section class="illus">
        <img src="${data.imageSrc || JOURNEY_FAMILY_ABOARD_IMAGE}" alt="${data.imageAlt || "家庭投资与海外巡回"}" />
      </section>
    </main>
  `;
}

function typeJourneyFamilyAboardNarrative() {
  const paras = Array.from(document.querySelectorAll(".narrative p"));
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");

  if (!paras.length || !questionEl || !choicesEl) return;

  const texts = paras.map((p) => {
    const t = p.textContent;
    p.textContent = "";
    return t;
  });

  let paraIndex = 0;
  let charIndex = 0;

  function typeNext() {
    if (journeyFamilyAboardState.locked) return;
    if (paraIndex >= paras.length) {
      questionEl.style.opacity = "1";
      choicesEl.style.opacity = "1";
      choicesEl.style.pointerEvents = "auto";
      return;
    }

    const p = paras[paraIndex];
    p.style.visibility = "visible";

    if (charIndex < texts[paraIndex].length) {
      p.textContent += texts[paraIndex][charIndex];
      charIndex += 1;
      journeyFamilyAboardState.typingTimer = setTimeout(typeNext, 80);
    } else {
      paraIndex += 1;
      charIndex = 0;
      journeyFamilyAboardState.typingTimer = setTimeout(typeNext, 200);
    }
  }

  typeNext();
}

function activateJourneyFamilyAboard() {
  document
    .querySelectorAll(".choice")
    .forEach((el) => el.classList.remove("active"));
  document.querySelector(".narrative")?.classList.remove("fade-out");
  document.querySelector(".question")?.classList.remove("fade-out");
  document.querySelector(".choices")?.classList.remove("fade-out");
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");
  if (questionEl) {
    questionEl.style.opacity = "";
  }
  if (choicesEl) {
    choicesEl.style.opacity = "";
    choicesEl.style.pointerEvents = "";
  }

  const img = new Image();
  img.onload = img.onerror = () => {};
  img.src = JOURNEY_FAMILY_ABOARD_IMAGE;

  typeJourneyFamilyAboardNarrative();
}

function playJourneyFamilyAboardChoice(nextId, choiceKey) {
  if (journeyFamilyAboardState.locked) return;
  journeyFamilyAboardState.locked = true;

  document.querySelectorAll(".choice").forEach((el) => {
    el.classList.remove("active");
    el.classList.toggle("active", el.dataset.choice === choiceKey);
  });

  if (journeyFamilyAboardState.typingTimer) {
    clearTimeout(journeyFamilyAboardState.typingTimer);
    journeyFamilyAboardState.typingTimer = null;
  }

  const fadeEls = [
    document.querySelector(".narrative"),
    document.querySelector(".question"),
    document.querySelector(".choices"),
  ];
  fadeEls.forEach((el) => el?.classList.add("fade-out"));

  window.setTimeout(() => {
    if (nextId) goToJourneyNode(nextId);
  }, 1500);
}

function buildJourneyDinnerBizVisual(node) {
  const data = node.dinnerBizData || {};
  const narrative = (data.narrative || [])
    .map((text) => `<p>${text}</p>`)
    .join("");
  const choices = (data.choices || [])
    .map(
      (choice) => `
    <div class="choice" data-action="dinner-biz-choice" data-choice="${choice.key}" data-next="${choice.next || ""}" ${choice.action ? `data-dinner-action="${choice.action}"` : ""}>
      <div class="choice-box">
        <div class="opt"><span class="tag">${choice.key}.</span>${choice.label}</div>
        <div class="hint">
          ${choice.fact ? `<span class="fact">${choice.fact}</span>` : ""}
          <span class="quote">${choice.quote || ""}</span>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  return `
    <svg class="squiggle-defs" aria-hidden="true">
      <filter id="hand-drawn">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" seed="7" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <main class="stage">
      <section class="illus">
        <img src="${data.imageSrc || JOURNEY_DINNER_BIZ_IMAGE}" alt="${data.imageAlt || "商业晚餐邀约"}" />
      </section>
      <section class="content">
        <div class="narrative">${narrative}</div>
        <div class="question">${data.question || "你会接受这份晚餐邀约吗？"}</div>
        <div class="choices">${choices}</div>
      </section>
    </main>
  `;
}

function typeJourneyDinnerBizNarrative() {
  const paras = Array.from(document.querySelectorAll(".narrative p"));
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");

  if (!paras.length || !questionEl || !choicesEl) return;

  const texts = paras.map((p) => {
    const t = p.textContent;
    p.textContent = "";
    return t;
  });

  let paraIndex = 0;
  let charIndex = 0;

  function typeNext() {
    if (journeyDinnerBizState.locked) return;
    if (paraIndex >= paras.length) {
      questionEl.style.opacity = "1";
      choicesEl.style.opacity = "1";
      choicesEl.style.pointerEvents = "auto";
      return;
    }
    const p = paras[paraIndex];
    p.style.visibility = "visible";
    if (charIndex < texts[paraIndex].length) {
      p.textContent += texts[paraIndex][charIndex];
      charIndex += 1;
      journeyDinnerBizState.typingTimer = setTimeout(typeNext, 80);
    } else {
      paraIndex += 1;
      charIndex = 0;
      journeyDinnerBizState.typingTimer = setTimeout(typeNext, 200);
    }
  }
  typeNext();
}

function activateJourneyDinnerBiz() {
  document
    .querySelectorAll(".choice")
    .forEach((el) => el.classList.remove("active"));
  document.querySelector(".narrative")?.classList.remove("fade-out");
  document.querySelector(".question")?.classList.remove("fade-out");
  document.querySelector(".choices")?.classList.remove("fade-out");
  const questionEl = document.querySelector(".question");
  const choicesEl = document.querySelector(".choices");
  if (questionEl) {
    questionEl.style.opacity = "";
  }
  if (choicesEl) {
    choicesEl.style.opacity = "";
    choicesEl.style.pointerEvents = "";
  }
  const img = new Image();
  img.onload = img.onerror = () => {};
  img.src = JOURNEY_DINNER_BIZ_IMAGE;
  typeJourneyDinnerBizNarrative();
}

function playJourneyDinnerBizChoice(nextId, choiceKey) {
  if (journeyDinnerBizState.locked) return;
  journeyDinnerBizState.locked = true;
  document.querySelectorAll(".choice").forEach((el) => {
    el.classList.remove("active");
    el.classList.toggle("active", el.dataset.choice === choiceKey);
  });
  if (journeyDinnerBizState.typingTimer) {
    clearTimeout(journeyDinnerBizState.typingTimer);
    journeyDinnerBizState.typingTimer = null;
  }
  [
    document.querySelector(".narrative"),
    document.querySelector(".question"),
    document.querySelector(".choices"),
  ].forEach((el) => el?.classList.add("fade-out"));

  const activeEl = document.querySelector(
    `.choice[data-choice="${choiceKey}"]`,
  );
  const dinnerAction = activeEl?.dataset.dinnerAction;

  window.setTimeout(() => {
    if (dinnerAction) {
      runJourneyAction(dinnerAction);
      return;
    }
    if (nextId) goToJourneyNode(nextId);
  }, 1500);
}

/* ============================================================
   结局翻页卡片（ending-flip）：同学原版翻页动画 + 礼花
   ============================================================ */
function buildJourneyEndingFlipVisual(node) {
  const data = node.endingFlipData || {};
  const closeSrc = data.closeImage || ENDING_FLIP_DEFAULT_CLOSE;
  const openSrc = data.openImage || ENDING_FLIP_DEFAULT_OPEN;
  const title = data.title || node.title || "结局";

  return `
    <canvas id="confetti-canvas"></canvas>
    <div class="side-buttons" id="sideButtons">
      <button class="side-btn" id="btn-save">保存</button>
      <button class="side-btn" id="btn-share">分享</button>
      <button class="side-btn" id="btn-gallery">图鉴</button>
    </div>
    <div class="flip-scene" id="flipScene">
      <div class="flip-card" id="flipCard">
        <div class="flip-face face-close">
          <img src="${closeSrc}" alt="最终结局 · ${title}（合上）" draggable="false" />
        </div>
        <div class="flip-face face-open">
          <img src="${openSrc}" alt="最终结局 · ${title}（翻开）" draggable="false" />
        </div>
      </div>
      <div class="hint-arrow" id="hintArrow">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 12 C20 11.8 19.7 11.6 19.4 11.6 L7.8 11.6 L11 8.4 C11.3 8.1 11.3 7.6 11 7.3 C10.7 7 10.2 7 9.9 7.3 L5.7 11.5 C5.5 11.6 5.4 11.8 5.4 12 C5.4 12.2 5.5 12.4 5.7 12.5 L9.9 16.7 C10.2 17 10.7 17 11 16.7 C11.3 16.4 11.3 15.9 11 15.6 L7.8 12.4 L19.4 12.4 C19.7 12.4 20 12.2 20 12 Z" fill="#8b7355" />
        </svg>
        <span class="hint-label">点击翻开</span>
      </div>
    </div>
  `;
}

function launchEndingConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ["#FFD700", "#FF4136", "#0074D9", "#2ECC40", "#B10DC9", "#FF69B4", "#FF851B", "#FFFFFF"];
  const SHAPES = ["rect", "circle", "ribbon"];
  const randBetween = (a, b) => a + Math.random() * (b - a);
  const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let particles = [];
  let rafId = null;

  function createBurst(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randBetween(2, 9);
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randBetween(1, 4),
        gravity: randBetween(0.06, 0.13),
        color: randItem(COLORS), shape: randItem(SHAPES),
        w: randBetween(7, 14), h: randBetween(4, 9),
        rot: Math.random() * Math.PI * 2, rotV: randBetween(-0.06, 0.06),
        alpha: 1, decay: randBetween(0.0015, 0.004), drag: randBetween(0.985, 0.998),
      });
    }
  }

  function drawParticle(p) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
    else if (p.shape === "ribbon") { ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2, p.h / 4, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
    ctx.restore();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((p) => p.alpha > 0.02);
    for (const p of particles) {
      p.vx *= p.drag; p.vy *= p.drag; p.vy += p.gravity;
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV; p.alpha -= p.decay;
      drawParticle(p);
    }
    if (particles.length > 0) { rafId = requestAnimationFrame(tick); }
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  const W = canvas.width, H = canvas.height;
  createBurst(W / 2, H * 0.42, 200);
  setTimeout(() => createBurst(W * 0.15, H * 0.35, 100), 400);
  setTimeout(() => createBurst(W * 0.85, H * 0.35, 100), 700);
  setTimeout(() => createBurst(W * 0.3, H * 0.5, 80), 1100);
  setTimeout(() => createBurst(W * 0.7, H * 0.5, 80), 1400);
  setTimeout(() => createBurst(W / 2, H * 0.3, 120), 1800);
  setTimeout(() => createBurst(W * 0.2, H * 0.6, 70), 2300);
  setTimeout(() => createBurst(W * 0.8, H * 0.6, 70), 2600);
  tick();
}

function activateJourneyEndingFlip() {
  journeyEndingFlipState.opened = false;

  const scene = document.getElementById("flipScene");
  const sideBtns = document.getElementById("sideButtons");
  if (!scene) return;

  let openedOnce = false;

  function openCard() {
    if (journeyEndingFlipState.opened) return;
    journeyEndingFlipState.opened = true;
    scene.classList.add("opened");
    setTimeout(() => {
      launchEndingConfetti();
      if (sideBtns) sideBtns.classList.add("visible");
    }, 880);
  }

  scene.addEventListener("click", openCard);
  scene.addEventListener("touchend", (e) => { e.preventDefault(); openCard(); }, { passive: false });

  // Side buttons: 保存 = download open image, 分享 = share API, 图鉴 = go back
  document.getElementById("btn-save")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const img = scene.querySelector(".face-open img");
    if (!img) return;
    const a = document.createElement("a");
    a.href = img.src;
    a.download = img.src.split("/").pop() || "ending.png";
    a.click();
  });
  document.getElementById("btn-share")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: document.title }).catch(() => {});
    }
  });
  document.getElementById("btn-gallery")?.addEventListener("click", (e) => {
    e.stopPropagation();
    showPageInstant("photo-wall-page");
  });
}

function activateJourneyVisual(node) {
  gsap.killTweensOf(".apparel-shirt-hero");
  gsap.killTweensOf(".apparel-shirt-shadow");
  gsap.killTweensOf(".apparel-icon");
  clearJourneyDeskGymState();
  clearJourneyPrimaryTennisState();
  clearJourneyFamilyAboardState();
  clearJourneyDinnerBizState();
  clearJourneyEndingFlipState();

  if (node.visualType === "desk-gym") {
    activateJourneyDeskGym(node);
    return;
  }
  if (node.visualType === "primary-tennis") {
    activateJourneyPrimaryTennis();
    return;
  }
  if (node.visualType === "family-aboard") {
    activateJourneyFamilyAboard();
    return;
  }
  if (node.visualType === "dinner-biz") {
    activateJourneyDinnerBiz();
    return;
  }
  if (node.visualType === "ending-flip") {
    activateJourneyEndingFlip();
    return;
  }
  if (node.visualType !== "apparel-growth") return;

  gsap.to(".apparel-shirt-hero", {
    rotation: -2.2,
    duration: 2.1,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    transformOrigin: "50% 8%",
  });

  gsap.to(".apparel-shirt-shadow", {
    scaleX: 0.9,
    opacity: 0.14,
    duration: 2.1,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });

  gsap.fromTo(
    ".apparel-growth-copy > *",
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.38, stagger: 0.08, ease: "power2.out" },
  );

  gsap.fromTo(
    ".apparel-icon",
    { opacity: 0, scale: 0.2 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.12,
      stagger: { each: 0.008, from: "start" },
      ease: "power2.out",
      transformOrigin: "50% 50%",
    },
  );
}

const JOURNEY_SEMANTIC = {
  scene: { label: "情景", className: "is-scene" },
  choice: { label: "选择", className: "is-choice" },
  visual: { label: "可视化界面", className: "is-visual" },
  ending: { label: "结局身份", className: "is-ending" },
};

function selectedProvinceName() {
  return mapState.selected ? displayRegionName(mapState.selected) : "你的家乡";
}

function selectedGenderLabel() {
  return ratioState.playerGender === "girl" ? "女孩" : "男孩";
}

function journeyGraph() {
  const province = selectedProvinceName();
  const gender = selectedGenderLabel();
  return {
    root: {
      code: "07-01",
      pageName: "未来起点",
      kicker: "Future Route",
      title: "成绩开始波动，球场和课本都在拉扯你。",
      body: `${province} 的网球资源已经在你面前铺开，但对一个从小练球的${gender}来说，真正困难的决定才刚刚开始。`,
      visualType: "desk-gym",
      deskGymData: {
        question: "你会怎么选择？",
        narrative: [
          "高年级课程的难度不断加大，",
          "可网球几乎挤占了你所有的课余时间。",
          "看着不断下滑的成绩，",
          "你心里有些着急。",
          "你不是没想过 all in 网球，",
          "可这条路实在少有人走。",
          "你身边也没有谁真的靠网球吃饭。",
        ],
        choices: [
          {
            key: "A",
            label: "继续兴趣为主",
            desc: "先把学业稳住，离开职业赛道，把网球留在生活里。",
            quote: "“这条路风险太大了，还是把它当成兴趣慢慢培养吧。”",
            next: "academic-future",
          },
          {
            key: "B",
            label: "进入系统训练",
            desc: "赌一把竞技成长，看看自己能不能把天赋打出来。",
            quote: "“就算这条路很辛苦，我还是想再认真试一次。”",
            next: "training-choice",
          },
        ],
      },
      options: [
        {
          label: "A 先把学业稳住",
          desc: "离开职业赛道，把网球留在生活里，进入兴趣线。",
          next: "academic-future",
        },
        {
          label: "B 继续系统训练",
          desc: "赌一把竞技成长，看看自己能不能把天赋打出来。",
          next: "training-choice",
        },
      ],
    },
    "academic-future": {
      code: "07-02",
      pageName: "兴趣线",
      kicker: "Interest Line",
      title: "你决定暂时不把网球当作唯一答案。",
      body: "训练强度降了下来，但球拍没有真正离开你。它会变成社交、陪伴，或者只是青春里偶尔回头的一束光。",
      options: [
        {
          label: "加入校队 / 球友社群",
          desc: "你还留在场上，只是从竞争转向连接。",
          next: "apparel-growth",
        },
        {
          label: "偶尔打一打",
          desc: "运动不再是任务，而是你和家人、朋友共享的节奏。",
          next: "ending-casual",
        },
        {
          label: "彻底停下",
          desc: "球拍被收进角落，但那段训练过的身体记忆不会消失。",
          next: "ending-memory",
        },
      ],
    },
    "training-choice": {
      code: "07-03",
      pageName: "训练线",
      kicker: "Training Line",
      title: "你有一点天赋，也愿意再往前走一步。",
      body: "接下来，问题不再只是”喜不喜欢”，而是”要不要为这条路继续投入时间、身体和家庭成本”。",
      kind: "visual",
      visualType: "primary-tennis",
      primaryTennisData: {
        question: "你会怎么选择？",
        narrative: [
          "初中的你，在日复一日的训练中，",
          "网球水平突飞猛进，展现出不凡天赋。",
          "小小的你",
          "第一次面临发展道路的选择……",
        ],
        imageSrc: "primary_teinns/primary_tennis_left_bg.png",
        imageAlt: "初中网球训练场景",
        choices: [
          {
            key: "A",
            label: "去全国青少年选材训练营",
            quote:
              "”听说那是中国网球协会的后备人才集训，有专业团队，而且可以减小开销，可竞争也太激烈了，我能行吗？”",
            next: "camp-result",
          },
          {
            key: "B",
            label: "让家里继续投资我",
            quote:
              "”可以在家人支持下系统训练、参加比赛，路线自由点，但花销真的会很大，压力好重……”",
            next: "family-invest",
          },
        ],
      },
    },
    "camp-result": {
      code: "07-04",
      pageName: "选材营结果",
      kicker: "Camp Result",
      title: "选材营结束，名单还没公布，你和家里人都在等一个结果。",
      body: "真实流程里，这里会随机决定你是否入选。为了方便调试，我先保留了两个小按钮，你可以直接强制进入“入选”或“落选”分支。",
      kind: "visual",
      options: [
        {
          label: "查看结果",
          desc: "按 0.5 / 0.5 的概率，随机跳转到入选或落选分支。",
          action: "camp-random",
          kind: "visual",
        },
      ],
      debugActions: [
        { label: "调试：入选", action: "camp-selected" },
        { label: "调试：落选", action: "camp-rejected" },
      ],
    },
    "camp-crossroad": {
      code: "07-05",
      pageName: "落选分岔",
      kicker: "Crossroad",
      title: "问题来了：你是继续拼竞技，还是让网球成为另一种教育机会？",
      body: "落选没有让这条路立刻结束。真正的选择是，你要不要继续押注竞技，还是把网球转成家庭投资路线里的另一种成长机会。",
      kind: "choice",
      options: [
        {
          label: "A 继续拼竞技",
          desc: "继续走竞技线，看看国内外还有没有更适合你的出口。",
          next: "camp-competition",
        },
        {
          label: "B 转家庭投资",
          desc: "让网球变成另一种教育机会，接入家庭投资路线。",
          next: "family-invest",
        },
      ],
    },
    "camp-competition": {
      code: "07-05A",
      pageName: "竞技去向",
      kicker: "Competition",
      title: "海内外选择？",
      body: "竞技这条路还没关上。接下来，你是转向国内大学高水平运动队，还是走海外大学路径？",
      kind: "scene",
      options: [
        {
          label: "国内大学高水平运动队",
          desc: "把训练和比赛经验转换成更稳的升学机会。",
          next: "ending-domestic-university",
        },
        {
          label: "海外大学路径",
          desc: "把网球变成你通往海外教育系统的门票。",
          next: "ending-overseas-university",
        },
      ],
    },
    "injury-choice": {
      code: "07-06",
      pageName: "伤病抉择",
      kicker: "Body Check",
      title:
        "幸运入选，训练结束后，你不幸跟腱断裂。医生建议你停训三个月，教练说下个月就是关键比赛。妈妈把冰袋放到你手边，问：要不要休息？",
      body: "这一次不是技术选择，而是你要怎么和身体谈判。继续冲，还是先保住自己？",
      kind: "scene",
      options: [
        {
          label: "退役",
          desc: "进入体育频道，用另一种方式继续留在比赛里。",
          next: "ending-commentator",
        },
        {
          label: "暂停训练康复几个月，保住身体",
          desc: "错过比赛，但继续训练，把身体慢慢养回来。",
          next: "ending-domestic-player",
        },
        {
          label: "咬牙继续",
          desc: "赢得比赛，但伤病从此留在身体里。",
          next: "ending-champion",
        },
      ],
    },
    "family-invest": {
      code: "07-07",
      pageName: "家庭投资",
      kicker: "Investment",
      title: "家里决定继续供你打下去。",
      body: "这条路更像长线押注。留在国内打比赛，或者直接去海外巡回，都会把你推向完全不同的现实。",
      kind: "visual",
      visualType: "family-aboard",
      familyAboardData: {
        question: "你会怎么选择？",
        narrative: [
          "体制内的道路竞争太过激烈，",
          "你选择让家庭投资自己的网球之路。",
          "你的排名开始上涨，",
          "教练也建议你去接触更高水平的国际比赛。",
          "留在国内，你熟悉环境，成本相对可控，",
          "也能继续靠排名和比赛积累机会；",
          "走向海外，你可能看见更大的赛场，",
          "但每一次出发都像是在把未来往更远处押。",
        ],
        imageSrc: "family_aboard/family_aboard_right_bg.png",
        imageAlt: "家庭投资与海外巡回",
        choices: [
          {
            key: "A",
            label: "留在国内参赛",
            fact: "中国正在拥有越来越多国际职业赛事。",
            quote: '"先在家门口把球打出来。"',
            next: "ending-coach",
          },
          {
            key: "B",
            label: "开始海外巡回",
            fact: "世界排名，需要一场全球巡回。",
            quote: '"我还是想去更高水平的赛场看看。"',
            next: "overseas-tour",
          },
        ],
      },
    },
    "overseas-tour": {
      code: "07-08",
      pageName: "海外巡回",
      kicker: "Overseas Tour",
      title: "海外巡回让你第一次看见网球之外的商业世界。",
      body: "比赛结束后的晚上，训练还是商业机会，你要怎么选？",
      kind: "visual",
      visualType: "dinner-biz",
      dinnerBizData: {
        question: "你会接受这份晚餐邀约吗？",
        narrative: [
          "你在巡回赛里开始被更多人看见。",
          "比赛结束后的晚上，你打算归队训练，",
          "这时一家网球用品总裁邀请你共进晚餐。",
          "职业网球不仅是比赛，也是商业、流量与品牌价值。",
          "一边是已经排好的训练，",
          "一边是可能改变职业道路的商业机会。",
        ],
        imageSrc: "dinner_binessman/dinner_binessman_left_bg.png",
        imageAlt: "商业晚餐邀约",
        choices: [
          {
            key: "A",
            label: "接受邀请",
            fact: "奖金、代言、曝光度…… 你开始真正进入职业体育商业体系。",
            quote: "”也许网球之外，我还能拥有更大的影响力。”",
            action: "open-industry",
          },
          {
            key: "B",
            label: "专注比赛与训练",
            fact: "你把更多时间留给球场与巡回赛。",
            quote: "”我还是想先把球打好。”",
            next: "ending-champion",
          },
        ],
      },
    },
    "apparel-growth": {
      code: "07-08",
      pageName: "\u5174\u8da3\u6d88\u8d39",
      kicker: "Tennis Apparel",
      title:
        "\u7f51\u7403\u670d\u9970\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f 216%",
      body: "\u4ece\u8bad\u7ec3\u573a\u5230\u57ce\u5e02\u751f\u6d3b\uff0c\u7f51\u7403\u70ed\u5ea6\u5f00\u59cb\u5728\u670d\u9970\u6d88\u8d39\u91cc\u7ee7\u7eed\u53d1\u9175\u3002",
      kind: "visual",
      visualType: "apparel-growth",
      apparelData: {
        imageSrc: "photos/t_shirt.png",
        title: "\u7f51\u7403\u670d\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f",
        valueLabel: "+216%",
        growthCount: 216,
        insight:
          "\u7f51\u7403\u8d70\u51fa\u8bad\u7ec3\u573a\uff0c\u4e5f\u8d70\u8fdb\u4e86\u57ce\u5e02\u65e5\u5e38\u7a7f\u642d\u3002",
        accent: "#78c88a",
        accentStroke: "rgba(91, 156, 102, 0.8)",
        glow: "rgba(120, 200, 138, 0.05)",
        next: "skirt-growth",
        nextLabel: "\u7ee7\u7eed\u770b\u7f51\u7403\u88d9",
      },
    },
    "skirt-growth": {
      code: "07-08-1",
      pageName: "\u5174\u8da3\u6d88\u8d39",
      kicker: "Tennis Skirt",
      title:
        "\u7f51\u7403\u88d9\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f 160%",
      body: "\u4ece\u7403\u573a\u529f\u80fd\u88c5\u5907\uff0c\u5230\u57ce\u5e02\u65e5\u5e38\u5355\u54c1\uff0c\u88d9\u88c5\u6210\u4e3a\u7f51\u7403\u98ce\u683c\u88ab\u770b\u89c1\u7684\u65b9\u5f0f\u3002",
      kind: "visual",
      visualType: "apparel-growth",
      apparelData: {
        imageSrc: "photos/skirt.png",
        title: "\u7f51\u7403\u88d9\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f",
        valueLabel: "+160%",
        growthCount: 160,
        insight:
          "\u7f51\u7403\u88d9\u628a\u8fd0\u52a8\u611f\u548c\u8f7b\u76c8\u7a7f\u642d\u8fde\u5728\u4e00\u8d77\uff0c\u70ed\u5ea6\u76f4\u63a5\u6ea2\u51fa\u7403\u573a\u4e4b\u5916\u3002",
        accent: "#f0a7bd",
        accentStroke: "rgba(193, 108, 142, 0.85)",
        glow: "rgba(240, 167, 189, 0.07)",
        next: "bag-growth",
        nextLabel: "\u7ee7\u7eed\u770b\u7f51\u7403\u5305",
      },
    },
    "bag-growth": {
      code: "07-08-2",
      pageName: "\u5174\u8da3\u6d88\u8d39",
      kicker: "Tennis Bag",
      title: "\u7f51\u7403\u5305\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f 37%",
      body: "\u8f85\u5177\u4e5f\u88ab\u5e26\u8d77\u6765\u4e86\uff0c\u7f51\u7403\u5305\u4ece\u88c5\u5907\u53d8\u6210\u4e86\u8eab\u4efd\u8bc6\u522b\u7684\u4e00\u90e8\u5206\u3002",
      kind: "visual",
      visualType: "apparel-growth",
      apparelData: {
        imageSrc: "photos/bag.png",
        title: "\u7f51\u7403\u5305\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f",
        valueLabel: "+37%",
        growthCount: 37,
        insight:
          "\u88c5\u5907\u8d8a\u9f50\uff0c\u4e5f\u610f\u5473\u7740\u8fd9\u79cd\u70ed\u7231\u6b63\u5728\u53d8\u6210\u4e00\u6574\u5957\u751f\u6d3b\u65b9\u5f0f\u3002",
        accent: "#8db7e8",
        accentStroke: "rgba(74, 123, 196, 0.82)",
        glow: "rgba(141, 183, 232, 0.07)",
        next: "shoe-growth",
        nextLabel: "\u7ee7\u7eed\u770b\u7f51\u7403\u978b",
      },
    },
    "shoe-growth": {
      code: "07-08-3",
      pageName: "\u5174\u8da3\u6d88\u8d39",
      kicker: "Tennis Shoes",
      title:
        "\u7f51\u7403\u978b\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f 34.6%",
      body: "\u5f53\u7403\u573a\u52a8\u4f5c\u88ab\u643a\u5e26\u5230\u65e5\u5e38\u901a\u52e4\uff0c\u978b\u5c65\u5c31\u6210\u4e3a\u6700\u5148\u88ab\u4eba\u611f\u77e5\u7684\u90a3\u4e2a\u5355\u54c1\u3002",
      kind: "visual",
      visualType: "apparel-growth",
      apparelData: {
        imageSrc: "photos/shoe.png",
        title: "\u7f51\u7403\u978b\u6210\u4ea4\u989d\u540c\u6bd4\u589e\u957f",
        valueLabel: "+34.6%",
        growthCount: 35,
        insight:
          "\u7403\u978b\u7684\u589e\u957f\u6ca1\u6709\u670d\u9970\u90a3\u6837\u7206\u53d1\uff0c\u4f46\u5b83\u8bf4\u660e\u8fd9\u80a1\u98ce\u6f6e\u5f00\u59cb\u5f80\u66f4\u5b8c\u6574\u7684\u88c5\u5907\u4f53\u9a8c\u5ef6\u4f38\u3002",
        accent: "#efc86f",
        accentStroke: "rgba(181, 136, 33, 0.82)",
        glow: "rgba(239, 200, 111, 0.08)",
        next: "ending-campus",
        nextLabel: "\u8d70\u8fdb\u57ce\u5e02\u7403\u53cb",
      },
    },
    "ending-campus": {
      code: "07-09",
      pageName: "城市球友",
      kicker: "Ending",
      title: "城市球友",
      body: "你加入了校队或社群，网球不再是升学压力，而是成年后仍能把你和人群连起来的语言。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-casual": {
      code: "07-10",
      pageName: "下一代陪打者",
      kicker: "Ending",
      title: "下一代陪打者",
      body: "你偶尔上场，偶尔教人发球。也许将来陪孩子练球的人，就是今天这个没有离开球场的你。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-memory": {
      code: "07-11",
      pageName: "童年记忆里的球拍",
      kicker: "Ending",
      title: "童年记忆里的球拍",
      body: "你很久不再训练，但某些动作、某些晒得发白的下午，会一直提醒你曾经认真打过一项运动。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-commentator": {
      code: "07-12",
      pageName: "解说员",
      kicker: "Ending",
      title: "解说员",
      body: "你离开了竞技线，却没有离开比赛。你开始用另一种方式看懂场上的每一个选择。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-domestic-player": {
      code: "07-13",
      pageName: "国内高水平竞技选手",
      kicker: "Ending",
      title: "国内高水平竞技选手",
      body: "你错过了那场比赛，但把身体保住了。继续训练之后，你仍然站上了国内高水平竞技的赛场。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-champion": {
      code: "07-14",
      pageName: "冠军",
      kicker: "Ending",
      title: "冠军",
      body: "你咬牙赢下了比赛，但也把病根留在了身体里。聚光灯照向奖杯时，代价没有消失。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
      endingFlipData: {
        closeImage: "ending/01close_champion.png",
        openImage: "ending/01open_champion.png",
      },
    },
    "ending-domestic-university": {
      code: "07-15",
      pageName: "好大学的学生",
      kicker: "Ending",
      title: "好大学的学生",
      body: "你把训练积累换成了国内大学高水平队的门票。网球没有把你送上职业赛场，却帮你推开了另一扇门。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-overseas-university": {
      code: "07-16",
      pageName: "海外大学生",
      kicker: "Ending",
      title: "海外大学生",
      body: "你沿着体育和教育交叉的路径，去了更远的地方。球场变成了履历的一部分，也变成你认识世界的方法。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-coach": {
      code: "07-17",
      pageName: "培训机构教练",
      kicker: "Ending",
      title: "培训机构教练",
      body: "你留在国内训练和参赛体系里，慢慢变成带别人的那个人。你知道孩子们最怕什么，也知道他们需要被怎样鼓励。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-business": {
      code: "07-18",
      pageName: "商业大亨",
      kicker: "Ending",
      title: "商业大亨",
      body: "你把网球经验延展成更宽的职业身份。赛场不是唯一舞台，但它仍旧是你最有说服力的起点。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
    "ending-pro-title": {
      code: "07-19",
      pageName: "职业赛场继续者",
      kicker: "Ending",
      title: "职业赛场继续者",
      body: "你把注意力重新拉回训练和比赛。也许不是所有人都会记住你的名字，但你认真把青春押在了球上。",
      kind: "ending",
      ending: true,
      visualType: "ending-flip",
    },
  };
}

function resetJourney() {
  journeyState.currentNodeId = "root";
  journeyState.history = ["root"];
}

function journeyNode() {
  const graph = journeyGraph();
  return graph[journeyState.currentNodeId] || graph.root;
}

function journeyDebugEntries() {
  const graph = journeyGraph();
  return Object.entries(graph)
    .map(([id, node]) => ({
      id,
      code: node.code || "07",
      pageName: node.pageName || "未来",
      title: node.title || id,
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "zh-CN"));
}

function journeySemantic(kind) {
  return JOURNEY_SEMANTIC[kind] || JOURNEY_SEMANTIC.choice;
}

function renderJourneyNode() {
  const node = journeyNode();
  const pageEl = document.getElementById("journey-page");
  const titleEl = document.getElementById("journey-title");
  const bodyEl = document.getElementById("journey-body");
  const kickerEl = document.getElementById("journey-kicker");
  const contextEl = document.getElementById("journey-context");
  const optionsEl = document.getElementById("journey-options");
  const paperEl = document.querySelector(".journey-paper");
  const actionsEl = document.querySelector(".journey-actions");
  const pageIndexEl = document.getElementById("journey-page-index");
  const pageNameEl = document.getElementById("journey-page-name");
  if (!titleEl || !bodyEl || !kickerEl || !contextEl || !optionsEl) return;
  const isFullWidthVisual =
    node.visualType === "desk-gym" ||
    node.visualType === "primary-tennis" ||
    node.visualType === "family-aboard" ||
    node.visualType === "dinner-biz" ||
    node.visualType === "ending-flip";
  optionsEl.classList.remove("is-visual-panel");
  optionsEl.classList.remove("is-desk-gym-panel");
  optionsEl.classList.remove("is-ending-flip-panel");

  const semantic = journeySemantic(
    node.kind || (node.ending ? "ending" : "choice"),
  );
  if (paperEl) {
    paperEl.classList.remove(
      "is-scene",
      "is-choice",
      "is-visual",
      "is-ending",
      "is-apparel-growth-mode",
      "is-desk-gym-mode",
      "is-family-aboard-mode",
    );
    paperEl.classList.add(semantic.className);
    paperEl.classList.toggle(
      "is-apparel-growth-mode",
      node.visualType === "apparel-growth",
    );
    paperEl.classList.toggle("is-desk-gym-mode", isFullWidthVisual);
    paperEl.classList.toggle(
      "is-family-aboard-mode",
      node.visualType === "family-aboard",
    );
  }
  if (pageEl) {
    pageEl.classList.toggle(
      "is-apparel-growth-mode",
      node.visualType === "apparel-growth",
    );
    pageEl.classList.toggle("is-desk-gym-mode", isFullWidthVisual);
    pageEl.classList.toggle(
      "is-family-aboard-mode",
      node.visualType === "family-aboard",
    );
  }
  if (actionsEl)
    actionsEl.classList.toggle(
      "is-hidden",
      node.visualType === "apparel-growth" || isFullWidthVisual,
    );

  kickerEl.textContent = node.kicker || "";
  titleEl.textContent = node.title || "";
  bodyEl.textContent = node.body || "";
  if (pageIndexEl) pageIndexEl.textContent = node.code || "07";
  if (pageNameEl) pageNameEl.textContent = node.pageName || "未来";

  const context = [
    `性别：${selectedGenderLabel()}`,
    `出生地：${selectedProvinceName()}`,
    `阶段：${node.ending ? "结局" : "选择中"}`,
  ];
  contextEl.innerHTML = context
    .map((item) => `<span class="journey-context-chip">${item}</span>`)
    .join("");

  if (node.visualType === "ending-flip") {
    optionsEl.classList.add("is-desk-gym-panel");
    optionsEl.classList.add("is-ending-flip-panel");
    optionsEl.innerHTML = buildJourneyEndingFlipVisual(node);
  } else if (node.ending) {
    optionsEl.innerHTML = `
      <article class="journey-option is-ending" aria-label="结局卡片">
        <span class="journey-option-tag is-ending">${journeySemantic("ending").label}</span>
        <strong class="journey-option-title">${node.title}</strong>
        <span class="journey-option-desc">${node.body}</span>
      </article>
    `;
  } else if (
    node.visualType === "desk-gym" ||
    node.visualType === "primary-tennis" ||
    node.visualType === "family-aboard" ||
    node.visualType === "dinner-biz"
  ) {
    optionsEl.classList.add("is-desk-gym-panel");
    if (node.visualType === "primary-tennis") {
      optionsEl.innerHTML = buildJourneyPrimaryTennisVisual(node);
    } else if (node.visualType === "family-aboard") {
      optionsEl.innerHTML = buildJourneyFamilyAboardVisual(node);
    } else if (node.visualType === "dinner-biz") {
      optionsEl.innerHTML = buildJourneyDinnerBizVisual(node);
    } else {
      optionsEl.innerHTML = buildJourneyDeskGymVisual(node);
    }
  } else if (node.visualType === "apparel-growth") {
    optionsEl.classList.add("is-visual-panel");
    optionsEl.innerHTML = buildJourneyApparelVisual(node);
  } else {
    optionsEl.innerHTML = (node.options || [])
      .map(
        (option) => `
      <button class="journey-option" type="button" ${option.next ? `data-next="${option.next}"` : ""} ${option.action ? `data-action="${option.action}"` : ""}>
        <span class="journey-option-tag ${journeySemantic(option.kind || "choice").className}">${journeySemantic(option.kind || "choice").label}</span>
        <strong class="journey-option-title">${option.label}</strong>
        <span class="journey-option-desc">${option.desc}</span>
      </button>
    `,
      )
      .join("");

    if (Array.isArray(node.debugActions) && node.debugActions.length) {
      optionsEl.innerHTML += `
        <div class="journey-debug-actions">
          ${node.debugActions
            .map(
              (item) => `
            <button class="journey-debug-btn" type="button" data-action="${item.action}">${item.label}</button>
          `,
            )
            .join("")}
        </div>
      `;
    }
  }

  activateJourneyVisual(node);
  updatePageNav();
}

function goToJourneyNode(nextId) {
  const graph = journeyGraph();
  if (!graph[nextId]) return;
  journeyState.currentNodeId = nextId;
  journeyState.history.push(nextId);
  renderJourneyNode();
  gsap.fromTo(
    ".journey-paper",
    { opacity: 0.68, y: 24 },
    { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
  );
}

function runJourneyAction(action, payload = {}) {
  if (action === "desk-gym-choice") {
    playJourneyDeskGymChoice(payload.next, payload.choice);
    return;
  }
  if (action === "open-training-bills") {
    setTrainingBillsModalOpen(true);
    return;
  }
  if (action === "close-training-bills") {
    setTrainingBillsModalOpen(false);
    return;
  }
  if (action === "primary-tennis-choice") {
    playJourneyPrimaryTennisChoice(payload.next, payload.choice);
    return;
  }
  if (action === "family-aboard-choice") {
    playJourneyFamilyAboardChoice(payload.next, payload.choice);
    return;
  }
  if (action === "dinner-biz-choice") {
    playJourneyDinnerBizChoice(payload.next, payload.choice);
    return;
  }
  if (action === "camp-random") {
    goToJourneyNode(Math.random() < 0.5 ? "injury-choice" : "camp-crossroad");
    return;
  }
  if (action === "camp-selected") {
    goToJourneyNode("injury-choice");
    return;
  }
  if (action === "camp-rejected") {
    goToJourneyNode("camp-crossroad");
    return;
  }
  if (action === "open-industry") {
    openIndustryPage();
  }
}

function setTrainingBillsModalOpen(open) {
  const modal = document.querySelector(".training-bills-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", !!open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
}

function industryMetrics() {
  return window.INDUSTRY_METRICS || {};
}

function fmtTick(v) {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v));
}

/* ============================================================
   产业可视化：手绘曲线图 (Rough.js on Canvas + Catmull-Rom 曲线拟合)

   布局：顶部轻盈导航 | 左侧手绘图表 | 右侧插图
   指标切换 = 导航按钮；发球动画 = 网球沿曲线前进
   ============================================================ */

/* ---- Catmull-Rom → 三次贝塞尔控制点 ---- */
function catmullRomToBezier(p0, p1, p2, p3) {
  return {
    cp1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    cp2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  };
}

/* ---- 在 Catmull-Rom 曲线上按 t∈[0,1] 求点 ---- */
function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/* ---- 密集采样曲线（每段 40 步），用于球的位置插值 ---- */
function sampleCurve(points, stepsPerSeg = 40) {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < stepsPerSeg; s++) {
      samples.push(catmullRomPoint(p0, p1, p2, p3, s / stepsPerSeg));
    }
  }
  samples.push({
    x: points[points.length - 1].x,
    y: points[points.length - 1].y,
  });
  return samples;
}

/* ---- 从曲线样本中按 t 取点 ---- */
function pointOnCurve(samples, t) {
  if (!samples || samples.length === 0) return { x: 0, y: 0 };
  if (t <= 0) return samples[0];
  if (t >= 1) return samples[samples.length - 1];
  const idx = Math.floor(t * (samples.length - 1));
  return samples[Math.min(samples.length - 1, idx)];
}

/* ---- 生成 Catmull-Rom 曲线的 SVG path d（三次贝塞尔链） ---- */
function curvePathD(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const { cp1, cp2 } = catmullRomToBezier(p0, p1, p2, p3);
    d += ` C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/* ---- 获取曲线上从起点到 progress 的部分点集（用于动画中的部分曲线） ---- */
function partialCurvePoints(points, progress) {
  if (!points || points.length < 2) return points || [];
  if (progress >= 1) return points.slice();

  const segCount = points.length - 1;
  const segProgress = progress * segCount;
  const reachedSeg = Math.floor(segProgress);
  const segT = segProgress - reachedSeg;

  const result = [];
  for (let i = 0; i <= Math.min(reachedSeg, segCount); i++) {
    result.push({ x: points[i].x, y: points[i].y });
  }

  if (reachedSeg < segCount) {
    const p0 = points[Math.max(0, reachedSeg - 1)];
    const p1 = points[reachedSeg];
    const p2 = points[Math.min(segCount, reachedSeg + 1)];
    const p3 = points[Math.min(segCount, reachedSeg + 2)];
    const endPt = catmullRomPoint(p0, p1, p2, p3, segT);
    result.push({ x: endPt.x, y: endPt.y });
  }

  return result;
}

function initIndustryCanvas() {
  cIndustry = document.getElementById("industry-canvas");
  if (!cIndustry) return;
  ctxIndustry = cIndustry.getContext("2d");
  sizeIndustryCanvas();
  industryState.canvasReady = true;
}

function sizeIndustryCanvas() {
  if (!cIndustry) return;
  const rect = cIndustry.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  industryW = rect.width;
  industryH = rect.height;
  cIndustry.width = industryW * DPR;
  cIndustry.height = industryH * DPR;
  ctxIndustry.setTransform(DPR, 0, 0, DPR, 0, 0);
  rIndustry = rough.canvas(cIndustry);
}

/* ---- 图表几何计算 ---- */
function industryChartGeom() {
  const W = industryW;
  const H = industryH;
  const margin = {
    top: H * 0.08,
    right: W * 0.08,
    bottom: H * 0.18,
    left: W * 0.14,
  };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  return { W, H, margin, plotW, plotH };
}

function industryPoints(metricKey) {
  const metric = industryMetrics()[metricKey];
  if (!metric) return { points: [], metric: null, geom: null };
  const geom = industryChartGeom();
  const { margin, plotW, plotH } = geom;
  const yMax = Math.max(...metric.yTicks);
  const yMin = Math.min(...metric.yTicks);
  const points = metric.points.map((p, i) => ({
    x: margin.left + (plotW / Math.max(1, metric.points.length - 1)) * i,
    y:
      margin.top +
      plotH -
      ((p.value - yMin) / Math.max(1, yMax - yMin)) * plotH,
    ...p,
  }));
  return { points, metric, geom };
}

/* ---- 绘制静态元素（轴、刻度、标签） ---- */
function drawIndustryStatic(metricKey) {
  if (!rIndustry || !ctxIndustry) return;
  const { points, metric, geom } = industryPoints(metricKey);
  if (!geom || !metric) return;
  const { W, H, margin, plotW, plotH } = geom;
  const yMax = Math.max(...metric.yTicks);
  const yMin = Math.min(...metric.yTicks);
  const seed =
    metricKey === "market" ? 7100 : metricKey === "players" ? 7200 : 7300;
  const lineBaseY = margin.top + plotH;

  ctxIndustry.clearRect(0, 0, W, H);

  // ---- 手绘坐标轴 ----
  rIndustry.line(margin.left, lineBaseY, margin.left + plotW + 8, lineBaseY, {
    stroke: ink,
    strokeWidth: 2.4,
    roughness: 2.0,
    bowing: 1.4,
    seed,
  });
  rIndustry.line(margin.left, lineBaseY + 6, margin.left, margin.top - 10, {
    stroke: ink,
    strokeWidth: 2.4,
    roughness: 2.0,
    bowing: 1.4,
    seed: seed + 1,
  });

  // ---- Y 轴刻度 ----
  metric.yTicks.forEach((tick) => {
    const y =
      margin.top + plotH - ((tick - yMin) / Math.max(1, yMax - yMin)) * plotH;
    rIndustry.line(margin.left - 7, y, margin.left, y, {
      stroke: ink,
      strokeWidth: 1.6,
      roughness: 1.6,
      seed: seed + tick,
    });
    ctxIndustry.fillStyle = "rgba(26,26,26,0.72)";
    ctxIndustry.font = `${Math.round(Math.max(11, W * 0.02))}px "PF HuTu", serif`;
    ctxIndustry.textAlign = "right";
    ctxIndustry.textBaseline = "middle";
    ctxIndustry.fillText(fmtTick(tick), margin.left - 12, y);
  });

  // ---- X 轴年份 ----
  points.forEach((p) => {
    ctxIndustry.fillStyle = "rgba(26,26,26,0.72)";
    ctxIndustry.font = `${Math.round(Math.max(10, W * 0.018))}px "PF HuTu", serif`;
    ctxIndustry.textAlign = "center";
    ctxIndustry.textBaseline = "top";
    ctxIndustry.fillText(p.year, p.x, lineBaseY + 7);
  });

  // ---- 单位标签 ----
  ctxIndustry.fillStyle = accent;
  ctxIndustry.font = `${Math.round(Math.max(12, W * 0.022))}px "PF HuTu", serif`;
  ctxIndustry.textAlign = "left";
  ctxIndustry.textBaseline = "bottom";
  ctxIndustry.fillText(metric.unit, margin.left, margin.top - 8);

  // ---- 指标标题 ----
  ctxIndustry.fillStyle = "rgba(26,26,26,0.55)";
  ctxIndustry.font = `${Math.round(Math.max(13, W * 0.024))}px "PF HuTu", serif`;
  ctxIndustry.textAlign = "right";
  ctxIndustry.textBaseline = "bottom";
  ctxIndustry.fillText(metric.title, W - margin.right, margin.top - 8);

  // 存储供动画使用
  industryState._points = points;
  industryState._metric = metric;
  industryState._geom = geom;
}

/* ---- 绘制数据线（支持部分进度）+ 数据点 + 球 + 尾迹 ---- */
function drawIndustryData(progress) {
  if (!rIndustry || !ctxIndustry) return;
  const points = industryState._points;
  const metric = industryState._metric;
  const geom = industryState._geom;
  if (!points || !geom) return;
  const { W, H, margin } = geom;
  const seed =
    industryState.currentKey === "market"
      ? 7100
      : industryState.currentKey === "players"
        ? 7200
        : 7300;
  const lineBaseY = margin.top + geom.plotH;

  const prog = Math.min(1, Math.max(0, progress));

  // ---- 曲线样本（用于球定位） ----
  const fullSamples = sampleCurve(points, 40);

  // ---- 手绘曲线（仅画到当前进度）：Catmull-Rom → SVG path d → RoughJS path ----
  const partialPts = partialCurvePoints(points, prog);
  if (partialPts.length >= 2) {
    const d = curvePathD(partialPts);
    rIndustry.path(d, {
      stroke: ink,
      strokeWidth: 2.8,
      roughness: 2.2,
      bowing: 1.6,
      seed: seed + 40,
    });
    // 草图副线（偏移，手绘双线感）
    const d2 = curvePathD(
      partialPts.map((p) => ({ x: p.x + 1.2, y: p.y - 0.6 })),
    );
    rIndustry.path(d2, {
      stroke: "rgba(26,26,26,0.32)",
      strokeWidth: 1.2,
      roughness: 2.0,
      bowing: 1.5,
      seed: seed + 41,
    });
  }

  // ---- 数据点（仅画已到达的点） ----
  const ballPos = pointOnCurve(fullSamples, prog);
  points.forEach((p, i) => {
    const pointT = i / Math.max(1, points.length - 1);
    if (pointT > prog + 0.005) return; // 还没到
    rIndustry.circle(p.x, p.y, Math.round(Math.max(8, W * 0.016)), {
      stroke: ink,
      strokeWidth: 2.2,
      roughness: 1.6,
      fill: paper,
      fillStyle: "solid",
      seed: seed + 80 + i,
    });
  });

  // ---- 最终值标签 ----
  if (prog > 0.85 && metric && points.length) {
    const lastP = points[points.length - 1];
    const alpha = Math.min(1, (prog - 0.85) / 0.15);
    ctxIndustry.save();
    ctxIndustry.globalAlpha = alpha;
    ctxIndustry.fillStyle = accent;
    ctxIndustry.font = `bold ${Math.round(Math.max(14, W * 0.026))}px "PF HuTu", serif`;
    ctxIndustry.textAlign = "left";
    ctxIndustry.textBaseline = "bottom";
    const label = metric.points[metric.points.length - 1].label;
    ctxIndustry.fillText(label, lastP.x + 10, lastP.y - 10);
    ctxIndustry.restore();
  }

  // ---- 网球 + 尾迹 ----
  if (prog > 0.001) {
    // 尾迹
    const trailFrom = pointOnCurve(fullSamples, Math.max(0, prog - 0.06));
    rIndustry.line(trailFrom.x, trailFrom.y, ballPos.x, ballPos.y, {
      stroke: accent,
      strokeWidth: 2.4,
      roughness: 1.6,
      seed: seed + 200,
    });

    // 网球本体（手绘）
    const ballR = Math.round(Math.max(7, W * 0.013));
    rIndustry.circle(ballPos.x, ballPos.y, ballR * 2, {
      stroke: ink,
      strokeWidth: 2,
      roughness: 1.3,
      fill: ballColour,
      fillStyle: "solid",
      seed: seed + 210,
    });
    // 网球接缝
    ctxIndustry.save();
    ctxIndustry.strokeStyle = "rgba(255,255,255,0.85)";
    ctxIndustry.lineWidth = 1.5;
    ctxIndustry.beginPath();
    ctxIndustry.moveTo(ballPos.x + ballR * 0.46, ballPos.y - ballR * 0.86);
    ctxIndustry.quadraticCurveTo(
      ballPos.x - ballR * 0.04,
      ballPos.y,
      ballPos.x + ballR * 0.46,
      ballPos.y + ballR * 0.86,
    );
    ctxIndustry.stroke();
    ctxIndustry.beginPath();
    ctxIndustry.moveTo(ballPos.x - ballR * 0.46, ballPos.y - ballR * 0.86);
    ctxIndustry.quadraticCurveTo(
      ballPos.x + ballR * 0.04,
      ballPos.y,
      ballPos.x - ballR * 0.46,
      ballPos.y + ballR * 0.86,
    );
    ctxIndustry.stroke();
    ctxIndustry.restore();

    // 地面投影
    rIndustry.ellipse(
      ballPos.x,
      lineBaseY + ballR * 0.3,
      ballR * 1.6,
      ballR * 0.4,
      {
        stroke: "rgba(26,26,26,0.12)",
        strokeWidth: 1.5,
        roughness: 1.8,
        fill: "rgba(26,26,26,0.07)",
        fillStyle: "solid",
        seed: seed + 220,
      },
    );
  }
}

/* ---- 完整绘制（静态 + 数据） ---- */
function drawIndustryChart(metricKey, progress = 1) {
  drawIndustryStatic(metricKey);
  drawIndustryData(progress);
}

/* ---- 导航切换 ---- */
function setIndustryMetric(key) {
  if (industryState.animating) return;
  industryState.currentKey = key;
  document.querySelectorAll(".industry-nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.key === key);
  });
  if (industryState.canvasReady) {
    drawIndustryChart(key, 1);
  }
}

/* ---- 发球动画 ---- */
function playIndustryAnimation() {
  if (industryState.animating || !industryState.canvasReady) return;
  industryState.animating = true;

  const key = industryState.currentKey;
  drawIndustryStatic(key);

  const tracker = { progress: 0 };
  gsap.to(tracker, {
    progress: 1,
    duration: 1.6,
    ease: "power2.out",
    onUpdate: () => {
      drawIndustryStatic(key);
      drawIndustryData(tracker.progress);
    },
    onComplete: () => {
      industryState.animating = false;
      drawIndustryChart(key, 1);
    },
  });
}

/* ---- 页面入口 ---- */
function openIndustryPage() {
  showPageInstant("industry-page");
  // canvas 初始化需要等元素可见且有尺寸
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initIndustryCanvas();
      if (industryState.canvasReady) {
        drawIndustryChart(industryState.currentKey, 1);
      }
    });
  });
}

function navigateJourneyBack() {
  if (journeyState.history.length > 1) {
    journeyState.history.pop();
    journeyState.currentNodeId =
      journeyState.history[journeyState.history.length - 1];
    renderJourneyNode();
    return;
  }
  showPageInstant("map-page");
}

function debugOpenJourneyNode(nodeId) {
  const graph = journeyGraph();
  if (!graph[nodeId]) return;
  journeyState.currentNodeId = nodeId;
  journeyState.history = ["root", nodeId];
  showPageInstant("journey-page");
}

function hydrateDebugJumpOptions() {
  const select = document.getElementById("debug-page-select");
  if (!select) return;

  Array.from(
    select.querySelectorAll('option[data-journey-debug="true"]'),
  ).forEach((option) => option.remove());

  const entries = journeyDebugEntries();
  entries.forEach((entry) => {
    const option = document.createElement("option");
    option.value = `journey:${entry.id}`;
    option.textContent = `${entry.code} ${entry.title}`;
    option.dataset.journeyDebug = "true";
    select.appendChild(option);
  });
}

function mapCourtCount(name) {
  const v = window.TENNIS_COURTS ? window.TENNIS_COURTS[name] : undefined;
  return typeof v === "number" ? v : null;
}

// 场地数 → 颜色：浅米(#efe7d2) → 深橙(accent)；无数据省份给浅灰
function mapColorOf(name) {
  const n = mapCourtCount(name);
  if (n == null) return "#e7e3d8";
  const t = Math.sqrt(
    (n - mapState.minN) / Math.max(1, mapState.maxN - mapState.minN),
  ); // sqrt 提升低值可辨度
  const c0 = [239, 231, 210]; // #efe7d2
  const c1 = [194, 65, 12]; // accent #c2410c
  const ch = c0.map((a, i) => Math.round(a + (c1[i] - a) * t));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function displayRegionName(name) {
  return name
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/省$/, "")
    .replace(/市$/, "");
}

function ensureMapChart() {
  const dom = document.getElementById("map-chart");
  if (!dom) return null;
  if (!mapState.chart) {
    mapState.chart = echarts.init(dom, null, { renderer: "svg" });
    mapState.chart.on("click", (params) => {
      if (!mapState.active || mapState.selected) return;
      if (params && params.name && mapCourtCount(params.name) != null) {
        selectRegion(params.name);
      }
    });
  }
  return mapState.chart;
}

function computeMapGeom() {
  const geo = window.CHINA_GEO;
  if (!geo || !window.echarts) return;

  mapState.features = (geo.features || []).filter((f) => {
    const name = f && f.properties && f.properties.name;
    return !!name && name.trim() !== "";
  });
  const geoForChart = {
    type: "FeatureCollection",
    features: mapState.features,
  };
  if (!mapState.registered) {
    echarts.registerMap("china-handdrawn", geoForChart);
    mapState.registered = true;
  }

  // 数值范围 + 排名（仅统计有数据的省）
  const counts = mapState.features
    .map((f) => mapCourtCount(f.properties && f.properties.name))
    .filter((n) => n != null);
  mapState.minN = Math.min(...counts);
  mapState.maxN = Math.max(...counts);
  mapState.ranking = Object.keys(window.TENNIS_COURTS).sort(
    (a, b) => window.TENNIS_COURTS[b] - window.TENNIS_COURTS[a],
  );
}

function mapSeriesData() {
  return mapState.features.map((f) => {
    const name = f.properties && f.properties.name;
    return {
      name,
      value: mapCourtCount(name),
      selected: mapState.selected === name,
    };
  });
}

function drawMap() {
  const chart = ensureMapChart();
  if (!chart || !mapState.features.length) return;

  const heatVisible = mapState.reveal > 0;
  const option = {
    animation: true,
    animationDuration: 350,
    animationDurationUpdate: 700,
    animationEasingUpdate: "cubicOut",
    tooltip: {
      show: true,
      trigger: "item",
      backgroundColor: "rgba(244, 241, 234, 0.96)",
      borderColor: "rgba(26, 26, 26, 0.18)",
      borderWidth: 1,
      padding: [10, 12],
      textStyle: {
        color: ink,
        fontFamily: "PF HuTu",
        fontSize: 16,
      },
      extraCssText:
        "box-shadow: 0 10px 24px rgba(26,26,26,0.08); border-radius: 14px;",
      formatter(params) {
        const rawName = params.name || "";
        const name = displayRegionName(rawName);
        const count = mapCourtCount(rawName);
        if (count == null) return `${name}<br/>暂无场地数据`;
        return `${name}<br/>网球场地：${count.toLocaleString()} 片`;
      },
    },
    visualMap: heatVisible
      ? {
          show: false,
          min: mapState.minN,
          max: mapState.maxN,
          calculable: false,
          inRange: { color: ["#efe7d2", accent] },
        }
      : undefined,
    series: [
      {
        type: "map",
        map: "china-handdrawn",
        roam: false,
        zoom: 1.06,
        layoutCenter: ["43%", "58%"],
        layoutSize: "84%",
        selectedMode: false,
        label: { show: false },
        emphasis: {
          label: { show: false },
          itemStyle: {
            areaColor: heatVisible ? undefined : "#e6decb",
            borderColor: accent,
            borderWidth: 2,
            shadowColor: "rgba(194,65,12,0.18)",
            shadowBlur: 10,
          },
        },
        itemStyle: {
          areaColor: "#f0ece1",
          borderColor: ink,
          borderWidth: 1.2,
          shadowBlur: 0,
        },
        data: mapSeriesData(),
        regions: mapState.selected
          ? [
              {
                name: mapState.selected,
                itemStyle: {
                  areaColor: heatVisible
                    ? mapColorOf(mapState.selected)
                    : "#f0ece1",
                  borderColor: accent,
                  borderWidth: 3.2,
                  shadowColor: "rgba(194,65,12,0.38)",
                  shadowBlur: 28,
                  shadowOffsetX: 0,
                  shadowOffsetY: 0,
                },
                emphasis: {
                  itemStyle: {
                    borderColor: accent,
                    borderWidth: 3.2,
                    shadowColor: "rgba(194,65,12,0.42)",
                    shadowBlur: 32,
                    shadowOffsetX: 0,
                    shadowOffsetY: 0,
                  },
                },
              },
            ]
          : [],
      },
    ],
  };

  chart.setOption(option, true);
  chart.resize();
}

function selectRegion(name) {
  mapState.selected = name;
  mapState.reveal = 1;
  drawMap();

  const count = mapCourtCount(name);
  const safeCount = typeof count === "number" ? count : 0;
  const rank = mapState.ranking.indexOf(name) + 1;
  const total = mapState.ranking.length;
  const safeRank = rank > 0 ? rank : total;
  const pct =
    total > 0 ? Math.max(1, Math.round((safeRank / total) * 100)) : 100;

  const titleEl = document.getElementById("map-title");
  const bodyEl = document.getElementById("map-body");
  titleEl.textContent = `你出生在「${displayRegionName(name)}」。`;
  bodyEl.innerHTML = `这里拥有 ${safeCount.toLocaleString()} 片网球场地，<br>网球资源数量位于全国前 ${pct}%。`;

  const tl = gsap.timeline();
  tl.to(
    "#map-hint",
    { opacity: 0, y: -10, duration: 0.35, ease: "power2.in" },
    0,
  );
  // 文案 + 图例淡入
  tl.to("#map-copy", { opacity: 1, duration: 0.6, ease: "power2.out" }, 0.25);
  tl.fromTo(
    "#map-copy > *",
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out" },
    0.25,
  );
  tl.to("#map-legend", { opacity: 1, duration: 0.5, ease: "power2.out" }, 0.35);
  tl.add(() => {
    setPageNavReady("map-page", true);
    updatePageNav();
  }, 0.45);
}

function openMapPage() {
  const equal = document.getElementById("equal-page");
  const page = document.getElementById("map-page");
  if (!page || page.classList.contains("is-active")) return;

  mapState.active = true;
  setPageNavReady("map-page", false);
  setCurrentPage("map-page");
  page.setAttribute("aria-hidden", "false");
  page.classList.add("is-active");
  page.style.visibility = "visible";
  page.style.opacity = "1";

  const tl = gsap.timeline();
  tl.to("#equal-page", {
    opacity: 0,
    duration: 0.45,
    ease: "power2.inOut",
    onComplete: () => {
      equal.classList.remove("is-active");
      equal.setAttribute("aria-hidden", "true");
      equal.style.visibility = "hidden";
    },
  });
  tl.add(() => {
    ensureMapChart();
    computeMapGeom();
    mapState.reveal = 0;
    mapState.selected = null;
    drawMap();
  });
  tl.fromTo(
    "#map-hint",
    { opacity: 0 },
    { opacity: 1, duration: 0.6, ease: "power2.out" },
  );
}

/* ============================================================
   photo-wall: 结局照片墙（同学原版）
   ============================================================ */
const photoWallState = { scene: "wall", quoteVisible: false };

function initPhotoWall() {
  const quoteEl = document.querySelector(".pw-quote");
  if (quoteEl && !photoWallState.quoteVisible) {
    photoWallState.quoteVisible = true;
    window.setTimeout(() => {
      quoteEl.classList.add("is-visible");
    }, 120);
  }
  // Ensure wall scene is shown on entry
  showPhotoWallScene("wall");
}

function showPhotoWallScene(name) {
  document.querySelectorAll(".photo-wall-scene").forEach((s) => {
    s.classList.toggle("is-active", s.dataset.scene === name);
  });
  photoWallState.scene = name;
}

function openPhotoWallPhoto(photoEl) {
  const img = document.getElementById("pwFocusImage");
  const focusEl = document.getElementById("pwFocusPhoto");
  if (!img || !focusEl || !photoEl) return;
  img.src = photoEl.dataset.photo;
  focusEl.style.setProperty("--focus-rotate", photoEl.dataset.rotate || "0deg");
  showPhotoWallScene("focus");
  focusEl.focus({ preventScroll: true });
}

function openJourneyPage() {
  const map = document.getElementById("map-page");
  const page = document.getElementById("journey-page");
  if (!page || page.classList.contains("is-active") || !mapState.selected)
    return;

  journeyState.active = true;
  resetJourney();
  renderJourneyNode();
  setPageNavReady("journey-page", false);
  setCurrentPage("journey-page");
  page.setAttribute("aria-hidden", "false");
  page.classList.add("is-active");
  page.style.visibility = "visible";
  page.style.opacity = "1";
  gsap.set(".journey-paper", { opacity: 0, y: 28, scale: 0.985 });

  const tl = gsap.timeline();
  tl.to("#map-page", {
    opacity: 0,
    duration: 0.4,
    ease: "power2.inOut",
    onComplete: () => {
      map.classList.remove("is-active");
      map.setAttribute("aria-hidden", "true");
      map.style.visibility = "hidden";
    },
  });
  tl.to(
    ".journey-paper",
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.62,
      ease: "power3.out",
    },
    "-=0.06",
  );
  tl.add(() => setPageNavReady("journey-page", true), "-=0.18");
}

function init() {
  // 开场：只有小人 + 发球提示；标题/正文/按钮全部先隐藏
  // 标题/副标题只隐藏透明度（不位移），保证 0 占位坐标稳定
  gsap.set([".title", ".subtitle"], { opacity: 0 });
  gsap.set(".body", { opacity: 0, y: 16 });
  gsap.set(".start-btn", { opacity: 0, y: 16 });
  gsap.set("#serve-hint", { opacity: 0 });
  gsap.set(".gender-paper", { opacity: 0, y: 36, scale: 0.985 });
  gsap.set(".gender-copy > *", { opacity: 0, y: 18 });
  gsap.set(".baby-stage", { opacity: 0, x: 12 });
  gsap.set(".journey-paper", { opacity: 0, y: 28, scale: 0.985 });
  setCurrentPage("cover");
  PAGE_ORDER.forEach((pageId) => setPageNavReady(pageId, false));

  resize();

  // 发球提示呼吸闪动
  gsap.to("#serve-hint", { opacity: 0.78, duration: 0.6, delay: 0.5 });
  gsap.to("#serve-hint kbd", {
    scale: 1.08,
    duration: 0.8,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    transformOrigin: "center",
    delay: 1.1,
  });

  // 空格 / 点击画面 → 发球
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") {
      setTrainingBillsModalOpen(false);
      return;
    }
    if (e.code !== "Space") return;
    e.preventDefault();
    if (industryState.active) {
      playIndustryAnimation();
      return;
    }
    swing();
  });
  document.getElementById("cover").addEventListener("click", (e) => {
    if (e.target.id === "start-btn") return;
    swing();
  });

  // 「开始人生」按钮：进入第二页
  document.getElementById("start-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openGenderPage();
  });

  document.querySelectorAll(".gender-option").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".gender-option").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
      });
      updatePageNav();
      // 选完短暂停顿，自动过场到第三幕
      gsap.delayedCall(0.45, openRatioPage);
    });
  });

  // 第三幕按钮 → 进入同酬时间线
  const ratioNext = document.getElementById("ratio-next-btn");
  if (ratioNext) ratioNext.addEventListener("click", openEqualPage);
  const equalNext = document.getElementById("equal-next-btn");
  if (equalNext) equalNext.addEventListener("click", openMapPage);
  const journeyOptions = document.getElementById("journey-options");
  if (journeyOptions) {
    journeyOptions.addEventListener("click", (e) => {
      const actionButton = e.target.closest("[data-action]");
      if (actionButton) {
        runJourneyAction(actionButton.dataset.action, actionButton.dataset);
        return;
      }
      const button = e.target.closest("[data-next]");
      if (!button) return;
      goToJourneyNode(button.dataset.next);
    });
  }
  document
    .getElementById("journey-restart-btn")
    ?.addEventListener("click", () => {
      resetJourney();
      renderJourneyNode();
    });
  document.getElementById("journey-map-btn")?.addEventListener("click", () => {
    showPageInstant("map-page");
  });
  document.getElementById("industry-page")?.addEventListener("click", (e) => {
    if (
      e.target.closest(".page-nav") ||
      e.target.closest(".debug-jump") ||
      e.target.closest(".industry-nav")
    )
      return;
    playIndustryAnimation();
  });

  const debugPageSelect = document.getElementById("debug-page-select");
  hydrateDebugJumpOptions();
  if (debugPageSelect) {
    debugPageSelect.addEventListener("change", (e) => {
      const target = e.target.value;
      if (!target) return;
      if (target.startsWith("journey:")) {
        debugOpenJourneyNode(target.slice("journey:".length));
        return;
      }
      if (target === "journey-page" && !journeyState.currentNodeId) {
        resetJourney();
      }
      showPageInstant(target);
    });
  }

  document.querySelectorAll(".achievement-view-btn").forEach((button) => {
    button.addEventListener("click", () => {
      setAchievementView(button.dataset.view);
    });
  });

  document.querySelectorAll(".industry-nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      setIndustryMetric(button.dataset.key);
    });
  });

  document.querySelectorAll(".page-nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      navigatePage(button.dataset.dir, button.dataset.page);
    });
  });

  window.addEventListener("resize", () => {
    const wasDone = state.completed;
    resize();
    if (wasDone) {
      snapZeros();
      drawBall();
    }
    if (ratioState.active) {
      sizeRatioCanvas();
      // 重算几何，保持每颗球在新网格的对应落点（已落下的保持"已落"）
      ["boy", "girl"].forEach((side) => {
        const car = ratioState.cars[side];
        const g = ratioCarGeom(side);
        const slots = computeSlots(g, car.balls.length);
        car.geom = g;
        car.balls.forEach((b, i) => {
          const wasDown = b.y != null;
          b.slotX = slots[i].x;
          b.slotY = slots[i].y;
          b.x = slots[i].x;
          if (wasDown) b.y = slots[i].y;
        });
      });
      const p = ratioState.player;
      if (p) {
        const pc = ratioState.cars[ratioState.playerGender];
        const last = pc.balls[pc.balls.length - 1];
        const wasDown = p.y != null;
        p.x = last.slotX;
        p.restX = last.slotX;
        p.restY = last.slotY;
        p.r = pc.geom.r;
        if (wasDown) p.y = last.slotY;
      }
      drawRatioScene();
    }
    if (equalState.active) {
      sizeEqualCanvas();
      prepareEqualScene();
      drawEqualScene();
    }
    if (achievementState.active) {
      renderAchievementPlot(true);
    }
    if (mapState.active) {
      if (mapState.chart) {
        mapState.chart.resize();
      }
      drawMap();
    }
    if (industryState.active && industryState.canvasReady) {
      sizeIndustryCanvas();
      drawIndustryChart(industryState.currentKey, 1);
    }
  });

  // ---- Photo wall event handlers ----
  document.querySelectorAll(".pw-photo").forEach((photo) => {
    photo.addEventListener("click", () => openPhotoWallPhoto(photo));
  });

  const pwFocusScene = document.querySelector(".focus-scene");
  const pwFocusPhoto = document.getElementById("pwFocusPhoto");
  if (pwFocusScene) {
    pwFocusScene.addEventListener("click", () => showPhotoWallScene("wall"));
  }
  if (pwFocusPhoto) {
    pwFocusPhoto.addEventListener("click", (e) => {
      e.stopPropagation();
      showPhotoWallScene("wall");
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && photoWallState.scene === "focus") {
      showPhotoWallScene("wall");
    }
  });

  updatePageNav();
}

window.addEventListener("load", init);

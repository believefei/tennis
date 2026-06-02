const DPR = Math.min(window.devicePixelRatio || 1, 2);

const canvasBg = document.getElementById("c-bg");
const canvasFigure = document.getElementById("c-figure");
const canvasBall = document.getElementById("c-ball");
const canvasFx = document.getElementById("c-fx");

const ctxBg = canvasBg.getContext("2d");
const ctxFigure = canvasFigure.getContext("2d");
const ctxBall = canvasBall.getContext("2d");
const ctxFx = canvasFx.getContext("2d");

let roughBg;
let roughFigure;
let roughBall;
let roughFx;

let width = 0;
let height = 0;
let animating = false;

const palette = {
  paper: "#f6efdf",
  ink: "#171412",
  muted: "#6f655b",
  accent: "#b64926",
  accentSoft: "#de8d64",
  ball: "#d4e04d",
  court: "#d8c5a4",
  white: "#fffdf7",
};

const state = {
  pose: {
    torso: -0.08,
    shoulder: -2.55,
    elbow: -0.75,
    wrist: 0.2,
    guideArm: -0.5,
    guideElbow: 0.8,
    frontLeg: -0.72,
    frontKnee: 0.95,
    backLeg: 0.48,
    backKnee: -0.55,
    lean: -0.02,
    hop: 0,
  },
  ball: {
    x: 0.41,
    y: 0.56,
    scale: 1,
    rotation: 0,
    trail: 0,
    visible: true,
  },
  fx: {
    burst: 0,
    sweep: 0,
    ring: 0,
  },
};

const seedBase = 124;

function setupCanvas(canvas, ctx) {
  canvas.width = width * DPR;
  canvas.height = height * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function resize() {
  const stage = document.getElementById("stage");
  width = stage.clientWidth;
  height = stage.clientHeight;

  [canvasBg, canvasFigure, canvasBall, canvasFx].forEach((canvas, i) => {
    const contexts = [ctxBg, ctxFigure, ctxBall, ctxFx];
    setupCanvas(canvas, contexts[i]);
  });

  roughBg = rough.canvas(canvasBg);
  roughFigure = rough.canvas(canvasFigure);
  roughBall = rough.canvas(canvasBall);
  roughFx = rough.canvas(canvasFx);

  resetBall();
  renderAll();
}

function renderAll() {
  drawBackground();
  drawFigure();
  drawBall();
  drawFx();
}

function pointFrom(origin, angle, length) {
  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  };
}

function drawBackground() {
  ctxBg.clearRect(0, 0, width, height);

  const sky = ctxBg.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "rgba(255,255,255,0.36)");
  sky.addColorStop(1, "rgba(214,197,162,0.18)");
  ctxBg.fillStyle = sky;
  ctxBg.fillRect(0, 0, width, height);

  const floorY = height * 0.79;

  ctxBg.fillStyle = "rgba(216,197,164,0.22)";
  ctxBg.beginPath();
  ctxBg.moveTo(0, floorY);
  ctxBg.quadraticCurveTo(width * 0.5, floorY - 18, width, floorY + 4);
  ctxBg.lineTo(width, height);
  ctxBg.lineTo(0, height);
  ctxBg.closePath();
  ctxBg.fill();

  roughBg.line(width * 0.06, floorY, width * 0.94, floorY - 3, {
    stroke: palette.ink,
    strokeWidth: 2.2,
    roughness: 1.4,
    bowing: 0.8,
    seed: seedBase,
  });

  roughBg.line(width * 0.58, floorY - height * 0.14, width * 0.9, floorY - height * 0.2, {
    stroke: palette.accentSoft,
    strokeWidth: 1.6,
    roughness: 1.2,
    bowing: 1,
    seed: seedBase + 1,
  });

  roughBg.line(width * 0.61, floorY - height * 0.05, width * 0.94, floorY - height * 0.11, {
    stroke: palette.accentSoft,
    strokeWidth: 1.2,
    roughness: 1.2,
    bowing: 1,
    seed: seedBase + 2,
  });

  roughBg.line(width * 0.73, floorY - height * 0.22, width * 0.73, floorY + height * 0.08, {
    stroke: "rgba(23,20,18,0.45)",
    strokeWidth: 1,
    roughness: 1.1,
    bowing: 0.4,
    seed: seedBase + 3,
  });

  for (let i = 0; i < 9; i += 1) {
    const x = width * (0.1 + i * 0.09);
    roughBg.line(x, floorY + 9, x - 16, floorY + 19, {
      stroke: "rgba(23,20,18,0.24)",
      strokeWidth: 1,
      roughness: 1.6,
      bowing: 0.6,
      seed: seedBase + 20 + i,
    });
  }

  ctxBg.fillStyle = "rgba(23,20,18,0.05)";
  ctxBg.beginPath();
  ctxBg.ellipse(width * 0.66, floorY + 14, width * 0.16, height * 0.035, -0.12, 0, Math.PI * 2);
  ctxBg.fill();
}

function drawLimb(rc, a, b, options) {
  rc.line(a.x, a.y, b.x, b.y, options);
}

function drawFigure() {
  ctxFigure.clearRect(0, 0, width, height);

  const p = state.pose;
  const floorY = height * 0.79;
  const unit = height * 0.09;
  const hip = {
    x: width * 0.34 + p.lean * width,
    y: floorY - unit * 2.4 - p.hop * unit * 0.28,
  };

  const torsoAngle = -Math.PI / 2 + p.torso;
  const chest = pointFrom(hip, torsoAngle, unit * 1.45);
  const neck = pointFrom(chest, torsoAngle, unit * 0.32);
  const head = pointFrom(neck, torsoAngle, unit * 0.92);
  const shoulder = pointFrom(chest, torsoAngle, unit * 0.06);

  const frontKnee = pointFrom(hip, Math.PI / 2 + p.frontLeg, unit * 1.22);
  const frontFoot = pointFrom(frontKnee, Math.PI / 2 + p.frontKnee, unit * 1.12);
  const backKnee = pointFrom(hip, Math.PI / 2 + p.backLeg, unit * 1.18);
  const backFoot = pointFrom(backKnee, Math.PI / 2 + p.backKnee, unit * 1.18);

  const guideElbow = pointFrom(shoulder, Math.PI + p.guideArm, unit * 0.9);
  const guideHand = pointFrom(guideElbow, Math.PI * 0.85 + p.guideElbow, unit * 0.82);

  const racketElbow = pointFrom(shoulder, p.shoulder, unit * 1.08);
  const racketHand = pointFrom(racketElbow, p.shoulder + p.elbow, unit * 0.98);
  const racketBase = pointFrom(racketHand, p.shoulder + p.elbow + p.wrist, unit * 1.02);
  const racketHead = pointFrom(racketBase, p.shoulder + p.elbow + p.wrist, unit * 0.74);

  state.racket = {
    center: racketHead,
    angle: p.shoulder + p.elbow + p.wrist,
  };

  const limbInk = {
    stroke: palette.ink,
    strokeWidth: 2.6,
    roughness: 1.25,
    bowing: 1.1,
    seed: seedBase + 40,
  };

  const accentInk = {
    stroke: palette.accent,
    strokeWidth: 2.8,
    roughness: 1.15,
    bowing: 0.7,
    seed: seedBase + 48,
  };

  ctxFigure.fillStyle = "rgba(23,20,18,0.08)";
  ctxFigure.beginPath();
  ctxFigure.ellipse(hip.x + unit * 0.25, floorY + 8, unit * 1.55, unit * 0.34, -0.2, 0, Math.PI * 2);
  ctxFigure.fill();

  drawLimb(roughFigure, hip, frontKnee, limbInk);
  drawLimb(roughFigure, frontKnee, frontFoot, limbInk);
  drawLimb(roughFigure, hip, backKnee, limbInk);
  drawLimb(roughFigure, backKnee, backFoot, limbInk);

  drawLimb(roughFigure, hip, chest, { ...limbInk, strokeWidth: 3.2 });
  drawLimb(roughFigure, chest, neck, { ...limbInk, strokeWidth: 2.8 });

  roughFigure.circle(head.x, head.y, unit * 0.95, {
    stroke: palette.ink,
    strokeWidth: 2.4,
    roughness: 1.2,
    fill: "#f8f0e2",
    fillStyle: "solid",
    seed: seedBase + 50,
  });

  drawLimb(roughFigure, shoulder, guideElbow, limbInk);
  drawLimb(roughFigure, guideElbow, guideHand, limbInk);
  drawLimb(roughFigure, shoulder, racketElbow, accentInk);
  drawLimb(roughFigure, racketElbow, racketHand, accentInk);

  roughFigure.line(racketHand.x, racketHand.y, racketBase.x, racketBase.y, {
    stroke: palette.accent,
    strokeWidth: 3.2,
    roughness: 1.1,
    seed: seedBase + 51,
  });

  drawRacketFace(racketHead, state.racket.angle, unit);
}

function drawRacketFace(center, angle, unit) {
  ctxFigure.save();
  ctxFigure.translate(center.x, center.y);
  ctxFigure.rotate(angle + 0.14);

  const headW = unit * 1.52;
  const headH = unit * 1.95;

  roughFigure.ellipse(0, 0, headW, headH, {
    stroke: palette.accent,
    strokeWidth: 2.4,
    roughness: 1.05,
    seed: seedBase + 60,
  });

  for (let i = -2; i <= 2; i += 1) {
    const x = i * unit * 0.18;
    roughFigure.line(x, -headH * 0.34, x, headH * 0.34, {
      stroke: "rgba(23,20,18,0.6)",
      strokeWidth: 0.75,
      roughness: 0.8,
      seed: seedBase + 70 + i,
    });
  }

  for (let i = -2; i <= 2; i += 1) {
    const y = i * unit * 0.16;
    roughFigure.line(-headW * 0.34, y, headW * 0.34, y, {
      stroke: "rgba(23,20,18,0.45)",
      strokeWidth: 0.6,
      roughness: 0.8,
      seed: seedBase + 80 + i,
    });
  }

  ctxFigure.restore();
}

function drawBall() {
  ctxBall.clearRect(0, 0, width, height);

  if (!state.ball.visible) {
    return;
  }

  const ball = state.ball;
  const px = ball.x * width;
  const py = ball.y * height;
  const radius = height * 0.03 * ball.scale;

  if (ball.trail > 0.01 && state.ballVelocity) {
    const { x, y } = state.ballVelocity;
    const speed = Math.hypot(x, y) || 1;
    const ux = -x / speed;
    const uy = -y / speed;
    const nx = -uy;
    const ny = ux;

    for (let i = 0; i < 4; i += 1) {
      const drift = (i - 1.5) * radius * 0.42;
      const tail = radius * (4.8 + i * 1.2) * ball.trail;
      roughBall.line(
        px + nx * drift,
        py + ny * drift,
        px + nx * drift + ux * tail,
        py + ny * drift + uy * tail,
        {
          stroke: i < 2 ? palette.accent : palette.accentSoft,
          strokeWidth: 2 - i * 0.3,
          roughness: 1.4,
          bowing: 0.5,
          seed: seedBase + 100 + i,
        }
      );
    }
  }

  ctxBall.save();
  ctxBall.translate(px, py);
  ctxBall.rotate(ball.rotation);

  roughBall.circle(0, 0, radius * 2, {
    stroke: palette.ink,
    strokeWidth: 2,
    roughness: 1.1,
    fill: palette.ball,
    fillStyle: "solid",
    seed: seedBase + 110,
  });

  roughBall.path(`M ${-radius * 0.95} ${-radius * 0.12} Q 0 ${-radius * 0.78}, ${radius * 0.95} ${-radius * 0.12}`, {
    stroke: palette.white,
    strokeWidth: 1.3,
    roughness: 0.8,
    seed: seedBase + 111,
  });

  roughBall.path(`M ${-radius * 0.95} ${radius * 0.12} Q 0 ${radius * 0.78}, ${radius * 0.95} ${radius * 0.12}`, {
    stroke: palette.white,
    strokeWidth: 1.3,
    roughness: 0.8,
    seed: seedBase + 112,
  });

  ctxBall.restore();
}

function drawFx() {
  ctxFx.clearRect(0, 0, width, height);

  const burst = state.fx.burst;
  const sweep = state.fx.sweep;
  const ring = state.fx.ring;
  const racket = state.racket;

  if (racket && burst > 0.01) {
    const { center } = racket;
    const rays = 9;
    for (let i = 0; i < rays; i += 1) {
      const angle = (Math.PI * 2 * i) / rays + burst * 0.3;
      const inner = height * 0.02;
      const outer = inner + height * 0.045 * burst;
      roughFx.line(
        center.x + Math.cos(angle) * inner,
        center.y + Math.sin(angle) * inner,
        center.x + Math.cos(angle) * outer,
        center.y + Math.sin(angle) * outer,
        {
          stroke: palette.accent,
          strokeWidth: 1.8 * burst + 0.4,
          roughness: 1.35,
          bowing: 0.7,
          seed: seedBase + 130 + i,
        }
      );
    }
  }

  if (racket && sweep > 0.01) {
    ctxFx.save();
    ctxFx.translate(racket.center.x, racket.center.y);
    ctxFx.rotate(racket.angle + 0.28);
    ctxFx.strokeStyle = `rgba(182, 73, 38, ${0.24 * sweep})`;
    ctxFx.lineWidth = 2.2;
    ctxFx.setLineDash([10, 9]);
    ctxFx.beginPath();
    ctxFx.arc(0, 0, height * 0.12, -2.4, -0.6);
    ctxFx.stroke();
    ctxFx.restore();
  }

  if (state.ball.trail > 0.08 && state.ball.visible) {
    const ball = state.ball;
    const px = ball.x * width;
    const py = ball.y * height;
    ctxFx.save();
    ctxFx.strokeStyle = `rgba(182, 73, 38, ${0.18 * state.ball.trail})`;
    ctxFx.lineWidth = 1.6;
    ctxFx.setLineDash([7, 10]);
    ctxFx.beginPath();
    ctxFx.arc(px - 32, py + 10, height * 0.055, Math.PI * 1.12, Math.PI * 1.92);
    ctxFx.stroke();
    ctxFx.restore();
  }

  if (ring > 0.01) {
    const ball = state.ball;
    const px = ball.x * width;
    const py = ball.y * height;
    roughFx.circle(px, py, height * 0.12 * ring, {
      stroke: `rgba(182, 73, 38, ${0.35 * (1 - ring)})`,
      strokeWidth: 1.5,
      roughness: 1.4,
      seed: seedBase + 150,
    });
  }
}

function renderFigure() {
  requestAnimationFrame(drawFigure);
}

function renderBall() {
  requestAnimationFrame(() => {
    drawBall();
    drawFx();
  });
}

function resetBall() {
  state.ball.x = 0.41;
  state.ball.y = 0.56;
  state.ball.scale = 1;
  state.ball.rotation = 0;
  state.ball.trail = 0;
  state.ball.visible = true;
  state.ballVelocity = { x: 0, y: 0 };
}

function swing() {
  if (animating) {
    return;
  }
  animating = true;

  const pose = state.pose;
  const ball = state.ball;
  const fx = state.fx;

  const startBall = { x: 0.41, y: 0.56 };
  const endBall = { x: 1.08, y: 0.29 };
  const arcLift = 0.27;
  const progress = { value: 0 };

  resetBall();

  const timeline = gsap.timeline({
    defaults: {
      overwrite: true,
    },
    onUpdate: () => {
      renderFigure();
      renderBall();
    },
    onComplete: () => {
      animating = false;
      state.ball.visible = false;
      renderBall();
      gsap.delayedCall(0.35, () => {
        resetBall();
        renderBall();
      });
    },
  });

  timeline.to(pose, {
    torso: -0.18,
    shoulder: -2.95,
    elbow: -1.1,
    wrist: -0.1,
    guideArm: -0.8,
    guideElbow: 0.95,
    frontLeg: -0.84,
    frontKnee: 1.12,
    backLeg: 0.62,
    backKnee: -0.48,
    lean: -0.04,
    hop: 0.02,
    duration: 0.38,
    ease: "power2.inOut",
  });

  timeline.to(pose, {
    torso: 0.2,
    shoulder: -0.1,
    elbow: 0.48,
    wrist: 0.36,
    guideArm: 0.18,
    guideElbow: 0.5,
    frontLeg: -0.25,
    frontKnee: 0.5,
    backLeg: 0.22,
    backKnee: -0.22,
    lean: 0.035,
    hop: 0.18,
    duration: 0.22,
    ease: "power4.out",
  }, "hit");

  timeline.fromTo(fx, {
    burst: 0,
    sweep: 0,
    ring: 0,
  }, {
    burst: 1,
    sweep: 1,
    ring: 0.4,
    duration: 0.08,
    ease: "power2.out",
  }, "hit+=0.02");

  timeline.to(fx, {
    burst: 0,
    sweep: 0,
    ring: 1,
    duration: 0.42,
    ease: "power2.out",
  }, "hit+=0.08");

  timeline.to(ball, {
    trail: 1,
    duration: 0.15,
    ease: "power1.out",
  }, "hit+=0.03");

  timeline.to(progress, {
    value: 1,
    duration: 0.92,
    ease: "none",
    onUpdate: () => {
      const prevX = ball.x;
      const prevY = ball.y;
      const t = progress.value;
      ball.x = startBall.x + (endBall.x - startBall.x) * t;
      ball.y = startBall.y + (endBall.y - startBall.y) * t - arcLift * 4 * t * (1 - t);
      ball.scale = 1 - 0.4 * t;
      ball.rotation += 0.46;
      state.ballVelocity = { x: ball.x - prevX, y: ball.y - prevY };
    },
  }, "hit+=0.03");

  timeline.to(ball, {
    trail: 0,
    duration: 0.62,
    ease: "power1.in",
  }, "hit+=0.46");

  timeline.to(pose, {
    torso: 0.05,
    shoulder: 0.72,
    elbow: 0.24,
    wrist: 0.24,
    guideArm: -0.2,
    guideElbow: 0.7,
    frontLeg: -0.52,
    frontKnee: 0.78,
    backLeg: 0.42,
    backKnee: -0.4,
    lean: 0.01,
    hop: 0.05,
    duration: 0.28,
    ease: "power2.out",
  }, "hit+=0.12");

  timeline.to(pose, {
    torso: -0.08,
    shoulder: -2.55,
    elbow: -0.75,
    wrist: 0.2,
    guideArm: -0.5,
    guideElbow: 0.8,
    frontLeg: -0.72,
    frontKnee: 0.95,
    backLeg: 0.48,
    backKnee: -0.55,
    lean: -0.02,
    hop: 0,
    duration: 0.42,
    ease: "power2.inOut",
  }, "hit+=0.56");
}

function init() {
  resize();
  document.getElementById("stage").addEventListener("click", swing);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      swing();
    }
  });
  window.addEventListener("resize", resize);
  gsap.delayedCall(0.8, swing);
}

window.addEventListener("load", init);

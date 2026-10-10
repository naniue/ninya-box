/**
 * 3.8cm cube crash-lock box net.
 * Units: millimeters. Measured from the user's die-cut template.
 */
export const S = 38;
export const A4 = { w: 210, h: 297 };

export const GLUE_W = 8.5;
export const TUCK_H = 10.5;
export const DUST_H = 16.6;
export const BOT_SIDE_H = 16.6;
export const BOT_MAIN_H = 27.0;

export const GLUE_TAPER = 2.8;
export const TUCK_RADIUS = 4.2;
export const TUCK_SLIT = 4.8;
export const DUST_INSET_L = 3.5;
export const DUST_INSET_R = 4.4;

export const BOT1_NOTCH_FROM_FOLD = 19.16;
export const BOT1_LEG_W = 9.11;
export const BOT1_NOTCH_W = 19.16;

export const BOT2_STEP_X = 19.47;
export const BOT2_STEP_Y = 10.05;

export const BOT3_TAPER_W = 21.36;
export const BOT3_TAB_TOP_W = 18.84;
export const BOT3_TAB_BOT_W = 15.07;
export const BOT3_TAB_R = 3.2;

export const NET_W = GLUE_W + 4 * S;
export const NET_H = TUCK_H + S + S + BOT_MAIN_H;

export const TITLE_H = 18;
export const PAGE_MARGIN_X = (A4.w - NET_W) / 2;
export const PAGE_MARGIN_Y = 22;

export const FACES = [
  { id: "top", label: "上面", short: "上", hint: "盒盖，俯视", canWindow: true },
  { id: "front", label: "前面", short: "前", hint: "打开后正对你", canWindow: true },
  { id: "back", label: "后面", short: "后", hint: "与盒盖相连", canWindow: true },
  { id: "left", label: "左面", short: "左", hint: "盒子左侧", canWindow: true },
  { id: "right", label: "右面", short: "右", hint: "盒子右侧", canWindow: true },
];

export const BELT_FACES = ["back", "left", "front", "right"];

export const WINDOW_INSET_MIN = 1;
export const WINDOW_INSET_MAX = 16;
export const WINDOW_INSET_DEFAULT = 3;

export function windowRect(rect, inset) {
  const maxInset = Math.max(WINDOW_INSET_MIN, Math.min(rect.w, rect.h) / 2 - 2);
  const m = Math.min(Math.max(inset, WINDOW_INSET_MIN), maxInset);
  return {
    x: rect.x + m,
    y: rect.y + m,
    w: rect.w - m * 2,
    h: rect.h - m * 2,
  };
}

export function maxNetsOnA4(gap = 4, margin = 5) {
  const cols = Math.floor((A4.w - margin * 2 + gap) / (NET_W + gap));
  const rows = Math.floor((A4.h - margin * 2 + gap) / (NET_H + gap));
  return Math.max(1, cols) * Math.max(1, rows);
}

export function packNetsOnA4(count, gap = 4, margin = 5) {
  const max = maxNetsOnA4(gap, margin);
  const n = Math.min(Math.max(1, Math.round(count) || 1), max);
  const cols = Math.max(1, Math.floor((A4.w - margin * 2 + gap) / (NET_W + gap)));
  const usedCols = Math.min(n, cols);
  const usedRows = Math.ceil(n / cols);
  const totalW = usedCols * NET_W + (usedCols - 1) * gap;
  const totalH = usedRows * NET_H + (usedRows - 1) * gap;
  const startX = (A4.w - totalW) / 2;
  const startY = (A4.h - totalH) / 2;
  const positions = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    positions.push({
      x: startX + c * (NET_W + gap),
      y: startY + r * (NET_H + gap),
    });
  }
  return { count: n, max, positions };
}

export function layout(ox = PAGE_MARGIN_X, oy = PAGE_MARGIN_Y + TITLE_H) {
  const x0 = ox + GLUE_W;
  const yTop = oy + TUCK_H;
  const yBelt = yTop + S;
  const yBot = yBelt + S;

  return {
    ox,
    oy,
    x0,
    yTop,
    yBelt,
    yBot,
    faces: {
      top: { x: x0, y: yTop, w: S, h: S, netRotate: 180 },
      back: { x: x0, y: yBelt, w: S, h: S, netRotate: 0 },
      left: { x: x0 + S, y: yBelt, w: S, h: S, netRotate: 0 },
      front: { x: x0 + 2 * S, y: yBelt, w: S, h: S, netRotate: 0 },
      right: { x: x0 + 3 * S, y: yBelt, w: S, h: S, netRotate: 0 },
    },
  };
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function p(x, y) {
  return `${r2(x)} ${r2(y)}`;
}

export function buildCutPath(L) {
  const { x0, yTop, yBelt, yBot, oy } = L;
  const s = S;
  const x1 = x0 + s;
  const x2 = x0 + 2 * s;
  const x3 = x0 + 3 * s;
  const x4 = x0 + 4 * s;
  const ox = L.ox;
  const gt = GLUE_TAPER;
  const tr = TUCK_RADIUS;
  const dust = DUST_H;
  const diL = DUST_INSET_L;
  const diR = DUST_INSET_R;

  const tuckTop = oy;
  const dustY = yBelt - dust;

  const bot2StepX = x1 + BOT2_STEP_X;
  const bot2StepY = yBot + BOT2_STEP_Y;
  const bot2Y = yBot + BOT_SIDE_H;

  const bot4StepX = x4 - BOT2_STEP_X;
  const bot4StepY = yBot + BOT2_STEP_Y;
  const bot4Y = yBot + BOT_SIDE_H;

  const c3 = x2 + s / 2;
  const taperHalf = BOT3_TAPER_W / 2;
  const tabTopHalf = BOT3_TAB_TOP_W / 2;
  const tabBotHalf = BOT3_TAB_BOT_W / 2;
  const taperY = yBot + BOT_SIDE_H;
  const tabY = yBot + BOT_MAIN_H;
  const tabR = BOT3_TAB_R;

  const nTop = yBot + BOT1_NOTCH_FROM_FOLD;
  const nL = x0 + BOT1_LEG_W;
  const nR = x0 + BOT1_LEG_W + BOT1_NOTCH_W;
  const nBot = yBot + BOT_MAIN_H;

  const d = [
    `M ${p(x0, yBelt)}`,
    `L ${p(ox, yBelt + gt)}`,
    `L ${p(ox, yBot - gt)}`,
    `L ${p(x0, yBot)}`,

    `L ${p(x0, nBot)}`,
    `L ${p(nL, nBot)}`,
    `L ${p(nL, nTop)}`,
    `L ${p(nR, nTop)}`,
    `L ${p(nR, nBot)}`,
    `L ${p(x1, nBot)}`,
    `L ${p(x1, yBot)}`,

    `L ${p(x1 + 2.2, yBot + 1.2)}`,
    `L ${p(bot2StepX, bot2StepY)}`,
    `L ${p(bot2StepX, bot2Y)}`,
    `L ${p(x2, bot2Y)}`,
    `L ${p(x2, yBot)}`,

    `L ${p(c3 - taperHalf, taperY)}`,
    `L ${p(c3 - tabTopHalf, taperY + 2.2)}`,
    `L ${p(c3 - tabBotHalf, tabY - tabR)}`,
    `A ${r2(tabR)} ${r2(tabR)} 0 0 0 ${p(c3 - tabBotHalf + tabR, tabY)}`,
    `L ${p(c3 + tabBotHalf - tabR, tabY)}`,
    `A ${r2(tabR)} ${r2(tabR)} 0 0 0 ${p(c3 + tabBotHalf, tabY - tabR)}`,
    `L ${p(c3 + tabTopHalf, taperY + 2.2)}`,
    `L ${p(c3 + taperHalf, taperY)}`,
    `L ${p(x3, yBot)}`,

    `L ${p(x3, bot4Y)}`,
    `L ${p(bot4StepX, bot4Y)}`,
    `L ${p(bot4StepX, bot4StepY)}`,
    `L ${p(x4 - 2.2, yBot + 1.2)}`,
    `L ${p(x4, yBot)}`,

    `L ${p(x4, yBelt)}`,

    `L ${p(x4 - diL, dustY)}`,
    `L ${p(x3 + diR, dustY)}`,
    `L ${p(x3, yBelt)}`,

    `L ${p(x2, yBelt)}`,

    `L ${p(x2 - diR, dustY)}`,
    `L ${p(x1 + diL, dustY)}`,
    `L ${p(x1, yBelt)}`,

    `L ${p(x1, yTop)}`,
    `L ${p(x1, tuckTop + tr)}`,
    `A ${r2(tr)} ${r2(tr)} 0 0 0 ${p(x1 - tr, tuckTop)}`,
    `L ${p(x0 + tr, tuckTop)}`,
    `A ${r2(tr)} ${r2(tr)} 0 0 0 ${p(x0, tuckTop + tr)}`,
    `L ${p(x0, yTop)}`,
    `L ${p(x0, yBelt)}`,
    `Z`,
  ];

  return d.join(" ");
}

export function buildFoldSegments(L) {
  const { x0, yTop, yBelt, yBot } = L;
  const s = S;
  const x1 = x0 + s;
  const x2 = x0 + 2 * s;
  const x3 = x0 + 3 * s;
  const x4 = x0 + 4 * s;
  const slit = TUCK_SLIT;

  const segs = [
    { x1: x0 + slit, y1: yTop, x2: x1 - slit, y2: yTop },
    { x1: x0, y1: yBelt, x2: x1, y2: yBelt },
    { x1: x1, y1: yBelt, x2: x2, y2: yBelt },
    { x1: x3, y1: yBelt, x2: x4, y2: yBelt },
    { x1: x0, y1: yBelt, x2: x0, y2: yBot },
    { x1: x1, y1: yBelt, x2: x1, y2: yBot },
    { x1: x2, y1: yBelt, x2: x2, y2: yBot },
    { x1: x3, y1: yBelt, x2: x3, y2: yBot },
    { x1: x0, y1: yBot, x2: x4, y2: yBot },
    { x1: x1, y1: yBot, x2: x1 + BOT2_STEP_X, y2: yBot + BOT_SIDE_H, dashed: true },
    { x1: x4, y1: yBot, x2: x4 - BOT2_STEP_X, y2: yBot + BOT_SIDE_H, dashed: true },
  ];

  return segs;
}

export function buildTuckSlits(L) {
  const { x0, yTop } = L;
  const slit = TUCK_SLIT;
  return [
    { x1: x0, y1: yTop, x2: x0 + slit, y2: yTop },
    { x1: x0 + S - slit, y1: yTop, x2: x0 + S, y2: yTop },
  ];
}

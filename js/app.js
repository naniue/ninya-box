import {
  A4,
  BELT_FACES,
  BOT_MAIN_H,
  FACES,
  NET_H,
  NET_W,
  S,
  WINDOW_INSET_DEFAULT,
  buildCutPath,
  buildTuckSlits,
  layout,
  maxNetsOnA4,
  packNetsOnA4,
} from "./geometry.js";
import { buildContourWindow, windowPathOnNet } from "./contour.js";

const SCALE_MIN = 10;
const SCALE_MAX = 200;

function makeSlot() {
  return {
    file: null,
    url: null,
    img: null,
    rot: 0,
    scale: 100,
    windowOn: false,
  };
}

const state = {
  top: makeSlot(),
  front: makeSlot(),
  back: makeSlot(),
  left: makeSlot(),
  right: makeSlot(),
  windowEdges: {
    top: WINDOW_INSET_DEFAULT,
    bottom: WINDOW_INSET_DEFAULT,
    left: WINDOW_INSET_DEFAULT,
    right: WINDOW_INSET_DEFAULT,
  },
};

const copiesMax = maxNetsOnA4();
let copiesPerPage = copiesMax;

function clampScale(n) {
  if (!Number.isFinite(n)) return 100;
  return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) * 10) / 10;
}

const L = layout();
const svgNS = "http://www.w3.org/2000/svg";
const xlinkNS = "http://www.w3.org/1999/xlink";

const els = {
  faceList: document.querySelector("#face-list"),
  netSvg: document.querySelector("#net-svg"),
  netStage: document.querySelector("#net-stage"),
  cubeStage: document.querySelector("#cube-stage"),
  cube: document.querySelector("#cube"),
  tabNet: document.querySelector("#tab-net"),
  tabCube: document.querySelector("#tab-cube"),
  btnPdf: document.querySelector("#btn-pdf"),
  btnPrint: document.querySelector("#btn-print"),
  toast: document.querySelector("#toast"),
  exportMask: document.querySelector("#export-mask"),
  exportArtName: document.querySelector("#export-art-name"),
  exportDieName: document.querySelector("#export-die-name"),
  exportCancel: document.querySelector("#export-cancel"),
  exportConfirm: document.querySelector("#export-confirm"),
  shotMask: document.querySelector("#shot-mask"),
  shotHint: document.querySelector("#shot-hint"),
  shotStage: document.querySelector("#shot-stage"),
  shotCanvas: document.querySelector("#shot-canvas"),
  shotRect: document.querySelector("#shot-rect"),
  shotFull: document.querySelector("#shot-full"),
  shotCancel: document.querySelector("#shot-cancel"),
};

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function setFaceImage(id, file) {
  const slot = state[id];
  if (slot.url) URL.revokeObjectURL(slot.url);
  slot.file = file;
  slot.url = URL.createObjectURL(file);
  slot.img = null;
  loadImage(slot.url).then((img) => {
    slot.img = img;
    renderAll();
  });
  renderAll();
}

function canvasToFile(canvas, name) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(new File([blob], name, { type: "image/png" })), "image/png");
  });
}

function makeSample(face) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  const palettes = {
    top: ["#f2d5c8", "#c23a2b", "上"],
    front: ["#dce8d4", "#3d6b4f", "前"],
    back: ["#d9e3f2", "#2f4d7a", "后"],
    left: ["#f6e6b8", "#8a5a12", "左"],
    right: ["#eadbf2", "#6a3d7a", "右"],
  };
  const [bg, ink, word] = palettes[face.id];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 640, 640);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 18;
  ctx.strokeRect(28, 28, 584, 584);
  ctx.beginPath();
  ctx.moveTo(80, 560);
  ctx.lineTo(320, 80);
  ctx.lineTo(560, 560);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.font = "220px ZCOOL XiaoWei, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word, 320, 350);
  ctx.font = "36px Noto Sans SC, sans-serif";
  ctx.fillText("FRONT ↓", 320, 560);
  return canvasToFile(canvas, `${face.id}.png`);
}

async function fillSamples() {
  toast("正在生成示例图案…");
  for (const face of FACES) {
    const file = await makeSample(face);
    await new Promise((resolve) => {
      const slot = state[face.id];
      if (slot.url) URL.revokeObjectURL(slot.url);
      slot.file = file;
      slot.url = URL.createObjectURL(file);
      slot.rot = 0;
      slot.scale = 100;
      loadImage(slot.url).then((img) => {
        slot.img = img;
        resolve();
      });
    });
  }
  renderAll();
  toast("已填入五面示例，可直接导出试试");
}

function clearFace(id) {
  const slot = state[id];
  if (slot.url) URL.revokeObjectURL(slot.url);
  slot.file = null;
  slot.url = null;
  slot.img = null;
  slot.rot = 0;
  slot.scale = 100;
  renderAll();
}

function rotateFace(id) {
  state[id].rot = (state[id].rot + 90) % 360;
  renderAll();
}

let shotBusy = false;
let shotTarget = null;
let shotSource = null;
let shotDrag = null;

function waitForVideoFrame(video) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done || video.videoWidth < 2) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (done) return;
      if (video.videoWidth > 1) finish();
      else reject(new Error("timeout"));
    }, 5000);
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(() => finish());
    }
    video.addEventListener("loadeddata", finish, { once: true });
    if (video.readyState >= 2) finish();
  });
}

async function grabStreamFrame(stream) {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;
  await video.play();
  await waitForVideoFrame(video);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (canvas.width < 2 || canvas.height < 2) throw new Error("empty frame");
  canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0);
  video.pause();
  video.srcObject = null;
  return canvas;
}

function closeShotCrop() {
  shotTarget = null;
  shotSource = null;
  shotDrag = null;
  if (els.shotRect) els.shotRect.hidden = true;
  if (els.shotMask) els.shotMask.hidden = true;
}

function layoutShotCanvas() {
  if (!shotSource || !els.shotCanvas || !els.shotStage) return;
  const maxW = Math.max(80, els.shotStage.clientWidth - 32);
  const maxH = Math.max(80, els.shotStage.clientHeight - 32);
  const scale = Math.min(maxW / shotSource.width, maxH / shotSource.height);
  els.shotCanvas.width = Math.max(1, Math.round(shotSource.width * scale));
  els.shotCanvas.height = Math.max(1, Math.round(shotSource.height * scale));
  els.shotCanvas.getContext("2d", { alpha: false }).drawImage(
    shotSource,
    0,
    0,
    els.shotCanvas.width,
    els.shotCanvas.height
  );
}

function canvasBox() {
  const stage = els.shotStage.getBoundingClientRect();
  const canvas = els.shotCanvas.getBoundingClientRect();
  return {
    x: canvas.left - stage.left,
    y: canvas.top - stage.top,
    w: canvas.width,
    h: canvas.height,
    left: canvas.left,
    top: canvas.top,
  };
}

function setShotRect(x1, y1, x2, y2) {
  const box = canvasBox();
  const left = Math.max(box.x, Math.min(x1, x2));
  const top = Math.max(box.y, Math.min(y1, y2));
  const right = Math.min(box.x + box.w, Math.max(x1, x2));
  const bottom = Math.min(box.y + box.h, Math.max(y1, y2));
  const w = right - left;
  const h = bottom - top;
  els.shotRect.hidden = w < 2 || h < 2;
  els.shotRect.style.left = `${left}px`;
  els.shotRect.style.top = `${top}px`;
  els.shotRect.style.width = `${Math.max(0, w)}px`;
  els.shotRect.style.height = `${Math.max(0, h)}px`;
  return { left, top, w, h, box };
}

async function applyShotCrop(rect) {
  if (!shotSource || !shotTarget) return;
  const faceId = shotTarget;
  const box = rect.box;
  const sx = ((rect.left - box.x) / box.w) * shotSource.width;
  const sy = ((rect.top - box.y) / box.h) * shotSource.height;
  const sw = (rect.w / box.w) * shotSource.width;
  const sh = (rect.h / box.h) * shotSource.height;
  if (sw < 8 || sh < 8) return;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  canvas.getContext("2d", { alpha: false }).drawImage(shotSource, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const file = await canvasToFile(canvas, `${faceId}-screenshot.png`);
  closeShotCrop();
  setFaceImage(faceId, file);
  const face = FACES.find((item) => item.id === faceId);
  toast(`已截图并上传到${face ? face.label : "该面"}`);
}

async function useFullShot() {
  if (!shotSource || !shotTarget) return;
  const box = canvasBox();
  await applyShotCrop({ left: box.x, top: box.y, w: box.w, h: box.h, box });
}

function openShotCrop(faceId, source) {
  shotTarget = faceId;
  shotSource = source;
  const face = FACES.find((item) => item.id === faceId);
  els.shotHint.textContent = `拖拽框选区域，松开后自动上传到「${face ? face.label : "该面"}」。Esc 取消，也可使用整张。`;
  els.shotRect.hidden = true;
  els.shotMask.hidden = false;
  layoutShotCanvas();
}

async function captureFaceScreenshot(id) {
  if (shotBusy) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast("当前浏览器不支持截图，请改用点击缩略图上传");
    return;
  }
  shotBusy = true;
  toast("请选择要截取的屏幕或窗口");
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    shotBusy = false;
    if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
      toast("已取消截图");
      return;
    }
    toast("无法启动截图");
    return;
  }
  try {
    const frame = await grabStreamFrame(stream);
    openShotCrop(id, frame);
  } catch (err) {
    console.error(err);
    toast("截图失败，请再试一次");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    shotBusy = false;
  }
}

function bindShotCrop() {
  if (!els.shotMask) return;
  els.shotCancel.addEventListener("click", closeShotCrop);
  els.shotFull.addEventListener("click", () => {
    useFullShot();
  });
  els.shotStage.addEventListener("pointerdown", (e) => {
    if (!shotSource || e.button !== 0) return;
    const stage = els.shotStage.getBoundingClientRect();
    shotDrag = {
      x: e.clientX - stage.left,
      y: e.clientY - stage.top,
    };
    els.shotStage.setPointerCapture(e.pointerId);
    setShotRect(shotDrag.x, shotDrag.y, shotDrag.x, shotDrag.y);
  });
  els.shotStage.addEventListener("pointermove", (e) => {
    if (!shotDrag) return;
    const stage = els.shotStage.getBoundingClientRect();
    setShotRect(shotDrag.x, shotDrag.y, e.clientX - stage.left, e.clientY - stage.top);
  });
  els.shotStage.addEventListener("pointerup", async (e) => {
    if (!shotDrag) return;
    const stage = els.shotStage.getBoundingClientRect();
    const rect = setShotRect(shotDrag.x, shotDrag.y, e.clientX - stage.left, e.clientY - stage.top);
    shotDrag = null;
    if (rect.w >= 8 && rect.h >= 8) await applyShotCrop(rect);
  });
  els.shotStage.addEventListener("dblclick", () => {
    useFullShot();
  });
  window.addEventListener("resize", () => {
    if (!els.shotMask.hidden) layoutShotCanvas();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.shotMask.hidden) {
      e.preventDefault();
      closeShotCrop();
    }
  });
}

function renderFaceList() {
  els.faceList.innerHTML = FACES.map((face) => {
    const slot = state[face.id];
    const scale = slot.scale ?? 100;
    const disabled = slot.url ? "" : "disabled";
    return `
      <article class="face-card" data-face="${face.id}">
        <label class="thumb" title="点击上传 ${face.label}" style="--scale:${scale / 100}">
          ${
            slot.url
              ? `<img src="${slot.url}" alt="${face.label}" style="transform:rotate(${slot.rot}deg)">`
              : `<span class="ph">${face.short}</span>`
          }
          ${
            face.canWindow && slot.windowOn
              ? `<span class="window-preview" style="${windowPreviewStyle(face.id)}"></span>`
              : ""
          }
          <input class="hidden-file" type="file" accept="image/*" data-upload="${face.id}">
        </label>
        <div class="face-meta">
          <div class="name">${face.label}</div>
          <div class="hint">${face.hint}</div>
        </div>
        <div class="face-actions">
          <button class="icon-btn" type="button" data-shot="${face.id}" title="截图上传">截</button>
          <button class="icon-btn" type="button" data-rotate="${face.id}" title="旋转" ${disabled}>↻</button>
          <button class="icon-btn" type="button" data-clear="${face.id}" title="清除" ${disabled}>✕</button>
        </div>
        <label class="scale-row">
          <span>缩放</span>
          <input type="range" min="${SCALE_MIN}" max="${SCALE_MAX}" step="0.5" value="${scale}" data-scale-range="${face.id}" ${disabled}>
          <input class="scale-num" type="number" min="${SCALE_MIN}" max="${SCALE_MAX}" step="0.1" value="${scale}" data-scale="${face.id}" ${disabled}>
          <span class="unit">%</span>
        </label>
        ${
          face.canWindow
            ? `<label class="window-row">
                <input type="checkbox" data-window="${face.id}" ${slot.windowOn ? "checked" : ""}>
                <span>巡边开窗</span>
                <span class="win-tip">沿图案轮廓</span>
              </label>`
            : ""
        }
      </article>
    `;
  }).join("");
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "href") {
      node.setAttribute("href", v);
      node.setAttributeNS(xlinkNS, "href", v);
    } else node.setAttribute(k, v);
  }
  return node;
}

function faceImage(faceId, rect) {
  const slot = state[faceId];
  if (!slot.url) return null;
  const zoom = (slot.scale ?? 100) / 100;
  const rot = (rect.netRotate + slot.rot) % 360;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = rect.w * zoom;
  const h = rect.h * zoom;
  const g = svgEl("g");
  g.appendChild(
    svgEl("rect", {
      x: String(rect.x),
      y: String(rect.y),
      width: String(rect.w),
      height: String(rect.h),
      fill: "#ffffff",
    })
  );
  g.appendChild(
    svgEl("image", {
      href: slot.url,
      x: String(cx - w / 2),
      y: String(cy - h / 2),
      width: String(w),
      height: String(h),
      preserveAspectRatio: "xMidYMid slice",
      transform: `rotate(${rot} ${cx} ${cy})`,
    })
  );
  return g;
}

function renderNet() {
  const svg = els.netSvg;
  const pad = 8;
  svg.setAttribute("viewBox", `${L.ox - pad} ${L.oy - pad} ${NET_W + pad * 2} ${NET_H + pad * 2 + 10}`);
  svg.setAttribute("xmlns", svgNS);
  svg.replaceChildren();

  svg.appendChild(
    svgEl("rect", {
      x: String(L.ox - pad),
      y: String(L.oy - pad),
      width: String(NET_W + pad * 2),
      height: String(NET_H + pad * 2 + 10),
      fill: "#fffdf8",
    })
  );

  const defs = svgEl("defs");
  const clip = svgEl("clipPath", { id: "net-clip" });
  clip.appendChild(svgEl("path", { d: buildCutPath(L) }));
  defs.appendChild(clip);
  for (const [id, rect] of Object.entries(L.faces)) {
    const faceClip = svgEl("clipPath", { id: `face-clip-${id}` });
    faceClip.appendChild(
      svgEl("rect", {
        x: String(rect.x),
        y: String(rect.y),
        width: String(rect.w),
        height: String(rect.h),
      })
    );
    defs.appendChild(faceClip);
  }
  svg.appendChild(defs);

  const art = svgEl("g", { "clip-path": "url(#net-clip)" });
  for (const [id, rect] of Object.entries(L.faces)) {
    const img = faceImage(id, rect);
    if (img) {
      img.setAttribute("clip-path", `url(#face-clip-${id})`);
      art.appendChild(img);
    } else {
      art.appendChild(
        svgEl("rect", {
          x: String(rect.x),
          y: String(rect.y),
          width: String(rect.w),
          height: String(rect.h),
          fill: "#f3eee4",
        })
      );
      const label = svgEl("text", {
        x: String(rect.x + rect.w / 2),
        y: String(rect.y + rect.h / 2 + 2.2),
        "text-anchor": "middle",
        fill: "#b7a890",
        "font-size": "7",
        "font-family": "ZCOOL XiaoWei, serif",
      });
      label.textContent = FACES.find((f) => f.id === id).short;
      art.appendChild(label);
    }
  }
  svg.appendChild(art);

  const cut = svgEl("path", {
    d: buildCutPath(L),
    fill: "none",
    stroke: "#161616",
    "stroke-width": "0.42",
    "stroke-linejoin": "round",
  });
  svg.appendChild(cut);

  for (const slit of buildTuckSlits(L)) {
    svg.appendChild(
      svgEl("line", {
        x1: String(slit.x1),
        y1: String(slit.y1),
        x2: String(slit.x2),
        y2: String(slit.y2),
        stroke: "#161616",
        "stroke-width": "0.42",
      })
    );
  }

  for (const [id, rect] of Object.entries(L.faces)) {
    const g = svgEl("g", { class: "net-face", "data-face": id });
    g.appendChild(
      svgEl("rect", {
        class: "face-hit",
        x: String(rect.x),
        y: String(rect.y),
        width: String(rect.w),
        height: String(rect.h),
        fill: "transparent",
      })
    );
    svg.appendChild(g);
  }

  const dimY = L.yBot + BOT_MAIN_H + 8;
  const dim = svgEl("g", { fill: "#7a7166", "font-size": "2.6", "font-family": "Noto Sans SC, sans-serif" });
  dim.appendChild(
    svgEl("line", {
      x1: String(L.x0),
      y1: String(dimY),
      x2: String(L.x0 + S),
      y2: String(dimY),
      stroke: "#7a7166",
      "stroke-width": "0.18",
    })
  );
  const dimText = svgEl("text", {
    x: String(L.x0 + S / 2),
    y: String(dimY + 4),
    "text-anchor": "middle",
  });
  dimText.textContent = "核验边 = 38.0 mm";
  dim.appendChild(dimText);
  svg.appendChild(dim);

  const legend = svgEl("text", {
    x: String(L.x0 + S * 2),
    y: String(dimY + 4),
    fill: "#8a8176",
    "font-size": "2.6",
    "font-family": "Noto Sans SC, sans-serif",
  });
  legend.textContent = "黑线为裁切线（含开窗）";
  svg.appendChild(legend);

  drawWindowCutsSvg(svg, L, "0.42");
}

let windowCache = { key: "", wins: [] };

function windowGroups() {
  const groups = [];
  if (state.top.windowOn) groups.push(["top"]);
  let current = [];
  for (const id of BELT_FACES) {
    if (state[id].windowOn) {
      current.push(id);
    } else if (current.length) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function activeWindowSpecs() {
  const groups = windowGroups();
  if (!groups.length) return [];
  const e = state.windowEdges;
  const key = [
    groups.map((g) => g.join("+")).join(";"),
    e.top,
    e.bottom,
    e.left,
    e.right,
    ...FACES.map((f) => [state[f.id].url, state[f.id].rot, state[f.id].scale].join(":")),
  ].join("|");
  if (windowCache.key === key) return windowCache.wins;
  const wins = groups
    .map((faceIds) => {
      const origin = faceIds[0];
      const win = buildContourWindow({
        slot: state[origin],
        edges: e,
        span: faceIds.length,
      });
      if (!win) return null;
      win.faceIds = faceIds;
      win.origin = origin;
      return win;
    })
    .filter(Boolean);
  windowCache = { key, wins };
  return wins;
}

function windowPreviewStyle(faceId) {
  const e = state.windowEdges;
  const group = windowGroups().find((g) => g.includes(faceId)) || [faceId];
  const top = (e.top / S) * 100;
  const bottom = (e.bottom / S) * 100;
  const left = group[0] === faceId ? (e.left / S) * 100 : 0;
  const right = group[group.length - 1] === faceId ? (e.right / S) * 100 : 0;
  return `top:${top}%;bottom:${bottom}%;left:${left}%;right:${right}%`;
}

function windowOn() {
  return FACES.some((face) => state[face.id].windowOn);
}

function syncEdgePanel() {
  const box = document.querySelector("#window-edges");
  if (!box) return;
  box.classList.toggle("is-off", !windowOn());
  for (const key of ["top", "bottom", "left", "right"]) {
    const input = box.querySelector(`[data-edge="${key}"]`);
    if (input && document.activeElement !== input) input.value = String(state.windowEdges[key]);
  }
}

function clampEdge(key, raw) {
  const max = key === "left" || key === "right" ? 30 : 18;
  const n = Number(raw);
  if (!Number.isFinite(n)) return state.windowEdges[key];
  const value = Math.round(Math.min(max, Math.max(0.2, n)) * 10) / 10;
  const next = { ...state.windowEdges, [key]: value };
  if (S - next.top - next.bottom < 2) {
    if (key === "top") next.top = Math.max(0.2, S - next.bottom - 2);
    if (key === "bottom") next.bottom = Math.max(0.2, S - next.top - 2);
  }
  state.windowEdges = next;
  return next[key];
}

function drawWindowCutsSvg(svg, netL, strokeWidth) {
  for (const win of activeWindowSpecs()) {
    const origin = netL.faces[win.origin];
    if (!origin) continue;
    const d = windowPathOnNet(win, origin);
    if (!d) continue;
    svg.appendChild(
      svgEl("path", {
        d,
        fill: "none",
        stroke: "#111111",
        "stroke-width": strokeWidth,
        "stroke-linejoin": "round",
        class: "window-cut",
      })
    );
  }
}

function faceTextureWithWindow(faceId, slot, size) {
  const win = activeWindowSpecs().find((item) => item.faceIds.includes(faceId));
  if (!win) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  if (slot.img) {
    drawCover(ctx, slot.img, 0, 0, size, size, slot.rot, (slot.scale ?? 100) / 100);
  }
  const scale = size / S;
  const shift = -win.faceIds.indexOf(faceId) * S;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  win.local.forEach((p, i) => {
    const x = (p.x + shift) * scale;
    const y = p.y * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return canvas.toDataURL("image/png");
}

const CUBE_BASE = {
  front: "rotateY(0deg) translateZ(80px)",
  back: "rotateY(180deg) translateZ(80px)",
  left: "rotateY(-90deg) translateZ(80px)",
  right: "rotateY(90deg) translateZ(80px)",
  top: "rotateX(90deg) translateZ(80px)",
};

function renderCube() {
  for (const face of FACES) {
    const el = els.cube.querySelector(`[data-side="${face.id}"]`);
    const slot = state[face.id];
    const zoom = slot.scale ?? 100;
    el.style.backgroundColor = "#ffffff";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.querySelector(".window-hole")?.remove();
    const windowed = face.canWindow && state[face.id].windowOn && faceTextureWithWindow(face.id, slot, 256);
    if (windowed) {
      el.style.transform = CUBE_BASE[face.id];
      el.style.backgroundImage = `url("${windowed}")`;
      el.style.backgroundSize = "100% 100%";
      el.querySelector(".ph-text")?.remove();
    } else {
      el.style.transform = `${CUBE_BASE[face.id]} rotate(${slot.rot}deg)`;
      el.style.backgroundSize = `${zoom}%`;
      if (slot.url) {
        el.style.backgroundImage = `url("${slot.url}")`;
        el.querySelector(".ph-text")?.remove();
      } else {
        el.style.backgroundImage = "";
        el.style.backgroundSize = "cover";
        let label = el.querySelector(".ph-text");
        if (!label) {
          label = document.createElement("span");
          label.className = "ph-text";
          el.appendChild(label);
        }
        label.textContent = face.short;
      }
    }
  }
}

function renderAll() {
  renderFaceList();
  renderNet();
  renderCube();
  syncEdgePanel();
}

function syncScaleInputs(id, value) {
  const card = els.faceList.querySelector(`[data-face="${id}"]`);
  if (!card) return;
  const num = card.querySelector("[data-scale]");
  const range = card.querySelector("[data-scale-range]");
  const thumb = card.querySelector(".thumb");
  if (num && document.activeElement !== num) num.value = String(value);
  if (range) range.value = String(value);
  if (thumb) thumb.style.setProperty("--scale", String(value / 100));
}

function applyFaceScale(id, raw, shouldClamp) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  if (!shouldClamp && (n < 1 || n > SCALE_MAX)) return;
  const value = shouldClamp ? clampScale(n) : Math.round(n * 10) / 10;
  state[id].scale = value;
  syncScaleInputs(id, value);
  renderNet();
  renderCube();
}

function bindFaceList() {
  els.faceList.addEventListener("change", (e) => {
    const id = e.target.dataset.upload;
    const file = e.target.files && e.target.files[0];
    if (id && file) setFaceImage(id, file);
    if (e.target.dataset.scale) {
      applyFaceScale(e.target.dataset.scale, e.target.value, true);
      e.target.value = String(state[e.target.dataset.scale].scale);
    }
  });
  els.faceList.addEventListener("input", (e) => {
    const rangeId = e.target.dataset.scaleRange;
    const numId = e.target.dataset.scale;
    if (rangeId) applyFaceScale(rangeId, e.target.value, true);
    if (numId) applyFaceScale(numId, e.target.value, false);
  });
  els.faceList.addEventListener("click", (e) => {
    const shot = e.target.closest("[data-shot]");
    const rot = e.target.closest("[data-rotate]");
    const clr = e.target.closest("[data-clear]");
    if (shot) captureFaceScreenshot(shot.dataset.shot);
    if (rot) rotateFace(rot.dataset.rotate);
    if (clr) clearFace(clr.dataset.clear);
  });
  els.faceList.addEventListener("change", (e) => {
    if (!e.target.dataset.window) return;
    const id = e.target.dataset.window;
    state[id].windowOn = e.target.checked;
    renderAll();
  });
}

function faceAtEvent(e) {
  const g = e.target.closest("[data-face]");
  if (g) return g.dataset.face;
  const ctm = els.netSvg.getScreenCTM();
  if (!ctm) return null;
  const pt = els.netSvg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const loc = pt.matrixTransform(ctm.inverse());
  for (const [id, rect] of Object.entries(L.faces)) {
    if (loc.x >= rect.x && loc.x <= rect.x + rect.w && loc.y >= rect.y && loc.y <= rect.y + rect.h) {
      return id;
    }
  }
  return null;
}

function bindNetUpload() {
  els.netSvg.addEventListener("click", (e) => {
    const id = faceAtEvent(e);
    if (!id) return;
    const input = document.querySelector(`[data-upload="${id}"]`);
    if (input) input.click();
  });

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  ["dragenter", "dragover", "dragleave", "drop"].forEach((type) => {
    document.addEventListener(type, prevent);
  });
  els.netSvg.addEventListener("drop", (e) => {
    const id = faceAtEvent(e);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (id && file && file.type.startsWith("image/")) setFaceImage(id, file);
  });
  els.faceList.addEventListener("drop", (e) => {
    const card = e.target.closest("[data-face]");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (card && file && file.type.startsWith("image/")) setFaceImage(card.dataset.face, file);
  });
}

function bindTabs() {
  els.tabNet.addEventListener("click", () => {
    els.tabNet.classList.add("active");
    els.tabCube.classList.remove("active");
    els.netStage.classList.remove("hidden");
    els.cubeStage.classList.add("hidden");
  });
  els.tabCube.addEventListener("click", () => {
    els.tabCube.classList.add("active");
    els.tabNet.classList.remove("active");
    els.cubeStage.classList.remove("hidden");
    els.netStage.classList.add("hidden");
  });
}

function bindCubeDrag() {
  let rotX = -22;
  let rotY = 32;
  let dragging = false;
  let lx = 0;
  let ly = 0;

  const apply = () => {
    els.cube.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  };
  apply();

  els.cubeStage.addEventListener("pointerdown", (e) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    els.cubeStage.setPointerCapture(e.pointerId);
  });
  els.cubeStage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    rotY += e.clientX - lx;
    rotX -= e.clientY - ly;
    rotX = Math.max(-70, Math.min(70, rotX));
    lx = e.clientX;
    ly = e.clientY;
    apply();
  });
  els.cubeStage.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function mmToPx(mm, dpi) {
  return (mm * dpi) / 25.4;
}

function drawCover(ctx, img, x, y, w, h, rotation, zoom = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.fillRect(x, y, w, h);
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const tw = w * zoom;
  const th = h * zoom;
  const ir = img.width / img.height;
  let dw;
  let dh;
  if (ir > 1) {
    dh = th;
    dw = dh * ir;
  } else {
    dw = tw;
    dh = dw / ir;
  }
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function parsePathToCanvas(ctx, d, scale) {
  const cmd = d.match(/[MLZA]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!cmd) return;
  ctx.beginPath();
  let i = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === "M") {
      x = parseFloat(cmd[++i]) * scale;
      y = parseFloat(cmd[++i]) * scale;
      ctx.moveTo(x, y);
      sx = x;
      sy = y;
      i += 1;
    } else if (c === "L") {
      x = parseFloat(cmd[++i]) * scale;
      y = parseFloat(cmd[++i]) * scale;
      ctx.lineTo(x, y);
      i += 1;
    } else if (c === "A") {
      const rx = parseFloat(cmd[++i]) * scale;
      const ry = parseFloat(cmd[++i]) * scale;
      const rot = parseFloat(cmd[++i]);
      const large = parseInt(cmd[++i], 10);
      const sweep = parseInt(cmd[++i], 10);
      const x2 = parseFloat(cmd[++i]) * scale;
      const y2 = parseFloat(cmd[++i]) * scale;
      canvasArc(ctx, x, y, rx, ry, rot, large, sweep, x2, y2);
      x = x2;
      y = y2;
      i += 1;
    } else if (c === "Z" || c === "z") {
      ctx.closePath();
      x = sx;
      y = sy;
      i += 1;
    } else {
      i += 1;
    }
  }
}

function canvasArc(ctx, x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-6 || ry < 1e-6) {
    ctx.lineTo(x2, y2);
    return;
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  let x1p = cos * dx + sin * dy;
  let y1p = -sin * dx + cos * dy;
  let lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  let sq =
    (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) /
    (rx * rx * y1p * y1p + ry * ry * x1p * x1p);
  sq = Math.max(0, sq);
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(sq);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const a = (ux, uy, vx, vy) => {
    const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let ang = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n)));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  };
  const start = a(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = a((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 16)));
  for (let i = 1; i <= steps; i++) {
    const t = start + (delta * i) / steps;
    const px = cx + rx * Math.cos(t);
    const py = cy + ry * Math.sin(t);
    ctx.lineTo(px, py);
  }
}

function drawNetOnCanvas(ctx, netL, px, { patterns = true, cutLines = true } = {}) {
  if (patterns) {
    ctx.save();
    parsePathToCanvas(ctx, buildCutPath(netL), px);
    ctx.clip();
    for (const [id, rect] of Object.entries(netL.faces)) {
      const slot = state[id];
      if (!slot.img) continue;
      drawCover(
        ctx,
        slot.img,
        rect.x * px,
        rect.y * px,
        rect.w * px,
        rect.h * px,
        rect.netRotate + slot.rot,
        (slot.scale ?? 100) / 100
      );
    }
    ctx.restore();
  }

  if (!cutLines) return;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 0.28 * px;
  parsePathToCanvas(ctx, buildCutPath(netL), px);
  ctx.stroke();

  ctx.beginPath();
  for (const slit of buildTuckSlits(netL)) {
    ctx.moveTo(slit.x1 * px, slit.y1 * px);
    ctx.lineTo(slit.x2 * px, slit.y2 * px);
  }
  ctx.stroke();

  for (const win of activeWindowSpecs()) {
    const origin = netL.faces[win.origin];
    if (!origin) continue;
    const d = windowPathOnNet(win, origin);
    if (!d) continue;
    parsePathToCanvas(ctx, d, px);
    ctx.stroke();
  }
}

function renderSheetCanvas(dpi = 300, options = {}) {
  const scale = dpi / 25.4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(mmToPx(A4.w, dpi));
  canvas.height = Math.round(mmToPx(A4.h, dpi));
  const ctx = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const packed = packNetsOnA4(copiesPerPage);
  for (const pos of packed.positions) {
    drawNetOnCanvas(ctx, layout(pos.x, pos.y), scale, options);
  }

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= 252 && data[i + 1] >= 252 && data[i + 2] >= 252) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);

  return canvas;
}

async function waitForImages() {
  const pending = Object.values(state)
    .filter((s) => s.url && !s.img)
    .map((s) => loadImage(s.url).then((img) => (s.img = img)));
  await Promise.all(pending);
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("png blob failed"));
    }, "image/png");
  });
}

function sanitizeFilename(name, fallback) {
  let n = String(name || "").trim();
  n = n.replace(/[\\/:*?"<>|]+/g, "-");
  if (!n) n = fallback;
  if (!/\.png$/i.test(n)) n += ".png";
  return n;
}

async function downloadPngBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PNG_PICKER_TYPES = [{ description: "PNG 图片", accept: { "image/png": [".png"] } }];

async function pickSaveFile(filename) {
  if (typeof window.showSaveFilePicker !== "function") return null;
  return window.showSaveFilePicker({
    suggestedName: filename,
    types: PNG_PICKER_TYPES,
  });
}

async function writePng(canvas, filename, handle) {
  const blob = await canvasToPngBlob(canvas);
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  await downloadPngBlob(blob, filename);
}

function openExportDialog() {
  els.exportMask.hidden = false;
  els.exportArtName?.focus();
  els.exportArtName?.select();
}

function closeExportDialog() {
  els.exportMask.hidden = true;
}

async function exportPng() {
  const artName = sanitizeFilename(els.exportArtName.value, "忍喵小盒子-3.8cm-展开图.png");
  const dieName = sanitizeFilename(els.exportDieName.value, "忍喵小盒子-3.8cm-刀版图.png");
  els.exportArtName.value = artName;
  els.exportDieName.value = dieName;
  closeExportDialog();

  let artHandle = null;
  let dieHandle = null;
  if (typeof window.showSaveFilePicker === "function") {
    try {
      artHandle = await pickSaveFile(artName);
    } catch (err) {
      if (err && err.name === "AbortError") {
        toast("已取消导出");
        return;
      }
      throw err;
    }
    try {
      dieHandle = await pickSaveFile(dieName);
    } catch (err) {
      if (err && err.name === "AbortError") {
        dieHandle = false;
      } else {
        throw err;
      }
    }
  }
  els.btnPdf.disabled = true;
  els.btnPdf.textContent = "正在导出…";
  try {
    await waitForImages();
    const art = renderSheetCanvas(300, { patterns: true, cutLines: false });
    await writePng(art, artName, artHandle);
    if (dieHandle === false) {
      toast("平面图已保存，刀版图已取消");
      return;
    }
    const die = renderSheetCanvas(300, { patterns: false, cutLines: true });
    await writePng(die, dieName, dieHandle);
    toast(`已导出平面图和刀版图，本页 ${packNetsOnA4(copiesPerPage).count} 个，打印请选 100%`);
  } catch (err) {
    console.error(err);
    toast("导出失败，请换一张图片再试");
  } finally {
    els.btnPdf.disabled = false;
    els.btnPdf.textContent = "导出 A4 PNG";
  }
}

function bindExportDialog() {
  els.btnPdf.addEventListener("click", openExportDialog);
  els.exportCancel.addEventListener("click", closeExportDialog);
  els.exportConfirm.addEventListener("click", exportPng);
  els.exportMask.addEventListener("click", (e) => {
    if (e.target === els.exportMask) closeExportDialog();
  });
  els.exportMask.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      exportPng();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.exportMask.hidden) closeExportDialog();
  });
}

async function printSheet() {
  await waitForImages();
  const canvas = renderSheetCanvas(300);
  const blob = await canvasToPngBlob(canvas);
  const url = URL.createObjectURL(blob);
  const win = window.open("", "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    toast("浏览器拦截了打印窗口，请允许弹窗");
    return;
  }
  win.document.write(`
    <html>
      <head>
        <title>忍喵小盒子展开图</title>
        <style>
          @page { size: A4; margin: 0; }
          html, body { margin: 0; padding: 0; background: #fff; }
          img { width: 210mm; height: 297mm; display: block; }
        </style>
      </head>
      <body>
        <img src="${url}" />
        <script>window.onload = () => { window.print(); };<\/script>
      </body>
    </html>
  `);
  win.document.close();
}

function bindCopies() {
  const input = document.querySelector("#copies-input");
  const maxEl = document.querySelector("#copies-max");
  if (maxEl) maxEl.textContent = String(copiesMax);
  if (!input) return;
  input.max = String(copiesMax);
  input.value = String(copiesPerPage);
  input.addEventListener("change", () => {
    const requested = Number(input.value);
    const packed = packNetsOnA4(requested);
    copiesPerPage = packed.count;
    input.value = String(copiesPerPage);
    if (requested > copiesMax) toast(`A4 按 3.8cm 最多放 ${copiesMax} 个`);
  });
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (!Number.isFinite(n) || n < 1) return;
    copiesPerPage = Math.min(Math.round(n), copiesMax);
  });
}

function bindWindowEdges() {
  const box = document.querySelector("#window-edges");
  if (!box) return;
  const apply = (el, clampNow) => {
    if (!el.dataset.edge) return;
    const n = Number(el.value);
    if (!clampNow && !Number.isFinite(n)) return;
    clampEdge(el.dataset.edge, el.value);
    if (clampNow) el.value = String(state.windowEdges[el.dataset.edge]);
    syncEdgePanel();
    renderFaceList();
    renderNet();
    renderCube();
  };
  box.addEventListener("input", (e) => apply(e.target, false));
  box.addEventListener("change", (e) => apply(e.target, true));
}

bindFaceList();
bindShotCrop();
bindNetUpload();
bindTabs();
bindCubeDrag();
bindCopies();
bindWindowEdges();
bindExportDialog();
els.btnPrint.addEventListener("click", printSheet);
document.querySelector("#btn-demo").addEventListener("click", fillSamples);
renderAll();

const bootParams = new URLSearchParams(location.search);
if (bootParams.get("view") === "cube") {
  els.tabCube.click();
}
if (bootParams.has("demo")) {
  fillSamples();
}

import { S } from "./geometry.js";

const PX = 8;

function drawCover(ctx, img, x, y, w, h, rotation, zoom) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
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

function colorDist(data, i, r, g, b) {
  const dr = data[i] - r;
  const dg = data[i + 1] - g;
  const db = data[i + 2] - b;
  return Math.hypot(dr, dg, db);
}

function floodBackground(data, w, h, tol = 40) {
  const bg = new Uint8Array(w * h);
  const q = [];
  const seeds = [
    0,
    w - 1,
    w * (h - 1),
    w * h - 1,
    w >> 1,
    w * (h >> 1),
    w * (h >> 1) + w - 1,
    w * (h - 1) + (w >> 1),
  ];
  for (const i of seeds) {
    if (bg[i]) continue;
    bg[i] = 1;
    q.push({ i, r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] });
  }
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const x = cur.i % w;
    const y = (cur.i - x) / w;
    const neigh = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (bg[ni]) continue;
      if (colorDist(data, ni * 4, cur.r, cur.g, cur.b) > tol) continue;
      bg[ni] = 1;
      q.push({ i: ni, r: cur.r, g: cur.g, b: cur.b });
    }
  }
  return bg;
}

function dilate(src, w, h, radius) {
  if (radius < 1) return src;
  const out = new Uint8Array(w * h);
  const r = Math.ceil(radius);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= r * r) {
            out[yy * w + xx] = 1;
          }
        }
      }
    }
  }
  return out;
}

function subjectMask(img, rot, zoom) {
  const size = S * PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  drawCover(ctx, img, 0, 0, size, size, rot, zoom);
  const { data } = ctx.getImageData(0, 0, size, size);
  const bg = floodBackground(data, size, size);
  const sub = new Uint8Array(size * size);
  let count = 0;
  for (let i = 0; i < sub.length; i++) {
    if (!bg[i]) {
      sub[i] = 1;
      count += 1;
    }
  }
  if (count < size * 8 || count > size * size * 0.92) return null;
  return { mask: sub, size };
}

function rightmostX(mask, size, y) {
  const row = y * size;
  for (let x = size - 1; x >= 0; x--) {
    if (mask[row + x]) return x;
  }
  return -1;
}

function rdp(points, epsilon) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxD = 0;
  let idx = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * points[i].x - dx * points[i].y + last.x * first.y - last.y * first.x) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointsToPath(points) {
  if (!points.length) return "";
  const r = (n) => Math.round(n * 100) / 100;
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${r(p.x)} ${r(p.y)}`)
    .join(" ")
    .concat(" Z");
}

function clampMm(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function rotateLocal(p, deg) {
  if (!deg) return p;
  const rad = (deg * Math.PI) / 180;
  const cx = S / 2;
  const cy = S / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/**
 * One window band on a single face, or across consecutive belt faces.
 * Top and bottom stay the same horizontal Y. Left may hug artwork.
 */
export function buildContourWindow({ slot, edges, span = 1 }) {
  const faces = Math.max(1, span);
  const top = clampMm(edges?.top ?? 3, 0.2, 18);
  const bottom = clampMm(edges?.bottom ?? 3, 0.2, 18);
  const left = clampMm(edges?.left ?? 3, 0.2, 30);
  const rightIn = clampMm(edges?.right ?? 3, 0.2, 30);
  const size = S * PX;

  let subject = null;
  if (slot?.img) {
    subject = subjectMask(slot.img, slot.rot || 0, (slot.scale ?? 100) / 100);
    if (subject) subject.mask = dilate(subject.mask, size, size, Math.max(1, 2 * PX));
  }

  let yTop = top;
  let yBot = S - bottom;
  if (yBot - yTop < 2) {
    const mid = (yTop + yBot) / 2;
    yTop = mid - 1;
    yBot = mid + 1;
  }
  const xLeftMin = left;
  const xRight = faces * S - rightIn;

  const edgeX = (py) => {
    let x = xLeftMin;
    if (subject) {
      const row = Math.max(0, Math.min(size - 1, py));
      const rx = rightmostX(subject.mask, size, row);
      if (rx >= 0) {
        x = Math.min(S - 0.8, Math.max(xLeftMin, rx / PX));
      }
    }
    return Math.max(xLeftMin, Math.min(x, xRight - 1.2));
  };

  const yStart = Math.round(yTop * PX);
  const yEnd = Math.round(yBot * PX);
  const raw = [];
  for (let py = yEnd; py >= yStart; py--) {
    raw.push({ x: edgeX(py), y: py / PX });
  }

  const xLeftBot = edgeX(yEnd);
  const xLeftTop = edgeX(yStart);
  const inner = rdp(raw, 0.32).filter((p) => p.y > yTop + 0.12 && p.y < yBot - 0.12);

  const points = [
    { x: xRight, y: yTop },
    { x: xRight, y: yBot },
    { x: xLeftBot, y: yBot },
    ...inner,
    { x: xLeftTop, y: yTop },
  ];

  return {
    local: points,
    pathD: pointsToPath(points),
    yTop,
    yBot,
    xLeft: xLeftMin,
    xRight,
    span: faces,
  };
}

export function windowPathOnNet(win, originRect) {
  if (!win) return "";
  const ox = originRect.x;
  const oy = originRect.y;
  const rot = originRect.netRotate || 0;
  const r = (n) => Math.round(n * 100) / 100;
  return win.local
    .map((p, i) => {
      const q = rotateLocal(p, rot);
      return `${i === 0 ? "M" : "L"} ${r(ox + q.x)} ${r(oy + q.y)}`;
    })
    .join(" ")
    .concat(" Z");
}

export function windowPathForFace(win, faceId) {
  if (!win?.faceIds?.includes(faceId)) return null;
  const x0 = win.faceIds.indexOf(faceId) * S;
  const x1 = x0 + S;
  const pts = win.local.map((p) => ({
    x: Math.max(0, Math.min(S, Math.max(x0, Math.min(x1, p.x)) - x0)),
    y: p.y,
  }));
  return pointsToPath(pts);
}

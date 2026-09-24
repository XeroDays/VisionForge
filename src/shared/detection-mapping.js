(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    root.VisionForgeDetectionMapping = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  function yoloNorm(pixels, size) {
    const dim = Math.max(Number(size) || 1, 1);
    return Number(clamp01(pixels / dim).toFixed(6));
  }

  function snapPixelRect(rect) {
    const x = Math.round(Number(rect?.x) || 0);
    const y = Math.round(Number(rect?.y) || 0);
    const x2 = Math.round((Number(rect?.x) || 0) + (Number(rect?.width) || 0));
    const y2 = Math.round((Number(rect?.y) || 0) + (Number(rect?.height) || 0));
    return {
      x,
      y,
      width: Math.max(1, x2 - x),
      height: Math.max(1, y2 - y),
      angle: Number.isFinite(Number(rect?.angle)) ? Number(rect.angle) : undefined,
    };
  }

  function valueToRect(value, imgW, imgH) {
    if (!value || typeof value !== "object") return null;
    const xmin = Number(value.xmin);
    const ymin = Number(value.ymin);
    const xmax = Number(value.xmax);
    const ymax = Number(value.ymax);
    if ([xmin, ymin, xmax, ymax].every(Number.isFinite)) {
      const rect = { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin };
      if (Number.isFinite(Number(value.angle))) rect.angle = Number(value.angle);
      return rect;
    }
    const xc = Number(value.xc);
    const yc = Number(value.yc);
    const w = Number(value.w);
    const h = Number(value.h);
    if (![xc, yc, w, h].every(Number.isFinite) || !imgW || !imgH) return null;
    const rect = {
      x: (xc - w / 2) * imgW,
      y: (yc - h / 2) * imgH,
      width: w * imgW,
      height: h * imgH,
    };
    if (Number.isFinite(Number(value.angle))) rect.angle = Number(value.angle);
    return rect;
  }

  function rectToValue(rect, imgW, imgH, options = {}) {
    const snapped = snapPixelRect(rect);
    const x1 = snapped.x;
    const y1 = snapped.y;
    const x2 = snapped.x + snapped.width;
    const y2 = snapped.y + snapped.height;
    const keepAngle = Boolean(options.obb) || Number.isFinite(Number(rect?.angle)) || Number.isFinite(Number(options.angle));
    if (options.voc && !options.obb) {
      const value = { xmin: x1, ymin: y1, xmax: x2, ymax: y2 };
      if (keepAngle) {
        const angle = Number.isFinite(Number(rect?.angle)) ? Number(rect.angle) : Number(options.angle) || 0;
        value.angle = Number(angle.toFixed(2));
      }
      return value;
    }
    const value = {
      xc: yoloNorm((x1 + x2) / 2, imgW),
      yc: yoloNorm((y1 + y2) / 2, imgH),
      w: yoloNorm(x2 - x1, imgW),
      h: yoloNorm(y2 - y1, imgH),
    };
    if (keepAngle) {
      const angle = Number.isFinite(Number(rect?.angle)) ? Number(rect.angle) : Number(options.angle) || 0;
      value.angle = Number(angle.toFixed(2));
    }
    return value;
  }

  function mapModelDetection(item, options = {}) {
    if (!item || typeof item !== "object") return null;
    const imgW = Number(options.imgW) || 0;
    const imgH = Number(options.imgH) || 0;
    const labelid = Number.isInteger(Number(item.labelid)) ? Number(item.labelid) : 0;
    const score = Number.isFinite(Number(item.score)) ? Number(Number(item.score).toFixed(4)) : null;
    const angle = Number(item.angle);
    const hasAngle = Boolean(options.obb) || Number.isFinite(angle);

    function pack(value) {
      const detection = { labelid, value };
      if (score != null) detection.score = score;
      return detection;
    }

    const xc = Number(item.xc);
    const yc = Number(item.yc);
    const w = Number(item.w);
    const h = Number(item.h);
    if ([xc, yc, w, h].every(Number.isFinite)) {
      const value = {
        xc: Number(clamp01(xc).toFixed(6)),
        yc: Number(clamp01(yc).toFixed(6)),
        w: Number(clamp01(w).toFixed(6)),
        h: Number(clamp01(h).toFixed(6)),
      };
      if (hasAngle) value.angle = Number.isFinite(angle) ? Number(angle.toFixed(2)) : 0;
      return pack(value);
    }

    const xmin = Number(item.xmin);
    const ymin = Number(item.ymin);
    const xmax = Number(item.xmax);
    const ymax = Number(item.ymax);
    if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || imgW <= 0 || imgH <= 0) return null;
    const rect = {
      x: xmin,
      y: ymin,
      width: xmax - xmin,
      height: ymax - ymin,
    };
    if (hasAngle) rect.angle = Number.isFinite(angle) ? angle : 0;
    return pack(rectToValue(rect, imgW, imgH, { voc: Boolean(options.voc), obb: Boolean(options.obb) }));
  }

  function mapModelDetections(items, options = {}) {
    return (Array.isArray(items) ? items : []).map((item) => mapModelDetection(item, options)).filter(Boolean);
  }

  return {
    clamp01,
    yoloNorm,
    snapPixelRect,
    valueToRect,
    rectToValue,
    mapModelDetection,
    mapModelDetections,
  };
});

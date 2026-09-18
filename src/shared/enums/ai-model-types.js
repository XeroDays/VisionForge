(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    root.VisionForgeAiModelTypes = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_TYPE = "object-detection";
  const DEFAULT_CONFIDENCE = 0.25;
  const TYPES = [
    { id: "object-detection", label: "Object Detection" },
    { id: "oriented-object-detection", label: "Oriented Object Detection" },
    { id: "image-classification", label: "Image Classification", comingSoon: true },
    { id: "instance-segmentation", label: "Instance Segmentation", comingSoon: true },
  ];

  function isValidType(type) {
    const id = String(type || "").trim();
    return TYPES.some((item) => item.id === id);
  }

  function normalizeType(type) {
    return isValidType(type) ? String(type).trim() : DEFAULT_TYPE;
  }

  function isTypeAvailable(type) {
    const id = String(type || "").trim();
    if (!id) return false;
    const found = TYPES.find((item) => item.id === id);
    return Boolean(found && !found.comingSoon);
  }

  function supportsDetection(type) {
    const t = normalizeType(type);
    return t === "object-detection" || t === "oriented-object-detection";
  }

  function normalizeConfidence(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_CONFIDENCE;
    return Number(Math.max(0.01, Math.min(0.99, n)).toFixed(2));
  }

  return {
    TYPES,
    DEFAULT_TYPE,
    DEFAULT_CONFIDENCE,
    isValidType,
    normalizeType,
    isTypeAvailable,
    supportsDetection,
    normalizeConfidence,
  };
});

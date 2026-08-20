(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    root.VisionForgeAiModelTypes = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_TYPE = "object-detection";
  const TYPES = [
    { id: "object-detection", label: "Object Detection" },
    { id: "image-classification", label: "Image Classification" },
    { id: "oriented-object-detection", label: "Oriented Object Detection" },
    { id: "instance-segmentation", label: "Instance Segmentation" },
  ];

  function isValidType(type) {
    const id = String(type || "").trim();
    return TYPES.some((item) => item.id === id);
  }

  function normalizeType(type) {
    return isValidType(type) ? String(type).trim() : DEFAULT_TYPE;
  }

  function supportsDetection(type) {
    return normalizeType(type) === "object-detection";
  }

  return { TYPES, DEFAULT_TYPE, isValidType, normalizeType, supportsDetection };
});

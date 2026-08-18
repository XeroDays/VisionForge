(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    root.VisionForgeAnnotationTypes = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TYPES = [
    {
      id: "image-classification",
      label: "Image Classification",
      modes: [
        { id: "image-level-classification", label: "Image-level classification" },
        { id: "single-class-multi-class", label: "Single-class / multi-class" },
        { id: "multi-label-classification", label: "Multi-label classification" },
        { id: "binary-classification", label: "Binary classification" },
      ],
    },
    {
      id: "object-detection-bbox",
      label: "Object Detection — Bounding Box",
      modes: [
        { id: "axis-aligned-rectangle", label: "Axis-aligned rectangle" },
        { id: "yolo-bounding-box", label: "YOLO bounding box" },
        { id: "coco-bounding-box", label: "COCO bounding box" },
        { id: "pascal-voc-bounding-box", label: "Pascal VOC bounding box" },
        { id: "center-based-normalized-bounding-boxes", label: "Center-based / normalized bounding boxes" },
      ],
    },
    {
      id: "oriented-object-detection",
      label: "Oriented Object Detection — Rotated Bounding Box",
      hint: "Useful for aerial imagery, documents, text, vehicles, etc.",
      modes: [
        { id: "rotated-rectangle-obb", label: "Rotated rectangle / OBB" },
        { id: "4-point-quadrilateral", label: "4-point quadrilateral" },
        { id: "yolo-obb", label: "YOLO OBB" },
        { id: "dota", label: "DOTA" },
      ],
    },
    {
      id: "instance-segmentation",
      label: "Instance Segmentation",
      modes: [
        { id: "polygon", label: "Polygon" },
        { id: "free-form-polygon", label: "Free-form polygon" },
        { id: "brush-paint", label: "Brush / paint" },
        { id: "eraser", label: "Eraser" },
        { id: "multiple-instances-same-class", label: "Multiple instances of the same class" },
        { id: "coco-segmentation", label: "COCO segmentation" },
        { id: "yolo-segmentation", label: "YOLO segmentation" },
      ],
    },
    {
      id: "semantic-segmentation",
      label: "Semantic Segmentation",
      modes: [
        { id: "pixel-level-class-masks", label: "Pixel-level class masks" },
        { id: "brush-paint", label: "Brush / paint" },
        { id: "eraser", label: "Eraser" },
        { id: "background-foreground", label: "Background / foreground" },
        { id: "class-based-masks", label: "Class-based masks" },
        { id: "png-mask-indexed-mask", label: "PNG mask / indexed mask" },
      ],
    },
    {
      id: "panoptic-segmentation",
      label: "Panoptic Segmentation",
      hint: "Semantic segmentation + instance segmentation",
      modes: [
        { id: "stuff-classes", label: "Stuff classes (road, sky, grass, etc.)" },
        { id: "thing-classes", label: "Thing classes (person, car, dog, etc.)" },
        { id: "instance-ids-per-object", label: "Instance IDs per object" },
      ],
    },
    {
      id: "keypoint-pose",
      label: "Keypoint / Pose Estimation",
      modes: [
        { id: "human-pose", label: "Human pose" },
        { id: "face-landmarks", label: "Face landmarks" },
        { id: "hand-landmarks", label: "Hand landmarks" },
        { id: "animal-pose", label: "Animal pose" },
        { id: "custom-keypoint-schemas", label: "Custom keypoint schemas" },
        { id: "skeleton-connections", label: "Skeleton connections" },
      ],
    },
    {
      id: "polyline-line",
      label: "Polyline / Line Detection",
      modes: [
        { id: "roads", label: "Roads" },
        { id: "lane-markings", label: "Lane markings" },
        { id: "pipes", label: "Pipes" },
        { id: "cables", label: "Cables" },
        { id: "boundaries", label: "Boundaries" },
        { id: "curves-paths", label: "Curves / paths" },
      ],
    },
    {
      id: "ocr-text",
      label: "OCR / Text Detection",
      modes: [
        { id: "bounding-box-around-text", label: "Bounding box around text" },
        { id: "rotated-text-box", label: "Rotated text box" },
        { id: "polygon-around-text", label: "Polygon around text" },
        { id: "text-transcription", label: "Text transcription" },
        { id: "character-level-annotation", label: "Character-level annotation" },
        { id: "word-level-annotation", label: "Word-level annotation" },
        { id: "line-level-annotation", label: "Line-level annotation" },
        { id: "reading-order", label: "Reading order" },
      ],
    },
    {
      id: "image-level-attributes",
      label: "Image-Level Attributes",
      hint: "Example: car → color=red, damaged=true",
      modes: [
        { id: "object-attributes", label: "Object attributes" },
        { id: "color", label: "Color" },
        { id: "size", label: "Size" },
        { id: "orientation", label: "Orientation" },
        { id: "condition-state", label: "Condition / state" },
        { id: "custom-attributes", label: "Custom attributes" },
      ],
    },
  ];

  function isValidAnnotation(type, mode) {
    const typeId = String(type || "").trim();
    const modeId = String(mode || "").trim();
    if (!typeId || !modeId) return false;
    const found = TYPES.find((item) => item.id === typeId);
    if (!found) return false;
    return found.modes.some((item) => item.id === modeId);
  }

  return { TYPES, isValidAnnotation };
});

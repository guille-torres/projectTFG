// TFG: colorbar legend

// Variable metadata (label, unit, range, formatter) is imported from
// `constants.ts`.

import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Control,
  Image as GUIImage,
} from "@babylonjs/gui";
import { VariableLabel, VARIABLE_BY_KEY } from "./constants";

// ---------------------------------------------------------------------------
// Cool to Warm gradient
// Three-stop linear: blue → white → red
// ---------------------------------------------------------------------------

function buildCoolToWarmDataURL(width = 16, height = 256): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Gradient runs top (max = warm red) → bottom (min = cool blue)
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0.0, "#b40426"); // warm red  (max)
  gradient.addColorStop(0.5, "#f7f7f7"); // white     (mid)
  gradient.addColorStop(1.0, "#3b4cc0"); // cool blue (min)

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Legend state
// ---------------------------------------------------------------------------

let _adt: AdvancedDynamicTexture | null = null;
let _titleBlock: TextBlock | null = null;
let _minBlock: TextBlock | null = null;
let _maxBlock: TextBlock | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates (or reuses) the fullscreen GUI layer and updates legend content.
 * Call once after scene is ready, then again on variable change.
 */
export function updateLegend(variable: VariableLabel): void {
  if (!_adt) {
    _adt = createLegendUI();
  }
  const meta = VARIABLE_BY_KEY[variable];
  if (_titleBlock) _titleBlock.text = `${meta.legendLabel} [${meta.unit}]`;
  if (_maxBlock) _maxBlock.text = meta.fmt(meta.max);
  if (_minBlock) _minBlock.text = meta.fmt(meta.min);
}

/** Disposes the GUI layer (call on engine disposal if needed). */
export function disposeLegend(): void {
  if (_adt) {
    _adt.dispose();
    _adt = null;
    _titleBlock = null;
    _minBlock = null;
    _maxBlock = null;
  }
}

// ---------------------------------------------------------------------------
// GUI construction
// ---------------------------------------------------------------------------

function createLegendUI(): AdvancedDynamicTexture {
  const adt = AdvancedDynamicTexture.CreateFullscreenUI("LegendUI");

  // Outer container — bottom-right corner
  const container = new Rectangle("legendContainer");
  container.width = "90px";
  container.height = "230px";
  container.cornerRadius = 6;
  container.color = "rgba(127,186,255,0.3)";
  container.background = "rgba(10,12,18,0.75)";
  container.thickness = 1;
  container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  container.left = "-16px";
  container.top = "-16px";
  adt.addControl(container);

  // Title: variable name + units
  const titleBlock = new TextBlock("legendTitle", "Pressure [Pa]");
  titleBlock.color = "#7fbaff";
  titleBlock.fontSize = 9;
  titleBlock.textWrapping = true;
  titleBlock.height = "28px";
  titleBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  titleBlock.top = "6px";
  titleBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.addControl(titleBlock);
  _titleBlock = titleBlock;

  // Max label (top of bar = warm red)
  const maxBlock = new TextBlock("legendMax", "32.0");
  maxBlock.color = "#e0e0e0";
  maxBlock.fontSize = 9;
  maxBlock.height = "16px";
  maxBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  maxBlock.top = "34px";
  maxBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.addControl(maxBlock);
  _maxBlock = maxBlock;

  // Gradient image
  const gradDataURL = buildCoolToWarmDataURL(14, 150);
  const gradImage = new GUIImage("legendGrad", gradDataURL);
  gradImage.width = "14px";
  gradImage.height = "150px";
  gradImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  gradImage.top = "52px";
  gradImage.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.addControl(gradImage);

  // Min label (bottom of bar = cool blue)
  const minBlock = new TextBlock("legendMin", "26.0");
  minBlock.color = "#e0e0e0";
  minBlock.fontSize = 9;
  minBlock.height = "16px";
  minBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  minBlock.top = "204px";
  minBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.addControl(minBlock);
  _minBlock = minBlock;

  return adt;
}

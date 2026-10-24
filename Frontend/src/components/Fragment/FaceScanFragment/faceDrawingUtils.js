import * as faceapi from "@vladmandic/face-api";

/**
 * Clears the 2D canvas overlay
 * @param {HTMLCanvasElement|null} canvas
 */
export const clearCanvas = (canvas) => {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
};

/**
 * Renders bounding boxes and label tags onto the canvas overlay
 * @param {HTMLCanvasElement} canvas
 * @param {{ width: number, height: number }} displaySize
 * @param {{ x: number, y: number, width: number, height: number }} box
 * @param {{ name?: string, confidence?: number, isMatched?: boolean }} options
 */
export const drawDetectionResult = (
  canvas,
  displaySize,
  box,
  { name = "", confidence = 0, isMatched = false } = {}
) => {
  if (!canvas || !box) return;

  faceapi.matchDimensions(canvas, displaySize);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isMatched) {
    // Green bounding box for recognized student
    ctx.strokeStyle = "#10B981";
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    ctx.fillStyle = "#10B981";
    ctx.fillRect(box.x, box.y - 30, box.width, 30);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`${name} (${confidence}%)`, box.x + 8, box.y - 10);
  } else {
    // Amber/orange bounding box for unrecognized face
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    ctx.fillStyle = "#F59E0B";
    ctx.fillRect(box.x, box.y - 25, box.width, 25);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("Wajah Tidak Dikenali", box.x + 6, box.y - 8);
  }
};

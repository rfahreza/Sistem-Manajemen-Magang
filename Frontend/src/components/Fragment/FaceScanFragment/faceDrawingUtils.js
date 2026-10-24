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
 * Clean canvas renderer without intrusive bounding boxes or percentage banners
 */
export const drawDetectionResult = (canvas) => {
  if (!canvas) return;
  clearCanvas(canvas);
};

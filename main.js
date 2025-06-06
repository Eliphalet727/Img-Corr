const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const resetBtn = document.getElementById('resetBtn');
const processBtn = document.getElementById('processBtn');
const downloadLink = document.getElementById('downloadLink');
const imageCanvas = document.getElementById('imageCanvas');
const resultCanvas = document.getElementById('resultCanvas');
const ctx = imageCanvas.getContext('2d');
const resultCtx = resultCanvas.getContext('2d');

let img = null;
let points = [];
let originalImageData = null;

uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    img = new Image();
    img.onload = () => {
      imageCanvas.width = img.width;
      imageCanvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      originalImageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);

      points = [];
      resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
      downloadLink.style.display = "none";
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

resetBtn.addEventListener('click', () => {
  if (img) {
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.drawImage(img, 0, 0);
    originalImageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
  }
  points = [];
  resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  downloadLink.style.display = "none";
});

imageCanvas.addEventListener('click', (e) => {
  if (!img) return;
  if (points.length >= 4) return;

  const rect = imageCanvas.getBoundingClientRect();
  const scaleX = imageCanvas.width / rect.width;
  const scaleY = imageCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  points.push({ x, y });
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.fill();
});

processBtn.addEventListener('click', () => {
  if (!img || points.length < 4) {
    alert("請先上傳圖片並點選 4 個邊角點");
    return;
  }

  let dstWidth = parseInt(document.getElementById('widthInput').value) || 400;
  let dstHeight = parseInt(document.getElementById('heightInput').value) || 1200;

  resultCanvas.width = dstWidth;
  resultCanvas.height = dstHeight;

  const dstPoints = [
    { x: 0,         y: 0 },
    { x: dstWidth,  y: 0 },
    { x: dstWidth,  y: dstHeight },
    { x: 0,         y: dstHeight }
  ];

  const sortedPoints = sortPointsClockwise(points);
  const H_inv = computeHomography(dstPoints, sortedPoints);
  const resultImageData = resultCtx.createImageData(dstWidth, dstHeight);

  for (let dy = 0; dy < dstHeight; dy++) {
    for (let dx = 0; dx < dstWidth; dx++) {
      const [sx, sy] = applyHomography(H_inv, dx, dy);
      const pixel = getPixelBilinear(sx, sy, originalImageData, imageCanvas.width, imageCanvas.height);
      const idx = (dy * dstWidth + dx) * 4;
      resultImageData.data[idx + 0] = pixel[0];
      resultImageData.data[idx + 1] = pixel[1];
      resultImageData.data[idx + 2] = pixel[2];
      resultImageData.data[idx + 3] = pixel[3];
    }
  }

  resultCtx.putImageData(resultImageData, 0, 0);

  const dataURL = resultCanvas.toDataURL('image/png');
  downloadLink.href = dataURL;
  downloadLink.style.display = "inline-block";
});

function sortPointsClockwise(pts) {
  let centerX = 0, centerY = 0;
  pts.forEach(p => { centerX += p.x; centerY += p.y; });
  centerX /= pts.length;
  centerY /= pts.length;
  pts.sort((a, b) => {
    const angA = Math.atan2(a.y - centerY, a.x - centerX);
    const angB = Math.atan2(b.y - centerY, b.x - centerX);
    return angA - angB;
  });
  return pts;
}

function computeHomography(srcPoints, dstPoints) {
  const x1 = srcPoints[0].x, y1 = srcPoints[0].y;
  const x2 = srcPoints[1].x, y2 = srcPoints[1].y;
  const x3 = srcPoints[2].x, y3 = srcPoints[2].y;
  const x4 = srcPoints[3].x, y4 = srcPoints[3].y;

  const X1 = dstPoints[0].x, Y1 = dstPoints[0].y;
  const X2 = dstPoints[1].x, Y2 = dstPoints[1].y;
  const X3 = dstPoints[2].x, Y3 = dstPoints[2].y;
  const X4 = dstPoints[3].x, Y4 = dstPoints[3].y;

  const A = [
    [ x1, y1, 1,   0,  0,  0, -x1*X1, -y1*X1 ],
    [ 0,  0,  0,  x1, y1, 1, -x1*Y1, -y1*Y1 ],
    [ x2, y2, 1,   0,  0,  0, -x2*X2, -y2*X2 ],
    [ 0,  0,  0,  x2, y2, 1, -x2*Y2, -y2*Y2 ],
    [ x3, y3, 1,   0,  0,  0, -x3*X3, -y3*X3 ],
    [ 0,  0,  0,  x3, y3, 1, -x3*Y3, -y3*Y3 ],
    [ x4, y4, 1,   0,  0,  0, -x4*X4, -y4*X4 ],
    [ 0,  0,  0,  x4, y4, 1, -x4*Y4, -y4*Y4 ],
  ];
  const b = [X1, Y1, X2, Y2, X3, Y3, X4, Y4];
  const h = solve(A, b);

  return [
    h[0], h[1], h[2],
    h[3], h[4], h[5],
    h[6], h[7], 1
  ];
}

function applyHomography(H, x, y) {
  const sxp = H[0]*x + H[1]*y + H[2];
  const syp = H[3]*x + H[4]*y + H[5];
  const w   = H[6]*x + H[7]*y + 1;
  return [ sxp/w, syp/w ];
}

function solve(A, b) {
  A = A.map((row, i) => [...row, b[i]]);
  const n = A.length;

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) {
        maxRow = r;
      }
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) {
      throw new Error("Can not solve linear system");
    }
    const pivot = A[i][i];
    for (let c = i; c <= n; c++) {
      A[i][c] /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = A[r][i];
        for (let c = i; c <= n; c++) {
          A[r][c] -= factor * A[i][c];
        }
      }
    }
  }
  return A.map(row => row[n]);
}

function getPixelBilinear(sx, sy, imageData, width, height) {
  sx = Math.max(0, Math.min(sx, width - 1));
  sy = Math.max(0, Math.min(sy, height - 1));

  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  const dx = sx - x0;
  const dy = sy - y0;

  const p00 = getPixelFromData(imageData, x0, y0, width);
  const p01 = getPixelFromData(imageData, x1, y0, width);
  const p10 = getPixelFromData(imageData, x0, y1, width);
  const p11 = getPixelFromData(imageData, x1, y1, width);

  const r = (1 - dx) * (1 - dy) * p00[0] + dx * (1 - dy) * p01[0] + (1 - dx) * dy * p10[0] + dx * dy * p11[0];
  const g = (1 - dx) * (1 - dy) * p00[1] + dx * (1 - dy) * p01[1] + (1 - dx) * dy * p10[1] + dx * dy * p11[1];
  const b = (1 - dx) * (1 - dy) * p00[2] + dx * (1 - dy) * p01[2] + (1 - dx) * dy * p10[2] + dx * dy * p11[2];
  const a = (1 - dx) * (1 -dy) * p00[3] + dx * (1 - dy) * p01[3] + (1 - dx) * dy * p10[3] + dx * dy * p11[3];

  return [r, g, b, a];
}

function getPixelFromData(imageData, x, y, width) {
  const idx = (y * width + x) * 4;
  return [
    imageData.data[idx + 0],
    imageData.data[idx + 1],
    imageData.data[idx + 2],
    imageData.data[idx + 3],
  ];
}

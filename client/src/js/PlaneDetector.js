export default class PlaneDetector {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.isRunning = false;
    this.detector = null;
    this.detectedPlanes = [];
    
    this.onPlaneDetected = null;
    this.onError = null;
  }

  async init() {
    this.video = document.getElementById('video');
    this.canvas = document.getElementById('detection-canvas');
    this.ctx = this.canvas.getContext('2d');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'
        }
      });
      
      this.video.srcObject = stream;
      await this.video.play();
      
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      
      return true;
    } catch (err) {
      console.error('Camera access error:', err);
      if (this.onError) {
        this.onError(err);
      }
      return false;
    }
  }

  startDetection() {
    if (!this.video) return;
    this.isRunning = true;
    this.detectLoop();
  }

  stopDetection() {
    this.isRunning = false;
    
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.video.srcObject = null;
    }
  }

  detectLoop() {
    if (!this.isRunning) return;

    this.detectPlanes();
    requestAnimationFrame(() => this.detectLoop());
  }

  detectPlanes() {
    if (!this.ctx || !this.video) return;

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    
    const floorPixels = [];
    const wallPixels = [];
    
    const rows = 10;
    const cols = 10;
    const cellWidth = this.canvas.width / cols;
    const cellHeight = this.canvas.height / rows;
    
    const cellColors = [];
    
    for (let r = 0; r < rows; r++) {
      cellColors[r] = [];
      for (let c = 0; c < cols; c++) {
        const cx = Math.floor(c * cellWidth + cellWidth / 2);
        const cy = Math.floor(r * cellHeight + cellHeight / 2);
        const idx = (cy * this.canvas.width + cx) * 4;
        
        cellColors[r][c] = {
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          x: cx,
          y: cy
        };
      }
    }
    
    const bottomRows = cellColors.slice(Math.floor(rows * 0.6));
    const avgFloorColor = this.averageColors(bottomRows.flat());
    
    const topRows = cellColors.slice(0, Math.floor(rows * 0.4));
    const avgWallColor = this.averageColors(topRows.flat());
    
    let floorLineY = this.canvas.height * 0.5;
    for (let r = Math.floor(rows * 0.3); r < rows; r++) {
      const rowColors = cellColors[r];
      const rowAvg = this.averageColors(rowColors);
      
      const floorDiff = this.colorDistance(rowAvg, avgFloorColor);
      const wallDiff = this.colorDistance(rowAvg, avgWallColor);
      
      if (floorDiff < wallDiff && r > rows * 0.4) {
        floorLineY = r * cellHeight;
        break;
      }
    }
    
    this.detectedPlanes = [
      {
        type: 'floor',
        y: floorLineY,
        color: avgFloorColor
      },
      {
        type: 'wall',
        y: 0,
        color: avgWallColor
      }
    ];
    
    this.drawDetectionOverlay(floorLineY, avgFloorColor, avgWallColor);
  }

  averageColors(colors) {
    if (colors.length === 0) return { r: 0, g: 0, b: 0 };
    
    let r = 0, g = 0, b = 0;
    colors.forEach(c => {
      r += c.r;
      g += c.g;
      b += c.b;
    });
    
    return {
      r: Math.floor(r / colors.length),
      g: Math.floor(g / colors.length),
      b: Math.floor(b / colors.length)
    };
  }

  colorDistance(c1, c2) {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  drawDetectionOverlay(floorLineY, floorColor, wallColor) {
    if (!this.ctx) return;
    
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 5]);
    
    this.ctx.beginPath();
    this.ctx.moveTo(0, floorLineY);
    this.ctx.lineTo(this.canvas.width, floorLineY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    this.ctx.font = '16px Arial';
    this.ctx.fillStyle = '#00ff00';
    this.ctx.fillText('地面', 10, floorLineY + 20);
    this.ctx.fillText('墙面', 10, 30);
    
    this.ctx.fillStyle = `rgba(${floorColor.r}, ${floorColor.g}, ${floorColor.b}, 0.3)`;
    this.ctx.fillRect(0, floorLineY, this.canvas.width, this.canvas.height - floorLineY);
  }

  getFloorPlane() {
    return this.detectedPlanes.find(p => p.type === 'floor');
  }

  captureScene() {
    const floorPlane = this.getFloorPlane();
    return {
      floorY: floorPlane ? floorPlane.y : null,
      floorColor: floorPlane ? floorPlane.color : null,
      imageWidth: this.canvas.width,
      imageHeight: this.canvas.height
    };
  }

  analyzeImage(imageElement) {
    if (!this.ctx) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }

    this.canvas.width = imageElement.width || imageElement.naturalWidth;
    this.canvas.height = imageElement.height || imageElement.naturalHeight;
    
    this.ctx.drawImage(imageElement, 0, 0, this.canvas.width, this.canvas.height);
    
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    
    const rows = 20;
    const cols = 20;
    const cellWidth = this.canvas.width / cols;
    const cellHeight = this.canvas.height / rows;
    
    const rowColors = [];
    
    for (let r = 0; r < rows; r++) {
      let rowR = 0, rowG = 0, rowB = 0;
      for (let c = 0; c < cols; c++) {
        const cx = Math.floor(c * cellWidth + cellWidth / 2);
        const cy = Math.floor(r * cellHeight + cellHeight / 2);
        const idx = (cy * this.canvas.width + cx) * 4;
        rowR += data[idx];
        rowG += data[idx + 1];
        rowB += data[idx + 2];
      }
      rowColors.push({
        r: Math.floor(rowR / cols),
        g: Math.floor(rowG / cols),
        b: Math.floor(rowB / cols),
        y: r * cellHeight + cellHeight / 2
      });
    }
    
    const bottomThird = rowColors.slice(Math.floor(rows * 0.7));
    const floorAvg = this.averageColors(bottomThird.map((c, i) => ({
      ...c,
      x: i
    })));
    
    let floorLineY = this.canvas.height * 0.6;
    let minDiff = Infinity;
    
    for (let r = Math.floor(rows * 0.3); r < rows - 2; r++) {
      const upperColors = rowColors.slice(0, r);
      const lowerColors = rowColors.slice(r);
      
      const upperAvg = this.averageColors(upperColors.map((c, i) => ({ ...c, x: i })));
      const lowerAvg = this.averageColors(lowerColors.map((c, i) => ({ ...c, x: i })));
      
      const diff = this.colorDistance(upperAvg, lowerAvg);
      
      if (diff > 30 && diff < minDiff) {
        minDiff = diff;
        floorLineY = r * cellHeight;
      }
    }
    
    const floorColor = {
      r: floorAvg.r,
      g: floorAvg.g,
      b: floorAvg.b
    };
    
    const wallColor = {
      r: 200,
      g: 200,
      b: 200
    };
    
    return {
      floorY: floorLineY,
      floorColor: floorColor,
      wallColor: wallColor,
      imageWidth: this.canvas.width,
      imageHeight: this.canvas.height
    };
  }
}

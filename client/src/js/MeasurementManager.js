import * as THREE from 'three';

const CM_PER_METER = 100;
const INCHES_PER_METER = 39.3701;

export default class MeasurementManager {
  constructor(scene, camera, floor) {
    this.scene = scene;
    this.camera = camera;
    this.floor = floor;

    this.measurements = [];
    this.activeMeasurement = null;
    this.measurementMode = false;
    this.unit = 'cm';
    this.scaleFactor = 1;
    this.onMeasurementComplete = null;

    this.group = new THREE.Group();
    this.group.name = 'measurements';
    this.scene.add(this.group);

    this.previewLine = null;
    this.previewLabel = null;
    this.previewStart = null;
  }

  setMeasurementMode(enabled) {
    this.measurementMode = enabled;
    if (!enabled) {
      this.cancelActive();
      this.clearPreview();
    }
  }

  setUnit(unit) {
    this.unit = unit;
    this.measurements.forEach(m => this.updateLabel(m));
  }

  setScaleFactor(factor) {
    this.scaleFactor = factor;
    this.measurements.forEach(m => this.updateLabel(m));
  }

  handleClick(point) {
    if (!this.measurementMode) return false;

    const worldPoint = point.clone();
    worldPoint.y = (this.floor ? this.floor.position.y : 0) + 0.02;

    if (!this.activeMeasurement) {
      this.activeMeasurement = this.createMeasurement(worldPoint, worldPoint);
      this.previewStart = worldPoint.clone();
      return true;
    }

    this.activeMeasurement.endPoint.copy(worldPoint);
    this.finalizeMeasurement(this.activeMeasurement);
    this.activeMeasurement = null;
    this.previewStart = null;
    this.clearPreview();
    return true;
  }

  handleMouseMove(point) {
    if (!this.measurementMode || !this.activeMeasurement || !this.previewStart) return;

    const worldPoint = point.clone();
    worldPoint.y = (this.floor ? this.floor.position.y : 0) + 0.02;

    this.updateMeasurementLine(this.activeMeasurement, this.previewStart, worldPoint);
    this.updateLabel(this.activeMeasurement);
  }

  createMeasurement(startPoint, endPoint) {
    const m = {
      id: 'meas_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      startPoint: startPoint.clone(),
      endPoint: endPoint.clone(),
      line: null,
      startMarker: null,
      endMarker: null,
      label: null,
      labelSprite: null
    };

    const lineGeo = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    m.line = new THREE.Line(lineGeo, lineMat);
    this.group.add(m.line);

    const markerGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    m.startMarker = new THREE.Mesh(markerGeo, markerMat);
    m.startMarker.position.copy(startPoint);
    this.group.add(m.startMarker);

    m.endMarker = new THREE.Mesh(markerGeo.clone(), markerMat.clone());
    m.endMarker.position.copy(endPoint);
    this.group.add(m.endMarker);

    this.createLabel(m);

    this.measurements.push(m);
    return m;
  }

  createLabel(m) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2, 0.5, 1);

    m.label = { canvas, ctx, texture };
    m.labelSprite = sprite;

    this.group.add(sprite);
    this.updateLabel(m);
  }

  updateLabel(m) {
    if (!m.label) return;

    const dist = this.getDistance(m);
    const text = this.formatDistance(dist);

    const { canvas, ctx, texture } = m.label;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 30, 40, 0.85)';
    const borderRadius = 12;
    ctx.beginPath();
    ctx.moveTo(borderRadius, 0);
    ctx.lineTo(canvas.width - borderRadius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, borderRadius);
    ctx.lineTo(canvas.width, canvas.height - borderRadius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - borderRadius, canvas.height);
    ctx.lineTo(borderRadius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - borderRadius);
    ctx.lineTo(0, borderRadius);
    ctx.quadraticCurveTo(0, 0, borderRadius, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;

    const mid = new THREE.Vector3().lerpVectors(m.startPoint, m.endPoint, 0.5);
    mid.y += 0.4;
    m.labelSprite.position.copy(mid);
  }

  updateMeasurementLine(m, start, end) {
    m.startPoint.copy(start);
    m.endPoint.copy(end);

    const positions = m.line.geometry.attributes.position;
    if (positions) {
      positions.setXYZ(0, start.x, start.y, start.z);
      positions.setXYZ(1, end.x, end.y, end.z);
      positions.needsUpdate = true;
    }

    m.startMarker.position.copy(start);
    m.endMarker.position.copy(end);
  }

  finalizeMeasurement(m) {
    m.line.material.color.set(0x00ff88);
    m.startMarker.material.color.set(0x00ff88);
    m.endMarker.material.color.set(0x00ff88);
    this.updateLabel(m);
    if (this.onMeasurementComplete) {
      this.onMeasurementComplete(m);
    }
  }

  getDistance(m) {
    return m.startPoint.distanceTo(m.endPoint) * this.scaleFactor;
  }

  formatDistance(meters) {
    if (this.unit === 'cm') {
      const cm = meters * CM_PER_METER;
      if (cm >= 100) {
        return (cm / 100).toFixed(2) + ' m';
      }
      return cm.toFixed(1) + ' cm';
    } else {
      const inches = meters * INCHES_PER_METER;
      if (inches >= 12) {
        const feet = Math.floor(inches / 12);
        const remainInches = (inches % 12).toFixed(1);
        return feet + "' " + remainInches + '"';
      }
      return inches.toFixed(1) + '"';
    }
  }

  cancelActive() {
    if (this.activeMeasurement) {
      this.removeMeasurement(this.activeMeasurement.id);
      this.activeMeasurement = null;
      this.previewStart = null;
    }
    this.clearPreview();
  }

  clearPreview() {
    if (this.previewLine) {
      this.group.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine.material.dispose();
      this.previewLine = null;
    }
  }

  removeMeasurement(id) {
    const idx = this.measurements.findIndex(m => m.id === id);
    if (idx === -1) return;

    const m = this.measurements[idx];
    this.group.remove(m.line);
    m.line.geometry.dispose();
    m.line.material.dispose();
    this.group.remove(m.startMarker);
    m.startMarker.geometry.dispose();
    m.startMarker.material.dispose();
    this.group.remove(m.endMarker);
    m.endMarker.geometry.dispose();
    m.endMarker.material.dispose();
    if (m.labelSprite) {
      this.group.remove(m.labelSprite);
      m.labelSprite.material.map.dispose();
      m.labelSprite.material.dispose();
    }

    this.measurements.splice(idx, 1);
  }

  clearAll() {
    while (this.measurements.length > 0) {
      this.removeMeasurement(this.measurements[0].id);
    }
    this.activeMeasurement = null;
    this.previewStart = null;
  }

  getMeasurementData() {
    return this.measurements.map(m => ({
      id: m.id,
      startPoint: { x: m.startPoint.x, y: m.startPoint.y, z: m.startPoint.z },
      endPoint: { x: m.endPoint.x, y: m.endPoint.y, z: m.endPoint.z }
    }));
  }

  loadMeasurementData(data) {
    this.clearAll();
    if (!data || !Array.isArray(data)) return;

    data.forEach(d => {
      const start = new THREE.Vector3(d.startPoint.x, d.startPoint.y, d.startPoint.z);
      const end = new THREE.Vector3(d.endPoint.x, d.endPoint.y, d.endPoint.z);
      const m = this.createMeasurement(start, end);
      m.id = d.id;
      this.updateMeasurementLine(m, start, end);
      this.finalizeMeasurement(m);
    });
  }

  updateFloorPosition(floorY) {
    this.measurements.forEach(m => {
      const y = floorY + 0.02;
      m.startPoint.y = y;
      m.endPoint.y = y;
      this.updateMeasurementLine(m, m.startPoint, m.endPoint);
      this.updateLabel(m);
    });
  }
}

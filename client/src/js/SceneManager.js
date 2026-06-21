export default class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = new THREE.Clock();
    
    this.furniture = [];
    this.walls = [];
    this.floor = null;
    
    this.ambientLight = null;
    this.directionalLight = null;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.selectedObject = null;
    this.isDragging = false;
    this.isRotating = false;
    this.dragPlane = null;
    this.dragOffset = new THREE.Vector3();
    
    this.onSelect = null;
    this.onFurnitureAdd = null;
    this.onFurnitureRemove = null;
    
    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(8, 8, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLights();
    this.setupFloor();
    this.setupGrid();
    this.setupControls();
    this.setupDragPlane();

    window.addEventListener('resize', () => this.onResize());
  }

  setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.directionalLight.position.set(10, 20, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.camera.left = -20;
    this.directionalLight.shadow.camera.right = 20;
    this.directionalLight.shadow.camera.top = 20;
    this.directionalLight.shadow.camera.bottom = -20;
    this.scene.add(this.directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x548235, 0.3);
    this.scene.add(hemisphereLight);
  }

  setupFloor() {
    const floorGeometry = new THREE.PlaneGeometry(30, 30);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2b48c,
      roughness: 0.8,
      metalness: 0.1
    });
    this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.userData.isFloor = true;
    this.scene.add(this.floor);
  }

  setupGrid() {
    const gridHelper = new THREE.GridHelper(30, 30, 0x888888, 0x555555);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  setupControls() {
    let isMouseDown = false;
    let mouseButton = -1;
    let previousMousePosition = { x: 0, y: 0 };
    let spherical = { radius: 12, theta: Math.PI / 4, phi: Math.PI / 4 };
    const target = new THREE.Vector3(0, 1, 0);

    const updateCamera = () => {
      this.camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      this.camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
      this.camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      this.camera.lookAt(target);
    };

    updateCamera();

    this.canvas.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      mouseButton = e.button;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('mouseup', () => {
      isMouseDown = false;
      mouseButton = -1;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (mouseButton === 0 && !this.isDragging && !this.isRotating) {
        spherical.theta -= deltaX * 0.01;
        spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, spherical.phi + deltaY * 0.01));
        updateCamera();
      } else if (mouseButton === 2) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        this.camera.getWorldDirection(right);
        right.cross(up).normalize();
        
        const panSpeed = spherical.radius * 0.001;
        target.addScaledVector(right, -deltaX * panSpeed);
        target.y += deltaY * panSpeed;
        updateCamera();
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      spherical.radius = Math.max(2, Math.min(50, spherical.radius + e.deltaY * 0.01));
      updateCamera();
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._orbitTarget = target;
    this._spherical = spherical;
    this._updateCamera = updateCamera;
  }

  setupDragPlane() {
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    this.dragPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.dragPlane.rotation.x = -Math.PI / 2;
    this.dragPlane.visible = false;
    this.scene.add(this.dragPlane);
  }

  onResize() {
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  addFurniture(furnitureData) {
    const group = new THREE.Group();
    group.userData = {
      furnitureId: furnitureData.id,
      name: furnitureData.name,
      type: furnitureData.type || 'box',
      width: furnitureData.width,
      height: furnitureData.height,
      depth: furnitureData.depth,
      color: furnitureData.color || 0x8b4513,
      isFurniture: true
    };

    this.buildFurnitureMesh(group, furnitureData);
    
    group.position.y = furnitureData.height / 2;
    group.castShadow = true;
    group.receiveShadow = true;

    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(group);
    this.furniture.push(group);

    if (this.onFurnitureAdd) {
      this.onFurnitureAdd(group);
    }

    return group;
  }

  buildFurnitureMesh(group, data) {
    const type = data.type || 'box';
    const color = new THREE.Color(data.color || 0x8b4513);
    const w = data.width;
    const h = data.height;
    const d = data.depth;

    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.1
    });

    switch (type) {
      case 'sofa':
        this.buildSofa(group, w, h, d, material);
        break;
      case 'table':
        this.buildTable(group, w, h, d, material);
        break;
      case 'chair':
        this.buildChair(group, w, h, d, material);
        break;
      case 'bookshelf':
        this.buildBookshelf(group, w, h, d, material);
        break;
      case 'lamp':
        this.buildLamp(group, w, h, d, material);
        break;
      case 'bed':
        this.buildBed(group, w, h, d, material);
        break;
      default:
        const geometry = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = h / 2;
        group.add(mesh);
    }
  }

  buildSofa(group, w, h, d, material) {
    const seatHeight = h * 0.4;
    const backHeight = h * 0.6;
    const armWidth = w * 0.1;
    
    const seatGeo = new THREE.BoxGeometry(w - armWidth * 2, seatHeight, d);
    const seat = new THREE.Mesh(seatGeo, material);
    seat.position.y = seatHeight / 2;
    group.add(seat);

    const backGeo = new THREE.BoxGeometry(w, backHeight, d * 0.2);
    const back = new THREE.Mesh(backGeo, material);
    back.position.set(0, seatHeight + backHeight / 2, -d / 2 + d * 0.1);
    group.add(back);

    const armGeo = new THREE.BoxGeometry(armWidth, backHeight, d);
    const leftArm = new THREE.Mesh(armGeo, material);
    leftArm.position.set(-w / 2 + armWidth / 2, seatHeight + backHeight / 2 - seatHeight * 0.3, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, material);
    rightArm.position.set(w / 2 - armWidth / 2, seatHeight + backHeight / 2 - seatHeight * 0.3, 0);
    group.add(rightArm);
  }

  buildTable(group, w, h, d, material) {
    const topThickness = h * 0.1;
    const legSize = w * 0.05;
    
    const topGeo = new THREE.BoxGeometry(w, topThickness, d);
    const top = new THREE.Mesh(topGeo, material);
    top.position.y = h - topThickness / 2;
    group.add(top);

    const legGeo = new THREE.BoxGeometry(legSize, h - topThickness, legSize);
    const positions = [
      [-w / 2 + legSize / 2, (h - topThickness) / 2, -d / 2 + legSize / 2],
      [w / 2 - legSize / 2, (h - topThickness) / 2, -d / 2 + legSize / 2],
      [-w / 2 + legSize / 2, (h - topThickness) / 2, d / 2 - legSize / 2],
      [w / 2 - legSize / 2, (h - topThickness) / 2, d / 2 - legSize / 2]
    ];

    positions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, material);
      leg.position.set(...pos);
      group.add(leg);
    });
  }

  buildChair(group, w, h, d, material) {
    const seatHeight = h * 0.45;
    const backHeight = h * 0.55;
    const seatThickness = h * 0.08;
    const legSize = w * 0.08;

    const seatGeo = new THREE.BoxGeometry(w, seatThickness, d);
    const seat = new THREE.Mesh(seatGeo, material);
    seat.position.y = seatHeight;
    group.add(seat);

    const backGeo = new THREE.BoxGeometry(w, backHeight, seatThickness);
    const back = new THREE.Mesh(backGeo, material);
    back.position.set(0, seatHeight + backHeight / 2, -d / 2 + seatThickness / 2);
    group.add(back);

    const legGeo = new THREE.BoxGeometry(legSize, seatHeight, legSize);
    const positions = [
      [-w / 2 + legSize / 2, seatHeight / 2, -d / 2 + legSize / 2],
      [w / 2 - legSize / 2, seatHeight / 2, -d / 2 + legSize / 2],
      [-w / 2 + legSize / 2, seatHeight / 2, d / 2 - legSize / 2],
      [w / 2 - legSize / 2, seatHeight / 2, d / 2 - legSize / 2]
    ];

    positions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, material);
      leg.position.set(...pos);
      group.add(leg);
    });
  }

  buildBookshelf(group, w, h, d, material) {
    const shelfCount = 5;
    const shelfThickness = h * 0.03;
    const sideThickness = w * 0.05;
    const backThickness = d * 0.1;

    const shelfGap = (h - shelfThickness * shelfCount) / (shelfCount - 1);

    for (let i = 0; i < shelfCount; i++) {
      const shelfGeo = new THREE.BoxGeometry(w - sideThickness * 2, shelfThickness, d - backThickness);
      const shelf = new THREE.Mesh(shelfGeo, material);
      shelf.position.y = i * (shelfThickness + shelfGap) + shelfThickness / 2;
      shelf.position.z = backThickness / 2;
      group.add(shelf);
    }

    const sideGeo = new THREE.BoxGeometry(sideThickness, h, d);
    const leftSide = new THREE.Mesh(sideGeo, material);
    leftSide.position.set(-w / 2 + sideThickness / 2, h / 2, 0);
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeo, material);
    rightSide.position.set(w / 2 - sideThickness / 2, h / 2, 0);
    group.add(rightSide);

    const backGeo = new THREE.BoxGeometry(w, h, backThickness);
    const back = new THREE.Mesh(backGeo, material);
    back.position.set(0, h / 2, -d / 2 + backThickness / 2);
    group.add(back);
  }

  buildLamp(group, w, h, d, material) {
    const poleRadius = w * 0.08;
    const baseHeight = h * 0.05;
    const baseRadius = w * 0.4;
    const shadeHeight = h * 0.3;
    const shadeBottomRadius = w * 0.45;
    const shadeTopRadius = w * 0.3;

    const baseGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.1, baseHeight, 32);
    const base = new THREE.Mesh(baseGeo, material);
    base.position.y = baseHeight / 2;
    group.add(base);

    const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, h - baseHeight - shadeHeight, 16);
    const pole = new THREE.Mesh(poleGeo, material);
    pole.position.y = baseHeight + (h - baseHeight - shadeHeight) / 2;
    group.add(pole);

    const shadeGeo = new THREE.CylinderGeometry(shadeTopRadius, shadeBottomRadius, shadeHeight, 32, 1, true);
    const shadeMaterial = new THREE.MeshStandardMaterial({
      color: 0xfaf0e6,
      side: THREE.DoubleSide,
      roughness: 0.5,
      transparent: true,
      opacity: 0.9
    });
    const shade = new THREE.Mesh(shadeGeo, shadeMaterial);
    shade.position.y = h - shadeHeight / 2;
    group.add(shade);

    const bulbLight = new THREE.PointLight(0xffeedd, 0.5, 5);
    bulbLight.position.y = h - shadeHeight * 0.6;
    group.add(bulbLight);
  }

  buildBed(group, w, h, d, material) {
    const mattressHeight = h * 0.6;
    const frameHeight = h * 0.4;
    const headboardHeight = h * 2;
    const headboardThickness = d * 0.08;

    const frameGeo = new THREE.BoxGeometry(w, frameHeight, d);
    const frame = new THREE.Mesh(frameGeo, material);
    frame.position.y = frameHeight / 2;
    group.add(frame);

    const mattressMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f5dc,
      roughness: 0.9
    });
    const mattressGeo = new THREE.BoxGeometry(w * 0.95, mattressHeight, d * 0.95);
    const mattress = new THREE.Mesh(mattressGeo, mattressMaterial);
    mattress.position.y = frameHeight + mattressHeight / 2;
    group.add(mattress);

    const headboardGeo = new THREE.BoxGeometry(w, headboardHeight, headboardThickness);
    const headboard = new THREE.Mesh(headboardGeo, material);
    headboard.position.set(0, headboardHeight / 2, -d / 2 + headboardThickness / 2);
    group.add(headboard);
  }

  addWall(start, end, height = 3, thickness = 0.2) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);

    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.9,
      side: THREE.DoubleSide
    });

    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(
      start.x + dx / 2,
      height / 2,
      start.z + dz / 2
    );
    wall.rotation.y = -angle;
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData.isWall = true;

    this.scene.add(wall);
    this.walls.push(wall);

    return wall;
  }

  clearFurniture() {
    this.furniture.forEach(f => this.scene.remove(f));
    this.furniture = [];
    this.selectedObject = null;
  }

  clearWalls() {
    this.walls.forEach(w => this.scene.remove(w));
    this.walls = [];
  }

  selectObject(object) {
    if (this.selectedObject) {
      this.unhighlight(this.selectedObject);
    }

    this.selectedObject = object;

    if (object) {
      this.highlight(object);
    }

    if (this.onSelect) {
      this.onSelect(object);
    }
  }

  highlight(object) {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.userData.originalEmissive) {
          child.userData.originalEmissive = child.material.emissive ? child.material.emissive.getHex() : 0;
        }
        if (child.material.emissive) {
          child.material.emissive.setHex(0x333333);
        }
      }
    });
  }

  unhighlight(object) {
    object.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissive.setHex(child.userData.originalEmissive || 0);
      }
    });
  }

  getIntersects(event, objects) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  setAmbientIntensity(value) {
    if (this.ambientLight) {
      this.ambientLight.intensity = value;
    }
  }

  setDirectionalIntensity(value) {
    if (this.directionalLight) {
      this.directionalLight.intensity = value;
    }
  }

  setLightColor(color) {
    if (this.directionalLight) {
      this.directionalLight.color.set(color);
    }
    if (this.ambientLight) {
      this.ambientLight.color.set(color);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.render();
  }

  getSceneData() {
    return {
      furniture: this.furniture.map(f => ({
        furnitureId: f.userData.furnitureId,
        name: f.userData.name,
        position: { x: f.position.x, y: f.position.y, z: f.position.z },
        rotation: { x: f.rotation.x, y: f.rotation.y, z: f.rotation.z },
        scale: { x: f.scale.x, y: f.scale.y, z: f.scale.z }
      })),
      walls: this.walls.map(w => ({
        position: { x: w.position.x, y: w.position.y, z: w.position.z },
        rotation: { x: w.rotation.x, y: w.rotation.y, z: w.rotation.z },
        geometry: {
          width: w.geometry.parameters.width,
          height: w.geometry.parameters.height,
          depth: w.geometry.parameters.depth
        }
      })),
      lights: {
        ambientIntensity: this.ambientLight.intensity,
        directionalIntensity: this.directionalLight.intensity,
        lightColor: '#' + this.directionalLight.color.getHexString()
      }
    };
  }

  loadSceneData(data) {
    this.clearFurniture();
    this.clearWalls();

    if (data.lights) {
      this.setAmbientIntensity(data.lights.ambientIntensity || 0.5);
      this.setDirectionalIntensity(data.lights.directionalIntensity || 1);
      if (data.lights.lightColor) {
        this.setLightColor(data.lights.lightColor);
      }
    }
  }
}

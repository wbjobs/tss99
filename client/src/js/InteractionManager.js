export default class InteractionManager {
  constructor(sceneManager, physicsWorld) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.canvas = sceneManager.canvas;

    this.selectedObject = null;
    this.isDragging = false;
    this.isRotating = false;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();
    this.intersectionPoint = new THREE.Vector3();

    this.rotateMode = false;

    this.gizmo = null;
    this.gizmoType = 'translate';

    this.onSelect = null;
    this.onDeselect = null;
    this.onDrop = null;

    this.isPlacingNew = false;
    this.placingObject = null;
    this.placingData = null;

    this.isDraggingHandle = false;
    this.activeHandle = null;
    this.handleStartY = 0;
    this.handleStartFloorY = 0;

    this.measurementMode = false;
    this.measurementManager = null;

    this.init();
  }

  init() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.createGizmo();
  }

  createGizmo() {
    this.gizmo = new THREE.Group();
    this.gizmo.visible = false;

    const arrowLength = 1.5;
    const arrowHeadLength = 0.2;
    const arrowHeadWidth = 0.1;

    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xff0000,
      arrowHeadLength,
      arrowHeadWidth
    );
    xArrow.userData.axis = 'x';

    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x00ff00,
      arrowHeadLength,
      arrowHeadWidth
    );
    yArrow.userData.axis = 'y';

    const zArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x0000ff,
      arrowHeadLength,
      arrowHeadWidth
    );
    zArrow.userData.axis = 'z';

    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const rotateRing = new THREE.Mesh(ringGeo, ringMat);
    rotateRing.rotation.x = Math.PI / 2;
    rotateRing.userData.axis = 'rotate';

    this.gizmo.add(xArrow);
    this.gizmo.add(yArrow);
    this.gizmo.add(zArrow);
    this.gizmo.add(rotateRing);

    this.sceneManager.scene.add(this.gizmo);
    this.gizmoArrows = [xArrow, yArrow, zArrow, rotateRing];
  }

  updateGizmo() {
    if (!this.selectedObject || !this.gizmo) return;
    
    this.gizmo.position.copy(this.selectedObject.position);
    this.gizmo.visible = true;
  }

  onMouseDown(event) {
    if (event.button !== 0) return;
    if (this.isPlacingNew) return;

    this.updateMouse(event);

    if (this.measurementMode && this.measurementManager) {
      const floorIntersect = this.raycaster.intersectObject(this.sceneManager.floor);
      if (floorIntersect.length > 0) {
        this.measurementManager.handleClick(floorIntersect[0].point);
      }
      return;
    }

    if (this.sceneManager.planeEditMode && this.sceneManager.planeHandles.length > 0) {
      const handleIntersects = this.raycaster.intersectObjects(this.sceneManager.planeHandles, true);
      if (handleIntersects.length > 0) {
        this.isDraggingHandle = true;
        this.activeHandle = handleIntersects[0].object;
        this.handleStartY = event.clientY;
        this.handleStartFloorY = this.sceneManager.getFloorHeight();
        this.deselectObject();
        return;
      }
    }

    if (this.gizmo.visible) {
      const gizmoIntersects = this.raycaster.intersectObjects(this.gizmoArrows, true);
      if (gizmoIntersects.length > 0) {
        const axis = gizmoIntersects[0].object.userData.axis;
        if (axis === 'rotate') {
          this.isRotating = true;
          this.rotateAxis = 'y';
        } else {
          this.isDragging = true;
          this.dragAxis = axis;
        }
        
        if (this.selectedObject) {
          const body = this.physicsWorld.bodies.get(this.selectedObject);
          if (body) {
            body.type = CANNON.Body.KINEMATIC;
          }
        }
        
        this.setupDragPlane();
        return;
      }
    }

    const furnitureObjects = this.sceneManager.furniture;
    const intersects = this.raycaster.intersectObjects(furnitureObjects, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.isFurniture) {
        obj = obj.parent;
      }

      if (obj.userData.isFurniture) {
        this.selectObject(obj);
        this.isDragging = false;
      }
    } else {
      const floorIntersect = this.raycaster.intersectObject(this.sceneManager.floor);
      if (floorIntersect.length > 0) {
        this.deselectObject();
      }
    }
  }

  onMouseMove(event) {
    this.updateMouse(event);

    if (this.measurementMode && this.measurementManager) {
      const floorIntersect = this.raycaster.intersectObject(this.sceneManager.floor);
      if (floorIntersect.length > 0) {
        this.measurementManager.handleMouseMove(floorIntersect[0].point);
      }
      return;
    }

    if (this.isDraggingHandle) {
      const deltaY = (this.handleStartY - event.clientY) * 0.01;
      const newFloorY = this.handleStartFloorY + deltaY;
      const clampedY = Math.max(-2, Math.min(3, newFloorY));
      this.sceneManager.setFloorHeight(clampedY);
      return;
    }

    if (this.isPlacingNew && this.placingObject) {
      this.updatePlacingPosition();
      return;
    }

    if ((this.isDragging || this.isRotating) && this.selectedObject) {
      this.handleDrag();
      return;
    }

    if (this.sceneManager.planeEditMode && this.sceneManager.planeHandles.length > 0) {
      const handleIntersects = this.raycaster.intersectObjects(this.sceneManager.planeHandles, true);
      this.sceneManager.planeHandles.forEach(handle => {
        handle.scale.set(1, 1, 1);
      });
      if (handleIntersects.length > 0) {
        handleIntersects[0].object.scale.set(1.4, 1.4, 1.4);
      }
    }

    if (this.gizmo.visible) {
      const gizmoIntersects = this.raycaster.intersectObjects(this.gizmoArrows, true);
      this.gizmoArrows.forEach(arrow => {
        if (arrow.material) {
          arrow.material.opacity = 1;
        }
      });
      if (gizmoIntersects.length > 0) {
        if (gizmoIntersects[0].object.material) {
          gizmoIntersects[0].object.material.opacity = 0.5;
        }
      }
    }
  }

  onMouseUp(event) {
    if (this.isDraggingHandle) {
      this.isDraggingHandle = false;
      this.activeHandle = null;
      if (this.onFloorHeightChanged) {
        this.onFloorHeightChanged(this.sceneManager.getFloorHeight());
      }
      return;
    }

    if (this.isPlacingNew) {
      this.finishPlacing();
      return;
    }

    if ((this.isDragging || this.isRotating) && this.selectedObject) {
      const body = this.physicsWorld.bodies.get(this.selectedObject);
      if (body) {
        body.type = CANNON.Body.DYNAMIC;
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
      
      if (this.onDrop) {
        this.onDrop(this.selectedObject);
      }
    }

    this.isDragging = false;
    this.isRotating = false;
    this.dragAxis = null;
  }

  onKeyDown(event) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedObject) {
        this.deleteSelected();
      }
    }
    
    if (event.key === 'r' || event.key === 'R') {
      if (this.selectedObject) {
        this.selectedObject.rotation.y += Math.PI / 4;
        const body = this.physicsWorld.bodies.get(this.selectedObject);
        if (body) {
          body.quaternion.setFromEuler(
            this.selectedObject.rotation.x,
            this.selectedObject.rotation.y,
            this.selectedObject.rotation.z
          );
        }
      }
    }

    if (event.key === 'Escape') {
      if (this.measurementMode && this.measurementManager) {
        this.measurementManager.cancelActive();
        return;
      }
      if (this.isPlacingNew) {
        this.cancelPlacing();
      } else {
        this.deselectObject();
      }
    }
  }

  updateMouse(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
  }

  setupDragPlane() {
    const normal = new THREE.Vector3(0, 1, 0);
    const point = this.selectedObject.position.clone();
    this.dragPlane.setFromNormalAndCoplanarPoint(normal, point);
    
    this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);
    this.dragOffset.copy(this.intersectionPoint).sub(this.selectedObject.position);
  }

  handleDrag() {
    this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);
    
    if (this.isRotating) {
      const center = this.selectedObject.position;
      const dx = this.intersectionPoint.x - center.x;
      const dz = this.intersectionPoint.z - center.z;
      const angle = Math.atan2(dz, dx);
      this.selectedObject.rotation.y = angle;
      
      const body = this.physicsWorld.bodies.get(this.selectedObject);
      if (body) {
        body.quaternion.setFromEuler(0, angle, 0);
      }
    } else {
      const newPos = this.intersectionPoint.clone().sub(this.dragOffset);
      
      if (this.dragAxis === 'x') {
        newPos.y = this.selectedObject.position.y;
        newPos.z = this.selectedObject.position.z;
      } else if (this.dragAxis === 'y') {
        newPos.x = this.selectedObject.position.x;
        newPos.z = this.selectedObject.position.z;
      } else if (this.dragAxis === 'z') {
        newPos.x = this.selectedObject.position.x;
        newPos.y = this.selectedObject.position.y;
      }
      
      const floorHeight = this.sceneManager.getFloorHeight ? this.sceneManager.getFloorHeight() : 0;
      newPos.y = Math.max(newPos.y, floorHeight + this.selectedObject.userData.height / 2);

      if (this.checkCollisionAtPosition(newPos)) {
        return;
      }
      
      this.selectedObject.position.copy(newPos);
      
      const body = this.physicsWorld.bodies.get(this.selectedObject);
      if (body) {
        body.position.copy(newPos);
      }
      
      this.updateGizmo();
    }
  }

  checkCollisionAtPosition(pos) {
    const body = this.physicsWorld.bodies.get(this.selectedObject);
    if (!body) return false;

    const originalPos = body.position.clone();
    body.position.copy(pos);

    let hasCollision = false;
    const otherBodies = [];
    
    this.physicsWorld.world.bodies.forEach(b => {
      if (b !== body && b !== this.physicsWorld.floorBody) {
        otherBodies.push(b);
      }
    });

    for (const other of otherBodies) {
      if (this.checkBoxCollision(body, other)) {
        hasCollision = true;
        break;
      }
    }

    body.position.copy(originalPos);
    return hasCollision;
  }

  checkBoxCollision(bodyA, bodyB) {
    if (bodyA.shapes.length === 0 || bodyB.shapes.length === 0) return false;
    
    const shapeA = bodyA.shapes[0];
    const shapeB = bodyB.shapes[0];
    
    if (!(shapeA instanceof CANNON.Box) || !(shapeB instanceof CANNON.Box)) {
      return false;
    }

    const minA = new THREE.Vector3(
      bodyA.position.x - shapeA.halfExtents.x,
      bodyA.position.y - shapeA.halfExtents.y,
      bodyA.position.z - shapeA.halfExtents.z
    );
    const maxA = new THREE.Vector3(
      bodyA.position.x + shapeA.halfExtents.x,
      bodyA.position.y + shapeA.halfExtents.y,
      bodyA.position.z + shapeA.halfExtents.z
    );

    const minB = new THREE.Vector3(
      bodyB.position.x - shapeB.halfExtents.x,
      bodyB.position.y - shapeB.halfExtents.y,
      bodyB.position.z - shapeB.halfExtents.z
    );
    const maxB = new THREE.Vector3(
      bodyB.position.x + shapeB.halfExtents.x,
      bodyB.position.y + shapeB.halfExtents.y,
      bodyB.position.z + shapeB.halfExtents.z
    );

    return (
      minA.x < maxB.x && maxA.x > minB.x &&
      minA.y < maxB.y && maxA.y > minB.y &&
      minA.z < maxB.z && maxA.z > minB.z
    );
  }

  selectObject(obj) {
    if (this.selectedObject) {
      this.sceneManager.unhighlight(this.selectedObject);
    }
    
    this.selectedObject = obj;
    this.sceneManager.selectObject(obj);
    this.sceneManager.highlight(obj);
    this.updateGizmo();
    
    if (this.onSelect) {
      this.onSelect(obj);
    }
  }

  deselectObject() {
    if (this.selectedObject) {
      this.sceneManager.unhighlight(this.selectedObject);
      this.selectedObject = null;
      this.sceneManager.selectObject(null);
    }
    if (this.gizmo) {
      this.gizmo.visible = false;
    }
    
    if (this.onDeselect) {
      this.onDeselect();
    }
  }

  deleteSelected() {
    if (!this.selectedObject) return;

    this.physicsWorld.removeFurnitureBody(this.selectedObject);
    this.sceneManager.scene.remove(this.selectedObject);
    
    const index = this.sceneManager.furniture.indexOf(this.selectedObject);
    if (index > -1) {
      this.sceneManager.furniture.splice(index, 1);
    }

    this.deselectObject();
  }

  startPlacing(furnitureData) {
    this.placingData = furnitureData;
    this.isPlacingNew = true;
    
    this.placingObject = this.sceneManager.addFurniture(furnitureData);
    this.physicsWorld.addFurnitureBody(this.placingObject, furnitureData);
    
    this.placingObject.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.opacity = 0.6;
      }
    });

    this.deselectObject();
    this.canvas.style.cursor = 'crosshair';
  }

  updatePlacingPosition() {
    if (!this.placingObject) return;

    const floorIntersect = this.raycaster.intersectObject(this.sceneManager.floor);
    if (floorIntersect.length > 0) {
      const point = floorIntersect[0].point;
      point.y = this.placingData.height / 2;
      
      this.placingObject.position.copy(point);

      const body = this.physicsWorld.bodies.get(this.placingObject);
      if (body) {
        body.position.copy(point);
      }
      
      let hasCollision = false;
      const placingBody = this.physicsWorld.bodies.get(this.placingObject);
      
      this.physicsWorld.world.bodies.forEach(b => {
        if (hasCollision) return;
        if (b === placingBody) return;
        if (b === this.physicsWorld.floorBody) return;

        if (this.checkBoxCollision(placingBody, b)) {
          hasCollision = true;
        }
      });

      this.placingObject.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.color.setHex(hasCollision ? 0xff0000 : 0x8b4513);
        }
      });
    }
  }

  finishPlacing() {
    if (!this.placingObject) return;

    this.placingObject.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.transparent = false;
        child.material.opacity = 1;
        if (this.placingData.color) {
          child.material.color.set(this.placingData.color);
        }
      }
    });

    const body = this.physicsWorld.bodies.get(this.placingObject);
    if (body) {
      body.type = CANNON.Body.DYNAMIC;
    }

    this.selectObject(this.placingObject);
    
    this.placingObject = null;
    this.placingData = null;
    this.isPlacingNew = false;
    this.canvas.style.cursor = 'default';
  }

  cancelPlacing() {
    if (this.placingObject) {
      this.physicsWorld.removeFurnitureBody(this.placingObject);
      this.sceneManager.scene.remove(this.placingObject);
      const index = this.sceneManager.furniture.indexOf(this.placingObject);
      if (index > -1) {
        this.sceneManager.furniture.splice(index, 1);
      }
    }

    this.placingObject = null;
    this.placingData = null;
    this.isPlacingNew = false;
    this.canvas.style.cursor = 'default';
  }

  update() {
    this.updateGizmo();
  }
}

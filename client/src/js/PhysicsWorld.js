import * as CANNON from 'cannon-es';

export default class PhysicsWorld {
  constructor() {
    this.world = null;
    this.bodies = new Map();
    this.wallBodies = [];
    this.floorBody = null;
    this.timeStep = 1 / 60;
    this.velocitySleepThreshold = 0.05;
    this.positionSleepThreshold = 0.01;
    this.settleFrames = 0;
    this.maxSettleFrames = 120;

    this.init();
  }

  init() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 5;
    this.world.solver.tolerance = 0.001;
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.5;
    this.world.defaultContactMaterial.restitution = 0.0;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e6;
    this.world.defaultContactMaterial.contactEquationRelaxation = 10;
    this.world.defaultContactMaterial.frictionEquationStiffness = 1e6;
    this.world.defaultContactMaterial.frictionEquationRelaxation = 10;

    this.addFloor();
  }

  addFloor() {
    const groundShape = new CANNON.Plane();
    this.floorBody = new CANNON.Body({ 
      mass: 0,
      type: CANNON.Body.STATIC
    });
    this.floorBody.addShape(groundShape);
    this.floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.floorBody.allowSleep = true;
    this.world.addBody(this.floorBody);
  }

  addFurnitureBody(threeObject, data) {
    const halfExtents = new CANNON.Vec3(
      data.width / 2 * 0.98,
      data.height / 2 * 0.98,
      data.depth / 2 * 0.98
    );
    const boxShape = new CANNON.Box(halfExtents);
    
    const body = new CANNON.Body({
      mass: 8,
      shape: boxShape,
      position: new CANNON.Vec3(
        threeObject.position.x,
        threeObject.position.y,
        threeObject.position.z
      ),
      material: new CANNON.Material({
        friction: 0.6,
        restitution: 0.0
      }),
      linearDamping: 0.95,
      angularDamping: 0.98,
      allowSleep: true,
      sleepSpeedLimit: 0.03,
      sleepTimeLimit: 0.5
    });

    body.fixedRotation = true;
    body.updateMassProperties();

    this.world.addBody(body);
    this.bodies.set(threeObject, body);

    return body;
  }

  addWallBody(wallMesh) {
    const params = wallMesh.geometry.parameters;
    const halfExtents = new CANNON.Vec3(
      params.width / 2,
      params.height / 2,
      params.depth / 2
    );
    const boxShape = new CANNON.Box(halfExtents);
    
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      shape: boxShape,
      position: new CANNON.Vec3(
        wallMesh.position.x,
        wallMesh.position.y,
        wallMesh.position.z
      ),
      quaternion: new CANNON.Quaternion(
        wallMesh.quaternion.x,
        wallMesh.quaternion.y,
        wallMesh.quaternion.z,
        wallMesh.quaternion.w
      ),
      material: new CANNON.Material({
        friction: 0.5,
        restitution: 0.0
      }),
      allowSleep: true
    });

    this.world.addBody(body);
    this.wallBodies.push(body);

    return body;
  }

  removeFurnitureBody(threeObject) {
    const body = this.bodies.get(threeObject);
    if (body) {
      this.world.removeBody(body);
      this.bodies.delete(threeObject);
    }
  }

  updateBodyPosition(threeObject, position) {
    const body = this.bodies.get(threeObject);
    if (body) {
      body.position.set(position.x, position.y, position.z);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.wakeUp();
    }
  }

  updateBodyRotation(threeObject, rotation) {
    const body = this.bodies.get(threeObject);
    if (body) {
      body.quaternion.setFromEuler(rotation.x, rotation.y, rotation.z);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.wakeUp();
    }
  }

  setBodyKinematic(threeObject, isKinematic) {
    const body = this.bodies.get(threeObject);
    if (body) {
      if (isKinematic) {
        body.type = CANNON.Body.KINEMATIC;
        body.mass = 0;
      } else {
        body.type = CANNON.Body.DYNAMIC;
        body.mass = 8;
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
      body.updateMassProperties();
      body.wakeUp();
    }
  }

  snapToGround(threeObject, data) {
    const body = this.bodies.get(threeObject);
    if (!body) return;

    const halfHeight = data.height / 2;
    const targetY = halfHeight;
    
    body.position.y = targetY;
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    
    threeObject.position.y = targetY;
    body.wakeUp();
  }

  snapAllToGround() {
    this.bodies.forEach((body, threeObject) => {
      const data = threeObject.userData;
      if (data && data.height) {
        this.snapToGround(threeObject, data);
      }
    });
  }

  checkCollision(threeObject, position) {
    const body = this.bodies.get(threeObject);
    if (!body) return false;

    const originalPos = body.position.clone();
    body.position.set(position.x, position.y, position.z);

    let hasCollision = false;
    const halfExtents = body.shapes[0].halfExtents;
    
    this.world.bodies.forEach(otherBody => {
      if (hasCollision) return;
      if (otherBody === body) return;
      if (otherBody === this.floorBody) return;
      if (otherBody.shapes.length === 0) return;

      const otherHalf = otherBody.shapes[0].halfExtents;
      if (!otherHalf) return;

      const minA = {
        x: body.position.x - halfExtents.x,
        y: body.position.y - halfExtents.y,
        z: body.position.z - halfExtents.z
      };
      const maxA = {
        x: body.position.x + halfExtents.x,
        y: body.position.y + halfExtents.y,
        z: body.position.z + halfExtents.z
      };
      const minB = {
        x: otherBody.position.x - otherHalf.x,
        y: otherBody.position.y - otherHalf.y,
        z: otherBody.position.z - otherHalf.z
      };
      const maxB = {
        x: otherBody.position.x + otherHalf.x,
        y: otherBody.position.y + otherHalf.y,
        z: otherBody.position.z + otherHalf.z
      };

      const overlapX = Math.min(maxA.x, maxB.x) - Math.max(minA.x, minB.x);
      const overlapY = Math.min(maxA.y, maxB.y) - Math.max(minA.y, minB.y);
      const overlapZ = Math.min(maxA.z, maxB.z) - Math.max(minA.z, minB.z);

      const overlapThreshold = 0.005;
      if (overlapX > overlapThreshold && overlapY > overlapThreshold && overlapZ > overlapThreshold) {
        hasCollision = true;
      }
    });

    body.position.copy(originalPos);
    return hasCollision;
  }

  simpleCheckCollision(bodyA, excludeBodies = []) {
    let collision = false;
    if (bodyA.shapes.length === 0) return false;
    const halfA = bodyA.shapes[0].halfExtents;
    if (!halfA) return false;
    
    this.world.bodies.forEach(bodyB => {
      if (collision) return;
      if (bodyB === bodyA) return;
      if (bodyB === this.floorBody) return;
      if (excludeBodies.includes(bodyB)) return;
      if (bodyB.shapes.length === 0) return;
      const halfB = bodyB.shapes[0].halfExtents;
      if (!halfB) return;

      const dx = Math.abs(bodyA.position.x - bodyB.position.x);
      const dy = Math.abs(bodyA.position.y - bodyB.position.y);
      const dz = Math.abs(bodyA.position.z - bodyB.position.z);

      const minDx = halfA.x + halfB.x;
      const minDy = halfA.y + halfB.y;
      const minDz = halfA.z + halfB.z;

      if (dx < minDx * 0.98 && dy < minDy * 0.98 && dz < minDz * 0.98) {
        collision = true;
      }
    });

    return collision;
  }

  stabilizeBodies() {
    let allStable = true;

    this.bodies.forEach((body, threeObject) => {
      if (body.type === CANNON.Body.STATIC) return;

      const velMag = body.velocity.length();
      const angVelMag = body.angularVelocity.length();

      if (velMag > 15 || angVelMag > 15) {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.wakeUp();
      }

      if (velMag < this.velocitySleepThreshold && angVelMag < this.velocitySleepThreshold) {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }

      if (velMag > this.velocitySleepThreshold * 2) {
        allStable = false;
      }

      const data = threeObject.userData;
      if (data && data.height) {
        const halfHeight = data.height / 2;
        const minY = halfHeight - 0.001;
        if (body.position.y < minY) {
          body.position.y = minY;
          if (body.velocity.y < 0) {
            body.velocity.y = 0;
          }
        }
      }

      if (!isFinite(body.position.x) || !isFinite(body.position.y) || !isFinite(body.position.z)) {
        body.position.set(0, 1, 0);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
    });

    return allStable;
  }

  separateOverlappingBodies() {
    const bodyList = Array.from(this.bodies.entries());
    
    for (let i = 0; i < bodyList.length; i++) {
      const [objA, bodyA] = bodyList[i];
      if (bodyA.shapes.length === 0) continue;
      const halfA = bodyA.shapes[0].halfExtents;
      if (!halfA) continue;

      for (let j = i + 1; j < bodyList.length; j++) {
        const [objB, bodyB] = bodyList[j];
        if (bodyB.shapes.length === 0) continue;
        const halfB = bodyB.shapes[0].halfExtents;
        if (!halfB) continue;

        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        const dz = bodyB.position.z - bodyA.position.z;

        const overlapX = (halfA.x + halfB.x) - Math.abs(dx);
        const overlapY = (halfA.y + halfB.y) - Math.abs(dy);
        const overlapZ = (halfA.z + halfB.z) - Math.abs(dz);

        if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
          const minOverlap = Math.min(overlapX, overlapY, overlapZ);
          
          if (minOverlap === overlapX) {
            const push = overlapX / 2 + 0.001;
            const dir = dx >= 0 ? 1 : -1;
            if (bodyA.type !== CANNON.Body.STATIC) {
              bodyA.position.x -= dir * push;
            }
            if (bodyB.type !== CANNON.Body.STATIC) {
              bodyB.position.x += dir * push;
            }
          } else if (minOverlap === overlapY) {
            const push = overlapY / 2 + 0.001;
            const dir = dy >= 0 ? 1 : -1;
            if (bodyA.type !== CANNON.Body.STATIC) {
              bodyA.position.y -= dir * push;
            }
            if (bodyB.type !== CANNON.Body.STATIC) {
              bodyB.position.y += dir * push;
            }
          } else {
            const push = overlapZ / 2 + 0.001;
            const dir = dz >= 0 ? 1 : -1;
            if (bodyA.type !== CANNON.Body.STATIC) {
              bodyA.position.z -= dir * push;
            }
            if (bodyB.type !== CANNON.Body.STATIC) {
              bodyB.position.z += dir * push;
            }
          }

          const velScale = 0.1;
          if (bodyA.type !== CANNON.Body.STATIC) {
            bodyA.velocity.x *= velScale;
            bodyA.velocity.y *= velScale;
            bodyA.velocity.z *= velScale;
            bodyA.angularVelocity.set(0, 0, 0);
          }
          if (bodyB.type !== CANNON.Body.STATIC) {
            bodyB.velocity.x *= velScale;
            bodyB.velocity.y *= velScale;
            bodyB.velocity.z *= velScale;
            bodyB.angularVelocity.set(0, 0, 0);
          }
        }
      }
    }
  }

  step() {
    for (let subStep = 0; subStep < 2; subStep++) {
      this.world.step(this.timeStep / 2);
    }

    this.separateOverlappingBodies();
    this.stabilizeBodies();

    this.bodies.forEach((body, threeObject) => {
      if (body.type !== CANNON.Body.STATIC) {
        threeObject.position.set(
          body.position.x,
          body.position.y,
          body.position.z
        );
        threeObject.quaternion.set(
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w
        );
      }
    });
  }

  clear() {
    this.bodies.forEach(body => this.world.removeBody(body));
    this.bodies.clear();
    
    this.wallBodies.forEach(body => this.world.removeBody(body));
    this.wallBodies = [];
  }
}

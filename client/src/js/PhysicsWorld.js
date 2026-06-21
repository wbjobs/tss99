import * as CANNON from 'cannon-es';

export default class PhysicsWorld {
  constructor() {
    this.world = null;
    this.bodies = new Map();
    this.wallBodies = [];
    this.floorBody = null;
    this.timeStep = 1 / 60;
    
    this.init();
  }

  init() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;
    this.world.defaultContactMaterial.friction = 0.3;

    this.addFloor();
  }

  addFloor() {
    const groundShape = new CANNON.Plane();
    this.floorBody = new CANNON.Body({ mass: 0 });
    this.floorBody.addShape(groundShape);
    this.floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(this.floorBody);
  }

  addFurnitureBody(threeObject, data) {
    const halfExtents = new CANNON.Vec3(
      data.width / 2,
      data.height / 2,
      data.depth / 2
    );
    const boxShape = new CANNON.Box(halfExtents);
    
    const body = new CANNON.Body({
      mass: 10,
      shape: boxShape,
      position: new CANNON.Vec3(
        threeObject.position.x,
        threeObject.position.y,
        threeObject.position.z
      )
    });

    body.linearDamping = 0.9;
    body.angularDamping = 0.9;
    
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
      )
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
    }
  }

  updateBodyRotation(threeObject, rotation) {
    const body = this.bodies.get(threeObject);
    if (body) {
      body.quaternion.setFromEuler(rotation.x, rotation.y, rotation.z);
      body.angularVelocity.set(0, 0, 0);
    }
  }

  setBodyKinematic(threeObject, isKinematic) {
    const body = this.bodies.get(threeObject);
    if (body) {
      body.type = isKinematic ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
    }
  }

  checkCollision(threeObject, position) {
    const body = this.bodies.get(threeObject);
    if (!body) return false;

    const originalPos = body.position.clone();
    body.position.set(position.x, position.y, position.z);

    let hasCollision = false;
    this.world.bodies.forEach(otherBody => {
      if (otherBody === body || otherBody === this.floorBody) return;
      
      const result = new CANNON.NaiveBroadphase();
      const pairs = [];
      this.world.broadphase.collisionPairs(this.world, pairs);
      
      for (let i = 0; i < pairs.length; i += 2) {
        if ((pairs[i] === body && pairs[i + 1] === otherBody) ||
            (pairs[i + 1] === body && pairs[i] === otherBody)) {
          hasCollision = true;
          break;
        }
      }
    });

    body.position.copy(originalPos);
    return hasCollision;
  }

  simpleCheckCollision(bodyA, excludeBodies = []) {
    let collision = false;
    
    this.world.bodies.forEach(bodyB => {
      if (collision) return;
      if (bodyB === bodyA) return;
      if (bodyB === this.floorBody) return;
      if (excludeBodies.includes(bodyB)) return;

      const dx = bodyA.position.x - bodyB.position.x;
      const dy = bodyA.position.y - bodyB.position.y;
      const dz = bodyA.position.z - bodyB.position.z;

      const distSq = dx * dx + dy * dy + dz * dz;
      const minDist = 2;

      if (distSq < minDist * minDist) {
        collision = true;
      }
    });

    return collision;
  }

  step() {
    this.world.step(this.timeStep);

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

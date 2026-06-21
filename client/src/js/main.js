import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import SceneManager from './SceneManager.js';
import PhysicsWorld from './PhysicsWorld.js';
import InteractionManager from './InteractionManager.js';
import PlaneDetector from './PlaneDetector.js';
import ApiService from './ApiService.js';
import UIController from './UIController.js';

class App {
  constructor() {
    window.THREE = THREE;
    window.CANNON = CANNON;

    this.canvas = document.getElementById('three-canvas');
    this.api = new ApiService();
    this.sceneManager = new SceneManager(this.canvas);
    this.physicsWorld = new PhysicsWorld();
    this.interactionManager = new InteractionManager(this.sceneManager, this.physicsWorld);
    this.planeDetector = new PlaneDetector();
    this.ui = new UIController(this);

    this.furnitureData = [];
    this.filteredFurniture = [];
    this.currentCategory = null;

    this.wallMode = false;
    this.wallStartPoint = null;

    this.clock = new THREE.Clock();

    this.init();
  }

  async init() {
    this.setupInteractionCallbacks();
    
    this.addDefaultRoom();
    
    await this.loadFurniture();
    
    this.animate();
    
    this.checkShareLink();

    this.ui.showToast('欢迎使用3D室内设计工具！');
  }

  setupInteractionCallbacks() {
    this.interactionManager.onSelect = (obj) => {
      this.ui.updateSelectedInfo(obj);
    };

    this.interactionManager.onDeselect = () => {
      this.ui.updateSelectedInfo(null);
    };
  }

  addDefaultRoom() {
    const roomSize = 10;
    const wallHeight = 3;

    this.sceneManager.addWall(
      { x: -roomSize / 2, z: -roomSize / 2 },
      { x: roomSize / 2, z: -roomSize / 2 },
      wallHeight
    );

    this.sceneManager.addWall(
      { x: roomSize / 2, z: -roomSize / 2 },
      { x: roomSize / 2, z: roomSize / 2 },
      wallHeight
    );

    this.sceneManager.addWall(
      { x: roomSize / 2, z: roomSize / 2 },
      { x: -roomSize / 2, z: roomSize / 2 },
      wallHeight
    );

    this.sceneManager.addWall(
      { x: -roomSize / 2, z: roomSize / 2 },
      { x: -roomSize / 2, z: -roomSize / 2 },
      wallHeight
    );

    this.sceneManager.walls.forEach(wall => {
      this.physicsWorld.addWallBody(wall);
    });
  }

  async loadFurniture() {
    try {
      this.furnitureData = await this.api.getFurniture();
      this.filteredFurniture = [...this.furnitureData];
      this.ui.renderFurnitureList(this.filteredFurniture);
      
      const categories = [...new Set(this.furnitureData.map(f => f.category).filter(Boolean))];
      this.ui.updateCategories(categories);
    } catch (err) {
      console.error('Failed to load furniture:', err);
      this.ui.showToast('加载家具库失败');
    }
  }

  filterFurniture(category) {
    this.currentCategory = category;
    if (!category) {
      this.filteredFurniture = [...this.furnitureData];
    } else {
      this.filteredFurniture = this.furnitureData.filter(f => f.category === category);
    }
    this.ui.renderFurnitureList(this.filteredFurniture);
  }

  addFurniture(furnitureItem) {
    const obj = this.sceneManager.addFurniture(furnitureItem);
    obj.position.set(
      (Math.random() - 0.5) * 4,
      furnitureItem.height / 2,
      (Math.random() - 0.5) * 4
    );
    
    this.physicsWorld.addFurnitureBody(obj, furnitureItem);
    
    this.interactionManager.selectObject(obj);
    this.ui.showToast(`已添加 ${furnitureItem.name}`);
  }

  updateSelectedPosition() {
    if (this.interactionManager.selectedObject) {
      const obj = this.interactionManager.selectedObject;
      const body = this.physicsWorld.bodies.get(obj);
      if (body) {
        body.position.copy(obj.position);
        body.velocity.set(0, 0, 0);
      }
    }
  }

  updateSelectedRotation() {
    if (this.interactionManager.selectedObject) {
      const obj = this.interactionManager.selectedObject;
      const body = this.physicsWorld.bodies.get(obj);
      if (body) {
        body.quaternion.setFromEuler(
          obj.rotation.x,
          obj.rotation.y,
          obj.rotation.z
        );
        body.angularVelocity.set(0, 0, 0);
      }
    }
  }

  setAmbientLight(value) {
    this.sceneManager.setAmbientIntensity(value);
  }

  setDirectionalLight(value) {
    this.sceneManager.setDirectionalIntensity(value);
  }

  setLightColor(color) {
    this.sceneManager.setLightColor(color);
  }

  async startCameraDetection() {
    try {
      this.ui.showDetectionPanel();
      const success = await this.planeDetector.init();
      if (success) {
        this.planeDetector.startDetection();
        this.ui.showToast('摄像头已启动，正在检测平面...');
      } else {
        this.ui.hideDetectionPanel();
        this.ui.showToast('无法访问摄像头');
      }
    } catch (err) {
      this.ui.hideDetectionPanel();
      this.ui.showToast('摄像头访问失败');
    }
  }

  stopCameraDetection() {
    this.planeDetector.stopDetection();
    this.ui.hideDetectionPanel();
  }

  capturePlane() {
    const data = this.planeDetector.captureScene();
    if (data.floorY) {
      this.applyDetectedFloor(data);
      this.stopCameraDetection();
      this.ui.showToast('已应用检测到的平面');
    } else {
      this.ui.showToast('未检测到有效平面');
    }
  }

  applyDetectedFloor(detectionData) {
    if (detectionData.floorColor) {
      const color = `rgb(${detectionData.floorColor.r}, ${detectionData.floorColor.g}, ${detectionData.floorColor.b})`;
      if (this.sceneManager.floor) {
        this.sceneManager.floor.material.color.set(color);
      }
    }
  }

  async analyzeRoomImage(file) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = () => {
        const result = this.planeDetector.analyzeImage(img);
        if (result.floorY) {
          this.applyDetectedFloor(result);
          this.ui.showToast('图片分析完成');
        } else {
          this.ui.showToast('未能识别出地面和墙面');
        }
      };
      img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
  }

  startWallMode() {
    this.wallMode = !this.wallMode;
    if (this.wallMode) {
      this.canvas.style.cursor = 'crosshair';
      this.ui.showToast('点击地面放置墙体起点');
      
      const onCanvasClick = (e) => {
        if (!this.wallMode) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.sceneManager.camera);
        const intersects = raycaster.intersectObject(this.sceneManager.floor);
        
        if (intersects.length > 0) {
          const point = intersects[0].point;
          
          if (!this.wallStartPoint) {
            this.wallStartPoint = { x: point.x, z: point.z };
            this.ui.showToast('点击放置墙体终点');
          } else {
            const endPoint = { x: point.x, z: point.z };
            const wall = this.sceneManager.addWall(this.wallStartPoint, endPoint);
            this.physicsWorld.addWallBody(wall);
            this.wallStartPoint = null;
            this.ui.showToast('墙体已添加');
          }
        }
      };
      
      this._wallClickListener = onCanvasClick;
      this.canvas.addEventListener('click', onCanvasClick);
    } else {
      this.canvas.style.cursor = 'default';
      this.wallStartPoint = null;
      if (this._wallClickListener) {
        this.canvas.removeEventListener('click', this._wallClickListener);
      }
      this.ui.showToast('已退出建墙模式');
    }
  }

  clearScene() {
    this.sceneManager.clearFurniture();
    this.physicsWorld.clear();
    
    this.addDefaultRoom();
    
    this.ui.updateSelectedInfo(null);
    this.ui.showToast('场景已清空');
  }

  getCurrentSceneData() {
    const sceneData = this.sceneManager.getSceneData();
    return sceneData;
  }

  async saveScene(name) {
    try {
      const data = this.getCurrentSceneData();
      const result = await this.api.createScene({
        name: name,
        data: data
      });
      this.ui.showToast('场景保存成功！');
      return result;
    } catch (err) {
      console.error('Save failed:', err);
      this.ui.showToast('保存失败');
      return null;
    }
  }

  async loadScene(id) {
    try {
      this.ui.showLoading();
      const scene = await this.api.getScene(id);
      
      this.sceneManager.loadSceneData(scene.data);
      this.sceneManager.clearFurniture();
      
      const furnitureBodies = [];
      this.physicsWorld.bodies.forEach((body, obj) => {
        if (obj.userData.isFurniture) {
          furnitureBodies.push(obj);
        }
      });
      furnitureBodies.forEach(obj => this.physicsWorld.removeFurnitureBody(obj));

      if (scene.data.furniture) {
        for (const f of scene.data.furniture) {
          const furnitureItem = this.furnitureData.find(item => item.id === f.furnitureId);
          if (furnitureItem) {
            const obj = this.sceneManager.addFurniture(furnitureItem);
            obj.position.set(f.position.x, f.position.y, f.position.z);
            obj.rotation.set(f.rotation.x, f.rotation.y, f.rotation.z);
            if (f.scale) {
              obj.scale.set(f.scale.x, f.scale.y, f.scale.z);
            }
            
            this.physicsWorld.addFurnitureBody(obj, furnitureItem);
          }
        }
      }

      if (scene.data.lights) {
        this.setAmbientLight(scene.data.lights.ambientIntensity || 0.5);
        this.setDirectionalLight(scene.data.lights.directionalIntensity || 1);
        if (scene.data.lights.lightColor) {
          this.setLightColor(scene.data.lights.lightColor);
        }
      }

      this.ui.hideLoading();
      this.ui.showToast(`已加载: ${scene.name}`);
    } catch (err) {
      console.error('Load failed:', err);
      this.ui.hideLoading();
      this.ui.showToast('加载失败');
    }
  }

  async deleteScene(id) {
    try {
      await this.api.deleteScene(id);
      this.ui.showToast('场景已删除');
    } catch (err) {
      this.ui.showToast('删除失败');
    }
  }

  async createShareScene() {
    const data = this.getCurrentSceneData();
    const result = await this.api.createScene({
      name: '分享场景',
      data: data
    });
    return result;
  }

  async checkShareLink() {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    
    if (shareId) {
      try {
        this.ui.showLoading();
        const scene = await this.api.getSharedScene(shareId);
        await this.loadScene(scene.id);
        this.ui.showToast('已加载分享的场景');
      } catch (err) {
        this.ui.showToast('分享链接无效');
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    
    this.physicsWorld.step();
    
    this.interactionManager.update();

    this.sceneManager.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});

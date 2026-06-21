export default class UIController {
  constructor(app) {
    this.app = app;
    
    this.modal = document.getElementById('modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.toast = document.getElementById('toast');
    
    this.initEventListeners();
  }

  initEventListeners() {
    const closeBtn = this.modal.querySelector('.close');
    closeBtn.addEventListener('click', () => this.closeModal());
    
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });

    document.getElementById('btn-upload').addEventListener('click', () => {
      this.showUploadDialog();
    });

    document.getElementById('btn-camera').addEventListener('click', () => {
      this.app.startCameraDetection();
    });

    document.getElementById('btn-add-wall').addEventListener('click', () => {
      this.app.startWallMode();
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      this.showSaveDialog();
    });

    document.getElementById('btn-share').addEventListener('click', () => {
      this.showShareDialog();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('确定要清空所有家具吗？')) {
        this.app.clearScene();
      }
    });

    document.getElementById('ambient-intensity').addEventListener('input', (e) => {
      this.app.setAmbientLight(parseFloat(e.target.value));
    });

    document.getElementById('directional-intensity').addEventListener('input', (e) => {
      this.app.setDirectionalLight(parseFloat(e.target.value));
    });

    document.getElementById('light-color').addEventListener('input', (e) => {
      this.app.setLightColor(e.target.value);
    });

    document.getElementById('btn-close-detection').addEventListener('click', () => {
      this.app.stopCameraDetection();
    });

    document.getElementById('btn-capture').addEventListener('click', () => {
      this.app.capturePlane();
    });

    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const category = e.target.dataset.category;
        this.filterFurniture(category);
      });
    });
  }

  renderFurnitureList(furniture) {
    const container = document.getElementById('furniture-list');
    container.innerHTML = '';

    const icons = {
      sofa: '🛋️',
      table: '🪑',
      chair: '💺',
      bookshelf: '📚',
      lamp: '💡',
      bed: '🛏️'
    };

    furniture.forEach(item => {
      const div = document.createElement('div');
      div.className = 'furniture-item';
      div.draggable = true;
      div.dataset.id = item.id;
      
      const icon = icons[item.type] || '📦';
      
      div.innerHTML = `
        <div class="icon">${icon}</div>
        <div class="name">${item.name}</div>
      `;

      div.addEventListener('click', () => {
        this.app.addFurniture(item);
      });

      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('furnitureId', item.id);
        e.dataTransfer.setData('furnitureData', JSON.stringify(item));
      });

      container.appendChild(div);
    });
  }

  updateCategories(categories) {
    const filter = document.getElementById('category-filter');
    filter.innerHTML = '<button class="category-btn active" data-category="all">全部</button>';

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-btn';
      btn.dataset.category = cat;
      btn.textContent = cat;
      btn.addEventListener('click', () => this.filterFurniture(cat));
      filter.appendChild(btn);
    });
  }

  filterFurniture(category) {
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
    this.app.filterFurniture(category === 'all' ? null : category);
  }

  updateSelectedInfo(object) {
    const info = document.getElementById('selected-info');
    
    if (!object) {
      info.innerHTML = '<p class="hint">点击选择家具</p>';
      return;
    }

    const data = object.userData;
    info.innerHTML = `
      <div class="prop">
        <label>名称</label>
        <span>${data.name || '未知'}</span>
      </div>
      <div class="prop">
        <label>位置 X</label>
        <input type="number" step="0.1" id="pos-x" value="${object.position.x.toFixed(2)}">
      </div>
      <div class="prop">
        <label>位置 Z</label>
        <input type="number" step="0.1" id="pos-z" value="${object.position.z.toFixed(2)}">
      </div>
      <div class="prop">
        <label>旋转 Y</label>
        <input type="number" step="15" id="rot-y" value="${((object.rotation.y * 180) / Math.PI).toFixed(0)}">
      </div>
      <div class="prop">
        <label>尺寸</label>
        <span>${data.width?.toFixed(2)} × ${data.height?.toFixed(2)} × ${data.depth?.toFixed(2)}</span>
      </div>
    `;

    document.getElementById('pos-x')?.addEventListener('change', (e) => {
      object.position.x = parseFloat(e.target.value);
      this.app.updateSelectedPosition();
    });

    document.getElementById('pos-z')?.addEventListener('change', (e) => {
      object.position.z = parseFloat(e.target.value);
      this.app.updateSelectedPosition();
    });

    document.getElementById('rot-y')?.addEventListener('change', (e) => {
      object.rotation.y = (parseFloat(e.target.value) * Math.PI) / 180;
      this.app.updateSelectedRotation();
    });
  }

  showModal(title, content) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = content;
    this.modal.classList.remove('hidden');
  }

  closeModal() {
    this.modal.classList.add('hidden');
  }

  showToast(message, duration = 3000) {
    this.toast.textContent = message;
    this.toast.classList.remove('hidden');
    this.toast.classList.add('show');
    
    setTimeout(() => {
      this.toast.classList.add('hidden');
      this.toast.classList.remove('show');
    }, duration);
  }

  showUploadDialog() {
    const content = `
      <div class="form-group">
        <label>上传房间照片</label>
        <input type="file" id="room-image" accept="image/*">
      </div>
      <div class="form-group">
        <button class="btn btn-primary" id="btn-analyze">分析图片</button>
      </div>
      <div id="upload-preview"></div>
    `;
    
    this.showModal('上传房间照片', content);

    const fileInput = document.getElementById('room-image');
    const preview = document.getElementById('upload-preview');

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          preview.innerHTML = `<img src="${event.target.result}" style="max-width:100%;border-radius:5px;">`;
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('btn-analyze').addEventListener('click', () => {
      const file = fileInput.files[0];
      if (file) {
        this.app.analyzeRoomImage(file);
        this.closeModal();
      } else {
        this.showToast('请先选择一张图片');
      }
    });
  }

  showSaveDialog() {
    const content = `
      <div class="form-group">
        <label>场景名称</label>
        <input type="text" id="scene-name" placeholder="我的室内设计">
      </div>
      <div class="form-group">
        <button class="btn btn-primary" id="btn-do-save">保存</button>
      </div>
      <div class="form-group">
        <h4>我的场景</h4>
        <div class="scene-list" id="scene-list">加载中...</div>
      </div>
    `;
    
    this.showModal('保存场景', content);
    this.loadSceneList();

    document.getElementById('btn-do-save').addEventListener('click', async () => {
      const name = document.getElementById('scene-name').value || '未命名场景';
      const result = await this.app.saveScene(name);
      if (result) {
        this.loadSceneList();
      }
    });
  }

  async loadSceneList() {
    try {
      const scenes = await this.app.api.getScenes();
      const list = document.getElementById('scene-list');
      
      if (scenes.length === 0) {
        list.innerHTML = '<p style="color:#888;">暂无保存的场景</p>';
        return;
      }

      list.innerHTML = scenes.map(scene => `
        <div class="scene-item" data-id="${scene.id}">
          <div>
            <div class="scene-name">${scene.name}</div>
            <div class="scene-date">${new Date(scene.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <button class="btn" data-action="load">加载</button>
            <button class="btn btn-danger" data-action="delete">删除</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.scene-item').forEach(item => {
        const id = item.dataset.id;
        
        item.querySelector('[data-action="load"]').addEventListener('click', (e) => {
          e.stopPropagation();
          this.app.loadScene(id);
          this.closeModal();
        });

        item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('确定要删除这个场景吗？')) {
            this.app.deleteScene(id);
            this.loadSceneList();
          }
        });
      });
    } catch (err) {
      document.getElementById('scene-list').innerHTML = '<p style="color:#f00;">加载失败</p>';
    }
  }

  showShareDialog() {
    const sceneData = this.app.getCurrentSceneData();
    
    this.showModal('分享场景', `
      <div class="form-group">
        <p>生成分享链接，让其他人查看你的设计</p>
        <button class="btn btn-success" id="btn-gen-share">生成分享链接</button>
      </div>
      <div id="share-result" class="form-group hidden">
        <label>分享链接</label>
        <input type="text" id="share-link" readonly>
        <button class="btn" id="btn-copy-share" style="margin-top:8px;">复制链接</button>
      </div>
    `);

    document.getElementById('btn-gen-share').addEventListener('click', async () => {
      try {
        const result = await this.app.createShareScene();
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${result.shareId}`;
        
        document.getElementById('share-result').classList.remove('hidden');
        document.getElementById('share-link').value = shareUrl;
      } catch (err) {
        this.showToast('生成分享链接失败');
      }
    });

    document.getElementById('btn-copy-share').addEventListener('click', () => {
      const input = document.getElementById('share-link');
      input.select();
      document.execCommand('copy');
      this.showToast('链接已复制到剪贴板');
    });
  }

  showLoading() {
    document.getElementById('loading').classList.remove('hidden');
  }

  hideLoading() {
    document.getElementById('loading').classList.add('hidden');
  }

  showDetectionPanel() {
    document.getElementById('detection-panel').classList.remove('hidden');
  }

  hideDetectionPanel() {
    document.getElementById('detection-panel').classList.add('hidden');
  }
}

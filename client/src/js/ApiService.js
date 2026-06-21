const API_BASE = '/api';

export default class ApiService {
  async getFurniture(category = null) {
    const url = category 
      ? `${API_BASE}/furniture?category=${encodeURIComponent(category)}`
      : `${API_BASE}/furniture`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch furniture');
    return res.json();
  }

  async getFurnitureCategories() {
    const res = await fetch(`${API_BASE}/furniture/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  }

  async getFurnitureById(id) {
    const res = await fetch(`${API_BASE}/furniture/${id}`);
    if (!res.ok) throw new Error('Furniture not found');
    return res.json();
  }

  async addFurniture(formData) {
    const res = await fetch(`${API_BASE}/furniture`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to add furniture');
    return res.json();
  }

  async updateFurniture(id, formData) {
    const res = await fetch(`${API_BASE}/furniture/${id}`, {
      method: 'PUT',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to update furniture');
    return res.json();
  }

  async deleteFurniture(id) {
    const res = await fetch(`${API_BASE}/furniture/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete furniture');
    return res.json();
  }

  async getScenes() {
    const res = await fetch(`${API_BASE}/scenes`);
    if (!res.ok) throw new Error('Failed to fetch scenes');
    return res.json();
  }

  async getScene(id) {
    const res = await fetch(`${API_BASE}/scenes/${id}`);
    if (!res.ok) throw new Error('Scene not found');
    return res.json();
  }

  async createScene(sceneData) {
    const res = await fetch(`${API_BASE}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sceneData)
    });
    if (!res.ok) throw new Error('Failed to create scene');
    return res.json();
  }

  async updateScene(id, sceneData) {
    const res = await fetch(`${API_BASE}/scenes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sceneData)
    });
    if (!res.ok) throw new Error('Failed to update scene');
    return res.json();
  }

  async deleteScene(id) {
    const res = await fetch(`${API_BASE}/scenes/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete scene');
    return res.json();
  }

  async getSharedScene(shareId) {
    const res = await fetch(`${API_BASE}/share/${shareId}`);
    if (!res.ok) throw new Error('Scene not found');
    return res.json();
  }

  async uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to upload image');
    return res.json();
  }
}

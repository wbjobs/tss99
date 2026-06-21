const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/models', express.static(path.join(__dirname, 'models')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MODELS_DIR = path.join(__dirname, 'models');
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const SCENES_DIR = path.join(__dirname, 'scenes');

[DATA_DIR, UPLOADS_DIR, MODELS_DIR, THUMBNAILS_DIR, SCENES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const FURNITURE_FILE = path.join(DATA_DIR, 'furniture.json');
const SCENES_FILE = path.join(DATA_DIR, 'scenes.json');

if (!fs.existsSync(FURNITURE_FILE)) {
  fs.writeFileSync(FURNITURE_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(SCENES_FILE)) {
  fs.writeFileSync(SCENES_FILE, JSON.stringify([], null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'model') {
      cb(null, MODELS_DIR);
    } else if (file.fieldname === 'thumbnail') {
      cb(null, THUMBNAILS_DIR);
    } else {
      cb(null, UPLOADS_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
};

const writeJson = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

app.get('/api/furniture', (req, res) => {
  const { category } = req.query;
  let furniture = readJson(FURNITURE_FILE);
  if (category) {
    furniture = furniture.filter(f => f.category === category);
  }
  res.json(furniture);
});

app.get('/api/furniture/categories', (req, res) => {
  const furniture = readJson(FURNITURE_FILE);
  const categories = [...new Set(furniture.map(f => f.category).filter(Boolean))];
  res.json(categories);
});

app.get('/api/furniture/:id', (req, res) => {
  const furniture = readJson(FURNITURE_FILE);
  const item = furniture.find(f => f.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Furniture not found' });
  res.json(item);
});

app.post('/api/furniture', upload.fields([
  { name: 'model', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  const furniture = readJson(FURNITURE_FILE);
  const newItem = {
    id: uuidv4(),
    name: req.body.name || 'Untitled',
    category: req.body.category || 'Uncategorized',
    description: req.body.description || '',
    modelUrl: req.files?.model ? `/models/${req.files.model[0].filename}` : null,
    thumbnailUrl: req.files?.thumbnail ? `/thumbnails/${req.files.thumbnail[0].filename}` : null,
    width: parseFloat(req.body.width) || 1,
    height: parseFloat(req.body.height) || 1,
    depth: parseFloat(req.body.depth) || 1,
    createdAt: new Date().toISOString()
  };
  furniture.push(newItem);
  writeJson(FURNITURE_FILE, furniture);
  res.status(201).json(newItem);
});

app.put('/api/furniture/:id', upload.fields([
  { name: 'model', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  const furniture = readJson(FURNITURE_FILE);
  const index = furniture.findIndex(f => f.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Furniture not found' });

  const updated = {
    ...furniture[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  if (req.files?.model) {
    updated.modelUrl = `/models/${req.files.model[0].filename}`;
  }
  if (req.files?.thumbnail) {
    updated.thumbnailUrl = `/thumbnails/${req.files.thumbnail[0].filename}`;
  }

  furniture[index] = updated;
  writeJson(FURNITURE_FILE, furniture);
  res.json(updated);
});

app.delete('/api/furniture/:id', (req, res) => {
  let furniture = readJson(FURNITURE_FILE);
  const item = furniture.find(f => f.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Furniture not found' });

  if (item.modelUrl) {
    const modelPath = path.join(__dirname, item.modelUrl);
    if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
  }
  if (item.thumbnailUrl) {
    const thumbPath = path.join(__dirname, item.thumbnailUrl);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }

  furniture = furniture.filter(f => f.id !== req.params.id);
  writeJson(FURNITURE_FILE, furniture);
  res.json({ success: true });
});

app.get('/api/scenes', (req, res) => {
  const scenes = readJson(SCENES_FILE);
  res.json(scenes.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail,
    createdAt: s.createdAt,
    shareId: s.shareId
  })));
});

app.get('/api/scenes/:id', (req, res) => {
  const scenes = readJson(SCENES_FILE);
  const scene = scenes.find(s => s.id === req.params.id || s.shareId === req.params.id);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });
  res.json(scene);
});

app.post('/api/scenes', (req, res) => {
  const scenes = readJson(SCENES_FILE);
  const newScene = {
    id: uuidv4(),
    shareId: uuidv4().slice(0, 8),
    name: req.body.name || 'Untitled Scene',
    thumbnail: req.body.thumbnail || null,
    data: req.body.data || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  scenes.push(newScene);
  writeJson(SCENES_FILE, scenes);
  res.status(201).json(newScene);
});

app.put('/api/scenes/:id', (req, res) => {
  const scenes = readJson(SCENES_FILE);
  const index = scenes.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Scene not found' });

  scenes[index] = {
    ...scenes[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  writeJson(SCENES_FILE, scenes);
  res.json(scenes[index]);
});

app.delete('/api/scenes/:id', (req, res) => {
  let scenes = readJson(SCENES_FILE);
  const scene = scenes.find(s => s.id === req.params.id);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });

  scenes = scenes.filter(s => s.id !== req.params.id);
  writeJson(SCENES_FILE, scenes);
  res.json({ success: true });
});

app.get('/api/share/:shareId', (req, res) => {
  const scenes = readJson(SCENES_FILE);
  const scene = scenes.find(s => s.shareId === req.params.shareId);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });
  res.json(scene);
});

const seedDefaultFurniture = () => {
  const furniture = readJson(FURNITURE_FILE);
  if (furniture.length > 0) return;

  const defaultFurniture = [
    {
      id: uuidv4(),
      name: '现代沙发',
      category: '沙发',
      description: '三人座现代风格沙发',
      modelUrl: null,
      thumbnailUrl: null,
      width: 2.2,
      height: 0.8,
      depth: 0.9,
      color: '#8B4513',
      type: 'sofa',
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '咖啡桌',
      category: '桌子',
      description: '长方形咖啡桌',
      modelUrl: null,
      thumbnailUrl: null,
      width: 1.2,
      height: 0.45,
      depth: 0.6,
      color: '#D2691E',
      type: 'table',
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '餐椅',
      category: '椅子',
      description: '简约风格餐椅',
      modelUrl: null,
      thumbnailUrl: null,
      width: 0.45,
      height: 0.9,
      depth: 0.5,
      color: '#A0522D',
      type: 'chair',
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '书架',
      category: '柜子',
      description: '五层开放式书架',
      modelUrl: null,
      thumbnailUrl: null,
      width: 1.0,
      height: 2.0,
      depth: 0.3,
      color: '#8B7355',
      type: 'bookshelf',
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '落地灯',
      category: '灯具',
      description: '现代落地灯',
      modelUrl: null,
      thumbnailUrl: null,
      width: 0.4,
      height: 1.6,
      depth: 0.4,
      color: '#2F4F4F',
      type: 'lamp',
      createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: '双人床',
      category: '床',
      description: '1.8米双人床',
      modelUrl: null,
      thumbnailUrl: null,
      width: 1.8,
      height: 0.5,
      depth: 2.0,
      color: '#F5F5DC',
      type: 'bed',
      createdAt: new Date().toISOString()
    }
  ];

  writeJson(FURNITURE_FILE, defaultFurniture);
  console.log('Default furniture items seeded.');
};

seedDefaultFurniture();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

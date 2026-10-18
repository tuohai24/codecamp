/* 官方 Scratch 运行引擎封装：scratch-vm + scratch-render + scratch-storage */
import { state } from '../api.js';

export const STAGE_W = 480;
export const STAGE_H = 360;
export const LAYER_ORDER = ['background', 'video', 'pen', 'sprite'];

export function libsReady() {
  return !!(window.VirtualMachine && window.ScratchRender && window.ScratchStorage);
}

/**
 * 位图（PNG/JPG）造型在加载时需要 v2 位图适配器做分辨率换算，
 * 官方 GUI 内部会自己 attach，独立播放器必须手动提供，否则报
 * "No V2 Bitmap adapter present."（表现为舞台空白、没有 canvas 内容）。
 */
function bitmapAdapter() {
  return {
    resize(canvas, width, height) {
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (width !== canvas.width || height !== canvas.height) ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, width, height);
      return out;
    },
  };
}

/** 创建一套官方 VM + 渲染器 */
export function createEngine(canvas, { interactive = true } = {}) {
  if (!libsReady()) throw new Error('Scratch 运行库没有加载成功');
  const ns = window.ScratchStorage;
  const StorageCtor = ns.ScratchStorage || ns;
  const storage = new StorageCtor();
  // 本地素材仓储：官方 VM 通过 storage.load 找素材，这里把新建的素材缓存在内存里
  const memAssets = new Map();
  const baseCreate = storage.createAsset.bind(storage);
  storage.createAsset = (...args) => {
    const asset = baseCreate(...args);
    if (asset && asset.assetId) memAssets.set(String(asset.assetId).split('.')[0], asset);
    return asset;
  };
  if (storage.addHelper) {
    storage.addHelper(
      {
        load: (assetType, assetId) => Promise.resolve(memAssets.get(String(assetId).split('.')[0]) || null),
      },
      50
    );
  }
  const vm = new window.VirtualMachine();
  vm.attachStorage(storage);
  const renderer = new window.ScratchRender(canvas);
  vm.attachRenderer(renderer);
  vm.attachV2BitmapAdapter(bitmapAdapter());
  if (renderer.setLayerGroupOrdering) renderer.setLayerGroupOrdering(LAYER_ORDER);
  vm.setCompatibilityMode(true);
  vm.setTurboMode(false);
  vm.start();
  if (interactive) attachInput(vm, canvas);
  return { vm, storage, renderer };
}

/** 加载 sb3 作品包（fetch 后交给官方 VM 解析） */
export async function loadSb3(vm, url) {
  const headers = state.token ? { Authorization: 'Bearer ' + state.token } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let msg = `作品加载失败 (${res.status})`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const buf = await res.arrayBuffer();
  await vm.loadProject(buf);
  return vm;
}

/** 鼠标 / 键盘事件转发给官方 VM（舞台坐标 480×360） */
export function attachInput(vm, canvas) {
  const toStage = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * STAGE_W,
      y: ((e.clientY - rect.top) / rect.height) * STAGE_H,
      canvasWidth: STAGE_W,
      canvasHeight: STAGE_H,
    };
  };
  canvas.addEventListener('pointermove', (e) => {
    vm.postIOData('mouse', { ...toStage(e), isDown: e.buttons === 1 });
  });
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    vm.postIOData('mouse', { ...toStage(e), isDown: true, isDownNew: true });
  });
  canvas.addEventListener('pointerup', (e) => {
    vm.postIOData('mouse', { ...toStage(e), isDown: false });
  });
  canvas.addEventListener('pointerleave', (e) => {
    vm.postIOData('mouse', { ...toStage(e), isDown: false });
  });

  const blockKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    vm.postIOData('keyboard', { key: e.key, isDown: true });
    if (blockKeys.has(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    vm.postIOData('keyboard', { key: e.key, isDown: false });
  });
}

function svgBox(text) {
  const m = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (m) return { w: Number(m[3]), h: Number(m[4]) };
  const w = /width\s*=\s*["']([\d.]+)/i.exec(text);
  const h = /height\s*=\s*["']([\d.]+)/i.exec(text);
  return { w: w ? Number(w[1]) : 100, h: h ? Number(h[1]) : 100 };
}

function imageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = url;
  });
}

/** 用一张图片（SVG 文本或位图 URL）新建角色 */
export async function addImageSprite(vm, storage, { name, svgText, url }) {
  let asset;
  let costume;
  if (svgText) {
    asset = storage.createAsset(storage.AssetType.ImageVector, storage.DataFormat.SVG, svgText, null, true);
    const box = svgBox(svgText);
    costume = {
      name: '造型1',
      dataFormat: 'svg',
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.svg`,
      rotationCenterX: box.w / 2,
      rotationCenterY: box.h / 2,
      bitmapResolution: 1,
    };
  } else {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ext = (url.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const format = ext === 'png' ? storage.DataFormat.PNG : storage.DataFormat.JPG;
    asset = storage.createAsset(storage.AssetType.ImageBitmap, format, new Uint8Array(buf), null, true);
    const size = await imageSize(url);
    costume = {
      name: '造型1',
      dataFormat: ext,
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.${ext}`,
      rotationCenterX: size.w / 2,
      rotationCenterY: size.h / 2,
      bitmapResolution: 1,
    };
  }
  const json = JSON.stringify({
    isStage: false,
    name: name || '角色',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [costume],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: true,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
  });
  const before = new Set(vm.runtime.targets.map((t) => t.id));
  await vm.addSprite(json);
  const created = vm.runtime.targets.find((t) => !t.isStage && !before.has(t.id));
  if (created) vm.setEditingTarget(created.id);
  return created;
}

/** 把一张图片设为舞台背景 */
export async function addBackdrop(vm, storage, { name, svgText, url }) {
  let asset;
  let backdrop;
  if (svgText) {
    asset = storage.createAsset(storage.AssetType.ImageVector, storage.DataFormat.SVG, svgText, null, true);
    const box = svgBox(svgText);
    backdrop = {
      name: name || '背景',
      dataFormat: 'svg',
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.svg`,
      rotationCenterX: box.w / 2,
      rotationCenterY: box.h / 2,
      bitmapResolution: 1,
    };
  } else {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ext = (url.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const format = ext === 'png' ? storage.DataFormat.PNG : storage.DataFormat.JPG;
    asset = storage.createAsset(storage.AssetType.ImageBitmap, format, new Uint8Array(buf), null, true);
    const size = await imageSize(url);
    backdrop = {
      name: name || '背景',
      dataFormat: ext,
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.${ext}`,
      rotationCenterX: size.w / 2,
      rotationCenterY: size.h / 2,
      bitmapResolution: 1,
    };
  }
  // 直接挂上 Asset，官方 VM 会走 loadCostumeFromAsset 快速路径
  backdrop.asset = asset;
  await vm.addBackdrop(backdrop.md5ext, backdrop);
  return backdrop;
}

/** 截图舞台（用于作品封面） */
export function stageShot(canvas, width = 480) {
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * STAGE_H) / STAGE_W);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch {
    return '';
  }
}

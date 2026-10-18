/* 社区作品播放器：按需加载官方 Scratch 运行库 */
import { createEngine, loadSb3, STAGE_W, STAGE_H } from './engine.js';

let loading = null;

function loadLibs() {
  if (window.VirtualMachine && window.ScratchRender && window.ScratchStorage) return Promise.resolve();
  if (loading) return loading;
  const files = [
    '/vendor/scratch/scratch-storage.js',
    '/vendor/scratch/scratch-render.js',
    '/vendor/scratch/scratch-vm.js',
  ];
  loading = files
    .reduce(
      (chain, src) =>
        chain.then(
          () =>
            new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = src;
              s.onload = resolve;
              s.onerror = () => reject(new Error('Scratch 运行库加载失败：' + src));
              document.head.appendChild(s);
            })
        ),
      Promise.resolve()
    )
    .then(() => {
      loading = null;
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/**
 * 在容器里挂载一个 Scratch 作品
 * @returns {Promise<{start:Function, stop:Function, destroy:Function, vm:any}>}
 */
export async function mountPlayer(container, { projectId, height = 360, maxWidth = 640 } = {}) {
  await loadLibs();
  container.innerHTML = `<canvas class="player-canvas" width="${STAGE_W}" height="${STAGE_H}"></canvas>`;
  const canvas = container.querySelector('canvas');
  canvas.style.width = '100%';
  canvas.style.maxWidth = maxWidth + 'px';
  canvas.style.aspectRatio = '4 / 3';
  canvas.style.borderRadius = '10px';
  canvas.style.background = '#87ceeb';
  canvas.style.display = 'block';

  const { vm } = createEngine(canvas);
  await loadSb3(vm, `/api/projects/${projectId}/sb3`);
  window.__lastPlayer = { vm };

  let destroyed = false;
  return {
    vm,
    start: () => {
      if (!destroyed) vm.greenFlag();
    },
    stop: () => vm.stopAll(),
    destroy: () => {
      destroyed = true;
      try {
        vm.stopAll();
        vm.runtime.dispose();
      } catch {}
    },
  };
}

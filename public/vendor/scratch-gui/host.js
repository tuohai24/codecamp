/* 官方 Scratch GUI 宿主：React + scratch-gui 原样渲染，只用官方 VM 的公开 API 存取作品 */
(function () {
  'use strict';

  // 版本标记：改过这个文件就顺手加一版，方便确认浏览器没有用旧缓存
  window.__ccHostVersion = '20261018b';

  var params = new URLSearchParams(location.search);
  var projectId = params.get('id') || '';

  function token() {
    try {
      return localStorage.getItem('cc_token') || '';
    } catch (e) {
      return '';
    }
  }

  function reply(msg) {
    msg.__cc = true;
    try {
      parent.postMessage(msg, '*');
    } catch (e) {}
  }

  // GUI 会自行创建并持有官方 VM，这里传一个实例只为满足它的必填 prop
  var bootstrapVm = new window.VirtualMachine();
  var guiVm = null;

  var Gui = window.GUI.default;
  var WrappedGui = window.GUI.AppStateHOC(Gui);
  try {
    window.GUI.setAppElement('#root');
  } catch (e) {}

  function activeVm() {
    return guiVm || bootstrapVm;
  }

  function waitForVm(timeout) {
    return new Promise(function (resolve) {
      if (guiVm) return resolve(guiVm);
      var start = Date.now();
      var timer = setInterval(function () {
        if (guiVm) {
          clearInterval(timer);
          resolve(guiVm);
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          resolve(bootstrapVm);
        }
      }, 40);
    });
  }

  function watchChanges(vm) {
    vm.on('PROJECT_CHANGED', function () {
      reply({ cc: 'changed' });
    });
  }

  var libReady = null;

  function render() {
    window.__guiInst = ReactDOM.render(
      React.createElement(WrappedGui, {
        vm: bootstrapVm,
        canEdit: true,
        onVmInit: function (v) {
          guiVm = v;
          window.__scratch = { vm: v };
          watchChanges(v);
          installStorage(v);
          libReady = loadLocalAssets(v);
        },
      }),
      document.getElementById('root')
    );
  }

  async function load(id) {
    var res = await fetch('/api/projects/' + id + '/sb3', {
      headers: token() ? { Authorization: 'Bearer ' + token() } : {},
    });
    if (!res.ok) throw new Error('作品加载失败（HTTP ' + res.status + '）');
    var buf = await res.arrayBuffer();
    await activeVm().loadProject(buf);
  }

  // 舞台截图：官方渲染器是 WebGL，draw 之后同一帧内取像素
  function snapshot() {
    try {
      var renderer = activeVm().runtime.renderer;
      if (!renderer) return null;
      renderer.draw();
      return renderer.canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  async function save() {
    var blob = await activeVm().saveProjectSb3();
    var res = await fetch('/api/projects/' + projectId + '/sb3', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        Authorization: 'Bearer ' + token(),
      },
      body: blob,
    });
    if (!res.ok) throw new Error('保存失败（HTTP ' + res.status + '）');
    var json = await res.json().catch(function () {
      return {};
    });
    reply({ cc: 'saved', result: json, thumb: snapshot() });
  }

  /* ---------- 站内素材：让官方库直接从本站读取素材 ---------- */
  // 官方 scratch-storage 会按顺序询问每个 helper，命中站内素材就自己造 Asset，
  // 未命中返回 null 交给下一个 helper（官方条目仍走原有逻辑）。
  function installStorage(vm) {
    var storage = vm.runtime.storage;
    if (!storage || storage.__ccReady) return storage;
    storage.__ccReady = true;
    var ids = window.__ccLibIds || new Set();
    window.__ccLibIds = ids;

    storage.addHelper(
      {
        load: function (type, id, format) {
          var key = String(id || '').split('.')[0];
          if (!/^[0-9a-f]{32}$/i.test(key)) return null;
          var ext = String(format || 'png').toLowerCase();
          var url = '/api/scratch/asset/' + key + '.' + ext;
          return fetch(url)
            .then(function (res) {
              if (!res.ok) return null;
              return res.arrayBuffer();
            })
            .then(function (buf) {
              if (!buf) return null;
              var df = storage.DataFormat[ext.toUpperCase()] || storage.DataFormat.PNG;
              return storage.createAsset(type, df, new Uint8Array(buf), key, false);
            })
            .catch(function () {
              return null;
            });
        },
      },
      60
    );
    return storage;
  }

  function addLibraryItems(arr, items) {
    if (!arr || !items || !items.length) return 0;
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i] && arr[i].ccId) arr.splice(i, 1);
    for (var j = items.length - 1; j >= 0; j--) arr.unshift(items[j]);
    return items.length;
  }

  async function loadLocalAssets(vm) {
    var storage = installStorage(vm);
    if (!storage) return;
    var res;
    try {
      res = await fetch('/api/scratch/library');
      if (!res.ok) return;
    } catch (e) {
      return;
    }
    var data = await res.json();
    var counts = { sprites: 0, backdrops: 0, sounds: 0 };
    var ids = window.__ccLibIds;

    (data.sprites || []).forEach(function (item) {
      (item.costumes || []).forEach(function (c) {
        if (c.assetId) ids.add(c.assetId);
      });
    });
    (data.backdrops || []).forEach(function (item) {
      if (item.assetId) ids.add(item.assetId);
    });
    (data.sounds || []).forEach(function (item) {
      if (item.assetId) ids.add(item.assetId);
    });

    var arrays = window.__ccLibArrays || {};
    counts.sprites = addLibraryItems(arrays.sprites, data.sprites);
    counts.backdrops = addLibraryItems(arrays.backdrops, data.backdrops);
    counts.sounds = addLibraryItems(arrays.sounds, data.sounds);
    window.__ccLibraryCounts = counts;
    reply({ cc: 'library', counts: counts });
  }

  window.addEventListener('message', async function (ev) {
    var data = ev.data || {};
    if (!data || !data.cc) return;
    try {
      if (data.cc === 'save') {
        await save();
      } else if (data.cc === 'load') {
        await load(data.id || projectId);
        reply({ cc: 'loaded' });
      }
    } catch (err) {
      reply({ cc: 'error', message: String(err && err.message ? err.message : err) });
    }
  });

  // 官方 npm 构建是开发版，菜单栏会多出 Debug 入口；线上官方界面没有它
  function polishChrome() {
    var pending = false;
    var mark = function () {
      pending = false;
      var items = document.querySelectorAll('[class*="menu-bar_menu-bar-item"]');
      for (var i = 0; i < items.length; i++) {
        if ((items[i].textContent || '').trim() === 'Debug') {
          items[i].style.display = 'none';
          items[i].setAttribute('data-cc-hidden', '1');
        }
      }
    };
    mark();
    if (window.MutationObserver) {
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(mark);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ---------- 窄屏：舞台 / 积木 两个视图切换 ---------- */
  // 官方 GUI 的三栏布局在手机宽度下会把舞台挤到屏幕外，这里用底部工具条在一屏内切换两个视图，
  // 两个视图始终保留完整布局（只是互相遮挡），避免 Blockly / 舞台因为尺寸为 0 而停止渲染。
  // 窄屏下积木区宽度变化，重新测量并把脚本区域居中，避免学生进来看到一片空白
  function centerBlocks(fixScale) {
    try {
      var ws = window.Blockly && window.Blockly.getMainWorkspace && window.Blockly.getMainWorkspace();
      if (!ws) return;
      window.Blockly.svgResize(ws);
      if (fixScale && ws.scale < 0.85) ws.setScale(0.85);
      ws.scrollCenter();
    } catch (e) {}
  }

  // 桌面布局交给 GUI 自己算，把我们写过的尺寸撤掉（否则会和 GUI 互相撑大）
  function clearStageSize() {
    var stageEl = document.querySelector('[class*="stage_stage_"]');
    if (!stageEl) return;
    if (stageEl.style.getPropertyPriority('width') === 'important') stageEl.style.removeProperty('width');
    if (stageEl.style.getPropertyPriority('height') === 'important') stageEl.style.removeProperty('height');
  }

  // 舞台按可用空间等比缩放：GUI 写死了像素尺寸，只在窄屏/横屏下自己算
  function fitStage() {
    var stageEl = document.querySelector('[class*="stage_stage_"]');
    if (!stageEl) return;
    if (!document.documentElement.classList.contains('cc-m')) {
      clearStageSize();
      return;
    }
    var host = document.querySelector('[class*="gui_stage-and-target-wrapper"]');
    if (!host) return;
    var row = getComputedStyle(host).flexDirection.indexOf('row') === 0;
    // 基准一律封顶到视口：这样即使容器被内容撑大，也绝不会「舞台变宽 -> 容器变宽 -> 舞台更宽」
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var baseW = Math.min(host.clientWidth || vw, vw);
    var baseH = Math.min(host.clientHeight || vh, vh);
    var availH = baseH - (row ? 22 : 16);
    var availW = row ? Math.max(160, baseW - 410) : baseW - 16;
    if (availH < 60 || availW < 60) return;
    var w = Math.round(Math.min(availW, (availH * 4) / 3));
    var h = Math.round(w * 0.75);
    // 尺寸没变就别反复写样式，省得触发无谓的重排
    if (stageEl.style.getPropertyValue('width') === w + 'px' && stageEl.style.getPropertyValue('height') === h + 'px') return;
    stageEl.style.setProperty('width', w + 'px', 'important');
    stageEl.style.setProperty('height', h + 'px', 'important');
    try {
      var rt = activeVm().runtime;
      if (rt && rt.requestRedraw) rt.requestRedraw();
    } catch (e) {}
  }

  function setupMobile() {
    var bar = document.getElementById('cc-mbar');
    if (!bar) return;
    var isCompact = function () {
      return window.innerWidth < 900 || window.innerHeight < 470;
    };
    var setView = function (v) {
      document.documentElement.setAttribute('data-view', v);
      var btns = bar.querySelectorAll('[data-view]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-view') === v);
      }
      setTimeout(function () {
        window.dispatchEvent(new Event('resize'));
        fitStage();
        if (v === 'blocks') centerBlocks(false);
      }, 120);
    };
    var apply = function () {
      var on = isCompact();
      document.documentElement.classList.toggle('cc-m', on);
      if (on && !document.documentElement.getAttribute('data-view')) setView('stage');
      // 注意：这里不能再 dispatch resize —— apply 本身就是 resize 的回调，
      // 自己派发的事件会再次触发本函数，形成死循环（舞台会被一帧帧放大）。
      setTimeout(fitStage, 60);
      // GUI 自己也会在 resize 时重算舞台像素尺寸，等它算完再覆盖一次
      setTimeout(fitStage, 420);
    };

    var views = bar.querySelectorAll('[data-view]');
    for (var i = 0; i < views.length; i++) {
      views[i].addEventListener('click', function () {
        setView(this.getAttribute('data-view'));
      });
    }
    var acts = bar.querySelectorAll('[data-act]');
    for (var j = 0; j < acts.length; j++) {
      acts[j].addEventListener('click', function () {
        var vm = activeVm();
        if (this.getAttribute('data-act') === 'flag') vm.greenFlag();
        else vm.stopAll();
      });
    }

    var timer = null;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 180);
    });
    apply();
  }

  (async function init() {
    render();
    setupMobile();
    await waitForVm(8000);
    installStorage(activeVm());
    var store = window.__guiInst.store;
    store.dispatch({ type: 'scratch-gui/project-state/START_LOADING_VM_FILE_UPLOAD' });
    try {
      if (projectId) await load(projectId);
    } catch (err) {
      reply({ cc: 'error', message: String(err && err.message ? err.message : err) });
    }
    store.dispatch({ type: 'scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID' });
    // 站内素材注入完成后再放开遮罩，避免学生第一时间打开库看不到素材
    await Promise.race([
      libReady || Promise.resolve(),
      new Promise(function (resolve) {
        setTimeout(resolve, 3000);
      }),
    ]);
    polishChrome();
    // 窄屏：作品加载完成后把积木区居中，学生一眼能看到自己的脚本
    if (document.documentElement.classList.contains('cc-m')) {
      setTimeout(function () {
        fitStage();
        centerBlocks(true);
      }, 400);
      setTimeout(function () {
        fitStage();
      }, 1200);
    }
    reply({ cc: 'ready', projectId: projectId });
  })();
})();

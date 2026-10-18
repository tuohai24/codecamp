'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, now, DATA_DIR } = require('./db');
const { hashPassword, verifyPassword, sign } = require('./auth');
const { HttpError, sendBuffer, MIME } = require('./http-util');
const {
  getUser,
  invalidateUser,
  getSite,
  invalidateSite,
  getLibrary,
  invalidateLibrary,
  addView,
} = require('./cache');
const py = require('./python-runner');
const mirror = require('./scratch-mirror');
const {
  readBuffer: readAsset,
  md5: digest,
  probe,
  SOUND_EXTS,
} = require('./asset-meta');

const UPLOADS = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const SB3_DIR = path.join(DATA_DIR, 'sb3');
fs.mkdirSync(SB3_DIR, { recursive: true });

const pub = (u) =>
  u && {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    role: u.role,
    avatar: u.avatar,
    bio: u.bio,
    classId: u.class_id,
    status: u.status,
    createdAt: u.created_at,
  };

const getSetting = (key, def = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
};

/** 目录占用大小（系统状态页用，管理后台偶尔调用，不做缓存） */
function sizeOfDir(dir) {
  let total = 0;
  const walk = (p) => {
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch {}
      }
    }
  };
  walk(dir);
  return total;
}

function sendAsset(ctx, buf, contentType, cache) {  ctx.res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buf.length,
    'Cache-Control': cache || 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  ctx.res.end(buf);
  return undefined;
}

function saveDataUrl(dataUrl, prefix = 'up') {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, '文件格式错误，需要 dataURL');
  const mime = m[1];
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'audio/wav': 'wav',
    'audio/mpeg': 'mp3',
  };
  const ext = extMap[mime];
  if (!ext) throw new HttpError(400, `不支持的文件类型：${mime}`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw new HttpError(413, '文件超过 8MB');
  const name = `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return `/uploads/${name}`;
}

/** 学生在这份作业下保存的创作草稿（作品被删掉时自动解除关联） */
function workOf(assignmentId, studentId) {
  const row = db
    .prepare(
      `SELECT w.project_id, p.title, p.type, p.updated_at, p.published
       FROM assignment_works w LEFT JOIN projects p ON p.id = w.project_id
       WHERE w.assignment_id = ? AND w.student_id = ?`
    )
    .get(assignmentId, studentId);
  if (!row) return null;
  if (!row.title) {
    db.prepare('DELETE FROM assignment_works WHERE assignment_id = ? AND student_id = ?').run(assignmentId, studentId);
    return null;
  }
  return {
    projectId: row.project_id,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
    published: row.published,
  };
}

/** 作业要求正文：支持 Markdown，最多 20000 字符；超限直接报错而不是静默截断 */
const DESC_LIMIT = 20000;
function checkDescription(v) {
  const s = String(v == null ? '' : v);
  if (s.length > DESC_LIMIT) throw new HttpError(400, `作业要求最多 ${DESC_LIMIT} 字符（当前 ${s.length}）`);
  return s;
}

function buildApi(r) {
  // ---------- 站点信息 ----------
  // 首页每次加载都会打这个接口，统计走 20s 缓存，避免四次全表 COUNT
  r.get('/api/site', null, () =>
    getSite(() => ({
      name: getSetting('site_name', 'CodeCamp 少儿编程学堂'),
      slogan: getSetting('site_slogan', ''),
      allowRegister: getSetting('allow_register', '1') === '1',
      stats: {
        works: db.prepare('SELECT COUNT(*) c FROM projects WHERE published=1').get().c,
        students: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
        teachers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='teacher'").get().c,
        assets: db.prepare('SELECT COUNT(*) c FROM assets').get().c,
      },
    }))
  );

  // ---------- 认证 ----------
  r.post('/api/auth/register', null, (ctx) => {
    if (getSetting('allow_register', '1') !== '1') throw new HttpError(403, '站点已关闭注册');
    const { username, password, nickname } = ctx.body;
    if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new HttpError(400, '用户名需 3-20 位字母数字下划线');
    if (!password || String(password).length < 6) throw new HttpError(400, '密码至少 6 位');
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new HttpError(409, '用户名已存在');
    const info = db
      .prepare('INSERT INTO users (username,password,nickname,role,avatar,bio,class_id,status,created_at) VALUES (?,?,?,?,?,?,?,1,?)')
      .run(username, hashPassword(password), (nickname || username).slice(0, 20), 'student', '', '', null, now());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    return { token: sign({ uid: user.id, role: user.role }), user: pub(user) };
  });

  r.post('/api/auth/login', null, (ctx) => {
    const { username, password } = ctx.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
    if (!user || !verifyPassword(password, user.password)) throw new HttpError(401, '用户名或密码错误');
    if (!user.status) throw new HttpError(403, '账号已被禁用，请联系管理员');
    return { token: sign({ uid: user.id, role: user.role }), user: pub(user) };
  });

  r.get('/api/auth/me', 'any', (ctx) => {
    const u = pub(ctx.user);
    if (u.classId) {
      const c = db.prepare('SELECT id,name,code FROM classes WHERE id = ?').get(u.classId);
      u.className = c ? c.name : '';
    }
    return u;
  });

  r.patch('/api/auth/me', 'any', (ctx) => {
    const { nickname, bio, avatar, password, oldPassword } = ctx.body;
    if (nickname) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(String(nickname).slice(0, 20), ctx.user.id);
    if (bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(String(bio).slice(0, 200), ctx.user.id);
    if (avatar !== undefined) {
      const url = String(avatar || '').startsWith('data:') ? saveDataUrl(avatar, 'avatar') : String(avatar || '');
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, ctx.user.id);
    }
    if (password) {
      if (!verifyPassword(oldPassword, ctx.user.password)) throw new HttpError(400, '原密码不正确');
      if (String(password).length < 6) throw new HttpError(400, '新密码至少 6 位');
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), ctx.user.id);
    }
    invalidateUser(ctx.user.id);
    return pub(db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.user.id));
  });

  // ---------- 作品 ----------
  const projectSelect = `
    SELECT p.id,p.user_id,p.type,p.title,p.description,p.thumb,p.published,p.views,p.created_at,p.updated_at,
           u.nickname,u.avatar,
           (SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id) AS likes,
           (SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id) AS comments,
           CASE WHEN ? IS NOT NULL THEN EXISTS(SELECT 1 FROM likes l2 WHERE l2.project_id=p.id AND l2.user_id=?) ELSE 0 END AS liked
    FROM projects p JOIN users u ON u.id=p.user_id`;

  r.get('/api/projects', null, (ctx) => {
    const q = ctx.query;
    const uid = ctx.user ? ctx.user.id : null;
    const where = [];
    const args = [];
    if (q.mine === '1') {
      if (!ctx.user) throw new HttpError(401, '请先登录');
      where.push('p.user_id = ?');
      args.push(uid);
      if (q.type) {
        where.push('p.type = ?');
        args.push(q.type);
      }
    } else {
      where.push('p.published = 1');
      if (q.type) {
        where.push('p.type = ?');
        args.push(q.type);
      }
      if (q.author) {
        where.push('p.user_id = ?');
        args.push(Number(q.author));
      }
      if (q.q) {
        where.push('(p.title LIKE ? OR p.description LIKE ?)');
        args.push(`%${q.q}%`, `%${q.q}%`);
      }
    }
    const sort = q.sort === 'hot' ? 'likes DESC, p.views DESC' : 'p.updated_at DESC';
    const limit = Math.min(Number(q.limit) || 24, 60);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const rows = db
      .prepare(`${projectSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(uid, uid, ...args, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) c FROM projects p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).get(...args).c;
    return { items: rows, total };
  });

  r.post('/api/projects', 'any', (ctx) => {
    const type = ctx.body.type === 'python' ? 'python' : 'scratch';
    const title = String(ctx.body.title || (type === 'scratch' ? '未命名作品' : '未命名 Python 作品')).slice(0, 40);
    const data =
      type === 'python'
        ? JSON.stringify({ code: String(ctx.body.code || 'print("Hello, CodeCamp!")\n') })
        : JSON.stringify(ctx.body.data || { format: 'sb3' });
    const t = now();
    const info = db
      .prepare('INSERT INTO projects (user_id,type,title,description,data,thumb,published,views,created_at,updated_at) VALUES (?,?,?,?,?,?,0,0,?,?)')
      .run(ctx.user.id, type, title, '', data, '', t, t);
    // 新建 Scratch 作品直接落一份官方起始工程，打开编辑器即可用
    if (type === 'scratch') {
      try {
        fs.writeFileSync(path.join(SB3_DIR, `${info.lastInsertRowid}.sb3`), require('./seed-scratch').starterSb3());
      } catch (e) {
        console.warn('起始作品生成失败', e.message);
      }
    }
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  });

  // 老师可以查看本班作业里学生提交的作品，即使学生没有发布（否则草稿无法批改）
  const teacherCanGrade = (projectId, user) => {
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) return false;
    return !!db
      .prepare(
        `SELECT 1 FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE s.project_id = ? AND (a.teacher_id = ? OR ? = 'admin')`
      )
      .get(projectId, user.id, user.role);
  };

  // 详情页一次查询拿全（含 data），比原来「先查列表字段再查 data」少一次往返
  const projectDetailSelect = projectSelect.replace('SELECT p.id', 'SELECT p.data,p.id');

  r.get('/api/projects/:id', null, (ctx) => {
    const uid = ctx.user ? ctx.user.id : null;
    const p = db.prepare(`${projectDetailSelect} WHERE p.id = ?`).get(uid, uid, Number(ctx.params.id));
    if (!p) throw new HttpError(404, '作品不存在');
    const canSee = p.published || (ctx.user && (ctx.user.id === p.user_id || ctx.user.role === 'admin' || teacherCanGrade(p.id, ctx.user)));
    if (!canSee) throw new HttpError(403, '作品未发布');
    addView('project', p.id);
    p.views += 1;
    try {
      p.data = JSON.parse(p.data || '{}');
    } catch {
      p.data = {};
    }
    p.isOwner = !!ctx.user && ctx.user.id === p.user_id;
    return p;
  });

  r.patch('/api/projects/:id', 'any', (ctx) => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(ctx.params.id));
    if (!p) throw new HttpError(404, '作品不存在');
    if (p.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '无权修改该作品');
    const b = ctx.body;
    if (b.title !== undefined) db.prepare('UPDATE projects SET title = ? WHERE id = ?').run(String(b.title).slice(0, 40) || p.title, p.id);
    if (b.description !== undefined) db.prepare('UPDATE projects SET description = ? WHERE id = ?').run(String(b.description).slice(0, 500), p.id);
    if (b.data !== undefined) db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify(b.data), p.id);
    if (b.thumb !== undefined) {
      const url = String(b.thumb || '').startsWith('data:') ? saveDataUrl(b.thumb, 'thumb') : String(b.thumb || '');
      db.prepare('UPDATE projects SET thumb = ? WHERE id = ?').run(url, p.id);
    }
    if (b.published !== undefined) db.prepare('UPDATE projects SET published = ? WHERE id = ?').run(b.published ? 1 : 0, p.id);
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), p.id);
    const out = db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id);
    out.data = JSON.parse(out.data);
    return out;
  });

  /* ---------- 官方 Scratch 作品包（sb3） ---------- */
  const canEditProject = (ctx, p) => {
    if (!p) throw new HttpError(404, '作品不存在');
    if (p.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '无权修改该作品');
  };
  const canReadProject = (ctx, p) => {
    if (!p) throw new HttpError(404, '作品不存在');
    if (p.published) return;
    if (!ctx.user) throw new HttpError(403, '作品未发布');
    if (ctx.user.id !== p.user_id && ctx.user.role !== 'admin' && !teacherCanGrade(p.id, ctx.user)) throw new HttpError(403, '作品未发布');
  };

  r.get('/api/scratch/starter', null, (ctx) => {
    sendBuffer(ctx.res, require('./seed-scratch').starterSb3());
    return undefined;
  });

  r.put(
    '/api/projects/:id/sb3',
    'any',
    (ctx) => {
      const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(ctx.params.id));
      canEditProject(ctx, p);
      const buf = ctx.raw;
      if (!buf || buf.length < 64) throw new HttpError(400, '作品数据为空');
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new HttpError(400, '不是合法的 sb3 作品包');
      fs.writeFileSync(path.join(SB3_DIR, `${p.id}.sb3`), buf);
      db.prepare('UPDATE projects SET data = ?, type = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify({ format: 'sb3', size: buf.length }),
        'scratch',
        now(),
        p.id
      );
      return { ok: true, size: buf.length };
    },
    { raw: true, limit: 40 * 1024 * 1024 }
  );

  r.get('/api/projects/:id/sb3', null, (ctx) => {
    const p = db.prepare('SELECT id,user_id,published,type FROM projects WHERE id = ?').get(Number(ctx.params.id));
    canReadProject(ctx, p);
    const file = path.join(SB3_DIR, `${p.id}.sb3`);
    if (!fs.existsSync(file)) throw new HttpError(404, '该作品还没有 Scratch 工程文件');
    sendBuffer(ctx.res, fs.readFileSync(file), 'application/octet-stream');
    return undefined;
  });

  r.delete('/api/projects/:id', 'any', (ctx) => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(ctx.params.id));    if (!p) throw new HttpError(404, '作品不存在');
    if (p.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '无权删除该作品');
    db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
    try {
      fs.rmSync(path.join(SB3_DIR, `${p.id}.sb3`), { force: true });
    } catch {}
    db.prepare('DELETE FROM likes WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM comments WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM shares WHERE project_id = ?').run(p.id);
    db.prepare('UPDATE submissions SET status = ? WHERE project_id = ?').run('missing', p.id);
    // 作业草稿指向的作品被删掉后，解除关联，学生下次「去完成」会重新建一份
    db.prepare('DELETE FROM assignment_works WHERE project_id = ?').run(p.id);
    return { ok: true };
  });

  r.post('/api/projects/:id/like', 'any', (ctx) => {
    const id = Number(ctx.params.id);
    const has = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND project_id = ?').get(ctx.user.id, id);
    if (has) db.prepare('DELETE FROM likes WHERE user_id = ? AND project_id = ?').run(ctx.user.id, id);
    else db.prepare('INSERT INTO likes (user_id,project_id,created_at) VALUES (?,?,?)').run(ctx.user.id, id, now());
    const c = db.prepare('SELECT COUNT(*) c FROM likes WHERE project_id = ?').get(id).c;
    return { liked: !has, likes: c };
  });

  r.get('/api/projects/:id/comments', null, (ctx) => {
    return db
      .prepare('SELECT c.id,c.content,c.created_at,u.id uid,u.nickname,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.project_id = ? ORDER BY c.id DESC LIMIT 100')
      .all(Number(ctx.params.id));
  });

  r.post('/api/projects/:id/comments', 'any', (ctx) => {
    const content = String(ctx.body.content || '').trim();
    if (!content) throw new HttpError(400, '评论内容不能为空');
    if (content.length > 300) throw new HttpError(400, '评论过长');
    db.prepare('INSERT INTO comments (project_id,user_id,content,created_at) VALUES (?,?,?,?)').run(Number(ctx.params.id), ctx.user.id, content, now());
    return { ok: true };
  });

  r.delete('/api/comments/:id', 'any', (ctx) => {
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(ctx.params.id));
    if (!c) throw new HttpError(404, '评论不存在');
    if (c.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '无权删除');
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    return { ok: true };
  });

  // ---------- 分享链接 ----------
  // 作者可以为作品生成一个对外可见的分享页，并挑选页面上要显示的常用按键。
  const SHARE_BUTTONS = ['run', 'like', 'comment', 'remix', 'download', 'fullscreen', 'explore', 'author'];
  const DEFAULT_BUTTONS = ['run', 'like', 'comment', 'remix', 'explore'];
  const parseButtons = (raw) => {
    try {
      const v = JSON.parse(raw || '[]');
      return Array.isArray(v) ? v.filter((k) => SHARE_BUTTONS.includes(k)) : [];
    } catch {
      return [];
    }
  };
  const normalizeButtons = (v) => {
    const list = (Array.isArray(v) ? v : []).filter((k) => SHARE_BUTTONS.includes(k));
    const uniq = Array.from(new Set(list)).slice(0, 6);
    return uniq.length ? uniq : DEFAULT_BUTTONS;
  };
  const shareView = (s) => ({
    id: s.id,
    token: s.token,
    projectId: s.project_id,
    title: s.title || '',
    note: s.note || '',
    buttons: parseButtons(s.buttons),
    views: s.views,
    active: !!s.active,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  });

  const ownerOnly = (ctx, projectId) => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId));
    if (!p) throw new HttpError(404, '作品不存在');
    if (p.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '只能分享自己的作品');
    return p;
  };

  r.get('/api/projects/:id/share', 'any', (ctx) => {
    const p = ownerOnly(ctx, ctx.params.id);
    const row = db.prepare('SELECT * FROM shares WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(p.id);
    return { share: row ? shareView(row) : null, published: !!p.published };
  });

  r.post('/api/projects/:id/share', 'any', (ctx) => {
    const p = ownerOnly(ctx, ctx.params.id);
    if (!p.published) throw new HttpError(400, '作品发布后才能生成分享链接');
    const b = ctx.body || {};
    const buttons = normalizeButtons(b.buttons ? b.buttons : DEFAULT_BUTTONS);
    const t = now();
    const exist = db.prepare('SELECT * FROM shares WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(p.id);
    if (exist) {
      db.prepare('UPDATE shares SET title = ?, note = ?, buttons = ?, active = 1, updated_at = ? WHERE id = ?').run(
        String(b.title ?? exist.title).slice(0, 60),
        String(b.note ?? exist.note).slice(0, 300),
        JSON.stringify(buttons),
        t,
        exist.id
      );
      return { share: shareView(db.prepare('SELECT * FROM shares WHERE id = ?').get(exist.id)) };
    }
    const token = crypto.randomBytes(5).toString('hex');
    const info = db
      .prepare('INSERT INTO shares (token,project_id,user_id,title,note,buttons,views,active,created_at,updated_at) VALUES (?,?,?,?,?,?,0,1,?,?)')
      .run(token, p.id, ctx.user.id, String(b.title || p.title).slice(0, 60), String(b.note || '').slice(0, 300), JSON.stringify(buttons), t, t);
    return { share: shareView(db.prepare('SELECT * FROM shares WHERE id = ?').get(info.lastInsertRowid)) };
  });

  r.patch('/api/shares/:id', 'any', (ctx) => {
    const s = db.prepare('SELECT * FROM shares WHERE id = ?').get(Number(ctx.params.id));
    if (!s) throw new HttpError(404, '分享链接不存在');
    if (s.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '无权修改');
    const b = ctx.body || {};
    db.prepare('UPDATE shares SET title = ?, note = ?, buttons = ?, updated_at = ? WHERE id = ?').run(
      String(b.title ?? s.title).slice(0, 60),
      String(b.note ?? s.note).slice(0, 300),
      JSON.stringify(normalizeButtons(b.buttons !== undefined ? b.buttons : parseButtons(s.buttons))),
      now(),
      s.id
    );
    return { share: shareView(db.prepare('SELECT * FROM shares WHERE id = ?').get(s.id)) };
  });

  r.delete('/api/shares/:id', 'any', (ctx) => {
    const s = db.prepare('SELECT * FROM shares WHERE id = ?').get(Number(ctx.params.id));
    if (!s) throw new HttpError(404, '分享链接不存在');
    if (s.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, '无权删除');
    db.prepare('DELETE FROM shares WHERE id = ?').run(s.id);
    return { ok: true };
  });

  // 分享页数据：不需要登录也能看，但作者本人能看到「设置」入口
  r.get('/api/share/:token', null, (ctx) => {
    const s = db.prepare('SELECT * FROM shares WHERE token = ? AND active = 1').get(String(ctx.params.token || ''));
    if (!s) throw new HttpError(404, '分享链接不存在或已失效');
    const p = db
      .prepare(
        `SELECT p.data,p.id,p.user_id,p.type,p.title,p.description,p.thumb,p.published,p.views,p.created_at,p.updated_at,
                u.nickname,u.avatar,u.bio,
                (SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id) AS likes,
                (SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id) AS comments,
                CASE WHEN ? IS NOT NULL THEN EXISTS(SELECT 1 FROM likes l2 WHERE l2.project_id=p.id AND l2.user_id=?) ELSE 0 END AS liked
         FROM projects p JOIN users u ON u.id=p.user_id WHERE p.id = ?`
      )
      .get(ctx.user ? ctx.user.id : null, ctx.user ? ctx.user.id : null, s.project_id);
    if (!p) throw new HttpError(404, '作品已被删除');
    const isOwner = !!ctx.user && (ctx.user.id === p.user_id || ctx.user.role === 'admin');
    if (!p.published && !isOwner) throw new HttpError(403, '作者还没有发布这个作品');
    try {
      p.data = JSON.parse(p.data || '{}');
    } catch {
      p.data = {};
    }
    // 浏览量在内存累加，每 5s 合并成一次事务写库
    addView('share', s.id);
    addView('project', p.id);
    p.views += 1;
    return {
      share: { ...shareView(s), views: s.views + 1 },
      project: p,
      isOwner,
    };
  });

  // 「一起改编」：把作品复制一份到自己的账号，方便二次创作
  r.post('/api/share/:token/remix', 'any', (ctx) => {
    const s = db.prepare('SELECT * FROM shares WHERE token = ? AND active = 1').get(String(ctx.params.token || ''));
    if (!s) throw new HttpError(404, '分享链接不存在或已失效');
    const src = db.prepare('SELECT * FROM projects WHERE id = ?').get(s.project_id);
    if (!src) throw new HttpError(404, '作品已被删除');
    if (!src.published && ctx.user.id !== src.user_id && ctx.user.role !== 'admin') throw new HttpError(403, '作者还没有发布这个作品');
    const t = now();
    const title = `${src.title} · 改编`.slice(0, 40);
    const info = db
      .prepare('INSERT INTO projects (user_id,type,title,description,data,thumb,published,views,created_at,updated_at) VALUES (?,?,?,?,?,?,0,0,?,?)')
      .run(ctx.user.id, src.type, title, `改编自 ${src.title}`.slice(0, 500), src.data, '', t, t);
    const newId = Number(info.lastInsertRowid);
    if (src.type === 'scratch') {
      const from = path.join(SB3_DIR, `${src.id}.sb3`);
      if (fs.existsSync(from)) {
        try {
          fs.copyFileSync(from, path.join(SB3_DIR, `${newId}.sb3`));
        } catch (e) {
          console.warn('复制 sb3 失败', e.message);
        }
      }
    }
    return { projectId: newId, type: src.type };
  });

  // ---------- 素材库（角色 / 背景 / 声音） ----------
  const ASSET_KINDS = ['sprite', 'backdrop', 'sound'];
  const normalizeKind = (k) => (k === 'costume' ? 'sprite' : String(k || ''));
  const assetView = (a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    tags: a.tags,
    url: a.url,
    format: a.format,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    duration: a.duration,
    created_at: a.created_at,
  });

  // 老素材 / 内置素材入库时没有元数据，这里按需补算并落库，保证 md5 与尺寸可用
  function ensureMeta(a) {
    if (a.md5 && a.format) return a;
    let buf;
    try {
      buf = readAsset(a.url);
    } catch {
      return a;
    }
    const ext = (String(a.url).split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const info = probe(buf, ext);
    const md5 = digest(buf);
    db.prepare('UPDATE assets SET md5 = ?, format = ?, width = ?, height = ?, bytes = ? WHERE id = ?').run(
      md5,
      info.format,
      info.width,
      info.height,
      buf.length,
      a.id
    );
    return { ...a, md5, format: info.format, width: info.width, height: info.height, bytes: buf.length };
  }

  r.get('/api/assets', null, (ctx) => {
    const kind = normalizeKind(ctx.query.kind);
    const where = [];
    const args = [];
    if (kind) {
      where.push('kind = ?');
      args.push(kind);
    }
    if (ctx.query.q) {
      where.push('(name LIKE ? OR tags LIKE ?)');
      args.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`);
    }
    return db
      .prepare(
        `SELECT id,kind,name,tags,url,format,width,height,bytes,duration,created_at FROM assets ${
          where.length ? 'WHERE ' + where.join(' AND ') : ''
        } ORDER BY id DESC LIMIT 300`
      )
      .all(...args)
      .map(assetView);
  });

  r.post('/api/assets', ['admin', 'teacher'], (ctx) => {
    const kind = normalizeKind(ctx.body.kind);
    if (!ASSET_KINDS.includes(kind)) throw new HttpError(400, '素材类型只能是角色、背景或声音');
    const name = String(ctx.body.name || '').trim();
    if (!name) throw new HttpError(400, '请填写素材名称');

    const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(ctx.body.dataUrl || ''));
    if (!m) throw new HttpError(400, '文件格式错误，需要 dataURL');
    const mime = m[1].toLowerCase();
    const extMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/svg+xml': 'svg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
    };
    const ext = extMap[mime];
    if (!ext) throw new HttpError(400, `不支持的文件格式：${mime}`);
    if (kind === 'sound' && !SOUND_EXTS.has(ext)) throw new HttpError(400, '声音库只接受 WAV / MP3');
    if (kind !== 'sound' && !['png', 'jpg', 'svg'].includes(ext)) {
      throw new HttpError(400, '角色和背景只接受 PNG / JPG / SVG');
    }

    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) throw new HttpError(413, '文件超过 8MB');
    const md5 = digest(buf);
    const dup = db.prepare('SELECT id,name FROM assets WHERE md5 = ? AND kind = ?').get(md5, kind);
    if (dup) throw new HttpError(409, `该素材已存在：${dup.name}`);
    const file = `${md5}.${ext}`;
    const target = path.join(UPLOADS, file);
    if (!fs.existsSync(target)) fs.writeFileSync(target, buf);

    const info = probe(buf, ext);
    let rate = Number(ctx.body.rate) || info.rate || 0;
    let duration = Number(ctx.body.duration) || info.duration || 0;
    if (kind === 'sound' && !rate) rate = 44100;
    if (kind === 'sound' && !duration) duration = 1;
    const sampleCount = kind === 'sound' ? Math.max(1, Math.round(duration * rate)) : 0;

    const info2 = db
      .prepare(
        `INSERT INTO assets (kind,name,tags,url,uploader_id,created_at,format,md5,width,height,bytes,rate,duration)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        kind,
        name.slice(0, 30),
        String(ctx.body.tags || '').slice(0, 60),
        `/uploads/${file}`,
        ctx.user.id,
        now(),
        ext,
        md5,
        info.width || 0,
        info.height || 0,
        buf.length,
        rate,
        duration
      );
    const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(info2.lastInsertRowid);
    invalidateLibrary();
    return { ...assetView(row), sampleCount };
  });

  r.patch('/api/assets/:id', ['admin', 'teacher'], (ctx) => {
    const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '素材不存在');
    const b = ctx.body;
    db.prepare('UPDATE assets SET name = ?, tags = ? WHERE id = ?').run(
      String(b.name ?? a.name).slice(0, 30),
      String(b.tags ?? a.tags).slice(0, 60),
      a.id
    );
    invalidateLibrary();
    return assetView(db.prepare('SELECT * FROM assets WHERE id = ?').get(a.id));
  });

  r.delete('/api/assets/:id', ['admin', 'teacher'], (ctx) => {
    const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '素材不存在');
    db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
    invalidateLibrary();
    // 同一份文件可能被多条素材复用（按 md5 去重），确认没有引用后再删文件
    const stillUsed = db.prepare('SELECT COUNT(*) c FROM assets WHERE url = ?').get(a.url).c;
    if (!stillUsed && a.url.startsWith('/uploads/')) {
      try {
        fs.unlinkSync(path.join(DATA_DIR, a.url.replace('/uploads/', 'uploads/')));
      } catch {}
    }
    return { ok: true };
  });

  // ---------- 图片上传（作业插图 / 公告配图） ----------
  // 前端把文件读成 dataURL 提交，这里落盘并返回站内 URL，可直接写进 Markdown：![](url)
  r.post('/api/uploads/image', ['admin', 'teacher'], (ctx) => {
    const dataUrl = String((ctx.body && ctx.body.dataUrl) || '');
    if (!/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(dataUrl)) {
      throw new HttpError(400, '只支持 PNG / JPG / GIF / WebP / SVG 图片');
    }
    return { url: saveDataUrl(dataUrl, 'img') };
  });

  // ---------- 官方 Scratch 素材库对接 ----------
  // 官方编辑器把角色库 / 背景库 / 声音库的数据内联在构建产物里，这里把站内素材
  // 转成同构的数据条目，由编辑器宿主页合并进官方库，素材本身通过下面的接口提供。
  const LIB_TAGS = ['站内素材'];

  function libraryCostume(a) {
    const fmt = a.format || 'png';
    return {
      assetId: a.md5,
      name: a.name,
      bitmapResolution: 1,
      md5ext: `${a.md5}.${fmt}`,
      dataFormat: fmt,
      rotationCenterX: Math.round((a.width || 0) / 2),
      rotationCenterY: Math.round((a.height || 0) / 2),
    };
  }

  r.get('/api/scratch/library', null, () =>
    getLibrary(() => {
    const rows = db
      .prepare("SELECT * FROM assets WHERE kind IN ('sprite','backdrop','sound') ORDER BY id ASC")
      .all()
      .map(ensureMeta);
    const out = { sprites: [], backdrops: [], sounds: [] };
    for (const a of rows) {
      if (!a.md5) continue;
      if (a.kind === 'sprite') {
        out.sprites.push({
          name: a.name,
          tags: LIB_TAGS,
          isStage: false,
          variables: {},
          lists: {},
          broadcasts: {},
          blocks: {},
          comments: {},
          currentCostume: 0,
          costumes: [libraryCostume(a)],
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
          ccId: a.id,
        });
      } else if (a.kind === 'backdrop') {
        out.backdrops.push({ name: a.name, tags: LIB_TAGS, ...libraryCostume(a), ccId: a.id });
      } else if (a.kind === 'sound') {
        const rate = a.rate || 44100;
        out.sounds.push({
          name: a.name,
          tags: LIB_TAGS,
          assetId: a.md5,
          dataFormat: a.format || 'wav',
          md5ext: `${a.md5}.${a.format || 'wav'}`,
          sampleCount: Math.max(1, Math.round((a.duration || 1) * rate)),
          rate,
          ccId: a.id,
        });
      }
    }
    return out;
    })
  );

  r.get('/api/scratch/asset/:file', null, async (ctx) => {
    const file = String(ctx.params.file || '');
    const m = /^([0-9a-f]{32})\.([a-z0-9]+)$/i.exec(file);
    if (!m) throw new HttpError(404, '素材不存在');

    // 1) 站内素材（后台上传的角色 / 背景 / 声音）
    const row = db.prepare('SELECT url,format FROM assets WHERE md5 = ? LIMIT 1').get(m[1].toLowerCase());
    if (row) {
      let buf;
      try {
        buf = readAsset(row.url);
      } catch {
        throw new HttpError(404, '素材文件缺失');
      }
      const ext = '.' + String(row.format || m[2]).toLowerCase();
      return sendAsset(ctx, buf, MIME[ext] || 'application/octet-stream');
    }

    // 2) 官方素材：本地镜像 → 回源抓取并落盘
    const got = mirror.getLocal(file) || (await mirror.getAsset(file));
    if (!got) throw new HttpError(404, '素材不存在');
    return sendAsset(ctx, got.buf, mirror.mimeOf(got.ext), got.cached ? 'public, max-age=604800, immutable' : 'public, max-age=86400');
  });

  // ---------- 公开用户主页 ----------
  r.get('/api/users/:id', null, (ctx) => {
    const u = db.prepare('SELECT id,nickname,avatar,bio,role,created_at FROM users WHERE id = ?').get(Number(ctx.params.id));
    if (!u) throw new HttpError(404, '用户不存在');
    return u;
  });

  // ---------- 班级 ----------
  r.get('/api/classes', 'any', (ctx) => {
    let rows;
    if (ctx.user.role === 'admin') {
      rows = db.prepare('SELECT c.*, u.nickname teacher_name, (SELECT COUNT(*) FROM users s WHERE s.class_id=c.id) students FROM classes c LEFT JOIN users u ON u.id=c.teacher_id ORDER BY c.id').all();
    } else if (ctx.user.role === 'teacher') {
      rows = db
        .prepare('SELECT c.*, (SELECT COUNT(*) FROM users s WHERE s.class_id=c.id) students FROM classes c WHERE c.teacher_id = ? ORDER BY c.id')
        .all(ctx.user.id);
    } else {
      rows = db.prepare('SELECT c.* FROM classes c JOIN users u ON u.class_id=c.id WHERE u.id = ?').all(ctx.user.id);
    }
    return rows;
  });

  r.post('/api/classes', ['admin', 'teacher'], (ctx) => {
    const name = String(ctx.body.name || '').trim();
    if (!name) throw new HttpError(400, '请填写班级名称');
    const code = String(ctx.body.code || 'C' + Math.random().toString(36).slice(2, 7).toUpperCase());
    if (db.prepare('SELECT id FROM classes WHERE code = ?').get(code)) throw new HttpError(409, '班级码已存在');
    const teacherId = ctx.user.role === 'admin' ? Number(ctx.body.teacherId) || null : ctx.user.id;
    const info = db.prepare('INSERT INTO classes (name,code,teacher_id,created_at) VALUES (?,?,?,?)').run(name.slice(0, 40), code, teacherId, now());
    return db.prepare('SELECT * FROM classes WHERE id = ?').get(info.lastInsertRowid);
  });

  r.delete('/api/classes/:id', ['admin', 'teacher'], (ctx) => {
    const c = db.prepare('SELECT * FROM classes WHERE id = ?').get(Number(ctx.params.id));
    if (!c) throw new HttpError(404, '班级不存在');
    if (ctx.user.role === 'teacher' && c.teacher_id !== ctx.user.id) throw new HttpError(403, '无权操作该班级');
    db.prepare('UPDATE users SET class_id = NULL WHERE class_id = ?').run(c.id);
    db.prepare('DELETE FROM assignments WHERE class_id = ?').run(c.id);
    db.prepare('DELETE FROM classes WHERE id = ?').run(c.id);
    return { ok: true };
  });

  r.get('/api/classes/:id/students', ['admin', 'teacher'], (ctx) => {
    return db
      .prepare('SELECT id,username,nickname,avatar,status,created_at FROM users WHERE class_id = ? ORDER BY id')
      .all(Number(ctx.params.id));
  });

  // ---------- 作业 ----------
  r.get('/api/assignments', 'any', (ctx) => {
    const u = ctx.user;
    if (u.role === 'student') {
      if (!u.class_id) return [];
      return db
        .prepare(
          `SELECT a.*, t.nickname teacher_name,
             (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=?) AS submitted,
             (SELECT s.status FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=?) AS submit_status,
             (SELECT w.project_id FROM assignment_works w WHERE w.assignment_id=a.id AND w.student_id=?) AS work_project_id,
             (SELECT p.title FROM assignment_works w JOIN projects p ON p.id=w.project_id WHERE w.assignment_id=a.id AND w.student_id=?) AS work_title,
             (SELECT p.updated_at FROM assignment_works w JOIN projects p ON p.id=w.project_id WHERE w.assignment_id=a.id AND w.student_id=?) AS work_updated_at
           FROM assignments a LEFT JOIN users t ON t.id=a.teacher_id
           WHERE a.class_id = ? ORDER BY a.id DESC`
        )
        .all(u.id, u.id, u.id, u.id, u.id, u.class_id);
    }
    const where = u.role === 'admin' ? '' : 'WHERE a.teacher_id = ?';
    const args = u.role === 'admin' ? [] : [u.id];
    return db
      .prepare(
        `SELECT a.*, c.name class_name,
           (SELECT COUNT(*) FROM users s WHERE s.class_id=a.class_id) AS total,
           (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) AS submitted,
           (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.status='graded') AS graded
         FROM assignments a LEFT JOIN classes c ON c.id=a.class_id ${where} ORDER BY a.id DESC`
      )
      .all(...args);
  });

  r.post('/api/assignments', ['teacher', 'admin'], (ctx) => {
    const b = ctx.body;
    const classId = Number(b.classId);
    if (!classId) throw new HttpError(400, '请选择班级');
    if (!b.title) throw new HttpError(400, '请填写作业标题');
    const info = db
      .prepare('INSERT INTO assignments (teacher_id,class_id,title,description,type,due_at,starter,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(
        ctx.user.id,
        classId,
        String(b.title).slice(0, 60),
        // 作业要求支持 Markdown + 图片，上限 20000 字符（图片走 /uploads 链接，不占正文）
        checkDescription(b.description),
        b.type === 'python' ? 'python' : 'scratch',
        String(b.dueAt || ''),
        String(b.starter || ''),
        now()
      );
    return db.prepare('SELECT * FROM assignments WHERE id = ?').get(info.lastInsertRowid);
  });

  // 修改作业（老师可以随时补充要求 / 换图 / 改截止日期）
  r.patch('/api/assignments/:id', ['teacher', 'admin'], (ctx) => {
    const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '作业不存在');
    if (ctx.user.role !== 'admin' && a.teacher_id !== ctx.user.id) throw new HttpError(403, '无权修改');
    const b = ctx.body || {};
    db.prepare('UPDATE assignments SET title = ?, description = ?, type = ?, due_at = ?, starter = ? WHERE id = ?').run(
      b.title !== undefined ? String(b.title).slice(0, 60) || a.title : a.title,
      b.description !== undefined ? checkDescription(b.description) : a.description,
      b.type !== undefined ? (b.type === 'python' ? 'python' : 'scratch') : a.type,
      b.dueAt !== undefined ? String(b.dueAt) : a.due_at,
      b.starter !== undefined ? String(b.starter) : a.starter,
      a.id
    );
    return db.prepare('SELECT * FROM assignments WHERE id = ?').get(a.id);
  });

  r.get('/api/assignments/:id', 'any', (ctx) => {
    const a = db.prepare('SELECT a.*, c.name class_name FROM assignments a LEFT JOIN classes c ON c.id=a.class_id WHERE a.id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '作业不存在');
    const u = ctx.user;
    if (u.role === 'student') {
      if (!u.class_id || a.class_id !== u.class_id) throw new HttpError(403, '这份作业不属于你的班级');
      a.mySubmission = db.prepare('SELECT s.*, p.title project_title FROM submissions s LEFT JOIN projects p ON p.id=s.project_id WHERE s.assignment_id = ? AND s.student_id = ?').get(a.id, u.id) || null;
      a.work = workOf(a.id, u.id);
    } else {
      a.submissions = db
        .prepare(
          `SELECT s.*, u.nickname, u.username, p.title project_title
           FROM submissions s JOIN users u ON u.id=s.student_id LEFT JOIN projects p ON p.id=s.project_id
           WHERE s.assignment_id = ? ORDER BY s.updated_at DESC`
        )
        .all(a.id);
      a.students = db.prepare('SELECT id,nickname,username FROM users WHERE class_id = ?').all(a.class_id);
    }
    return a;
  });

  // 「去完成」：为学生准备（或复用）这份作业的创作草稿，前端拿到 id 后跳进对应编辑器
  r.post('/api/assignments/:id/start', 'any', (ctx) => {
    const u = ctx.user;
    if (u.role !== 'student') throw new HttpError(403, '只有学生可以从作业入口进入创作');
    const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '作业不存在');
    if (!u.class_id || a.class_id !== u.class_id) throw new HttpError(403, '这份作业不属于你的班级');

    const existing = workOf(a.id, u.id);
    if (existing) return { projectId: existing.projectId, type: existing.type || a.type, reused: true, title: existing.title };

    const type = a.type === 'python' ? 'python' : 'scratch';
    const title = a.title.slice(0, 40);
    const data =
      type === 'python'
        ? JSON.stringify({ code: String(a.starter || 'print("Hello, CodeCamp!")\n') })
        : JSON.stringify({ format: 'sb3' });
    const t = now();
    const info = db
      .prepare('INSERT INTO projects (user_id,type,title,description,data,thumb,published,views,created_at,updated_at) VALUES (?,?,?,?,?,?,0,0,?,?)')
      .run(u.id, type, title, `作业：${a.title}`.slice(0, 500), data, '', t, t);
    const projectId = Number(info.lastInsertRowid);
    if (type === 'scratch') {
      try {
        fs.writeFileSync(path.join(SB3_DIR, `${projectId}.sb3`), require('./seed-scratch').starterSb3());
      } catch (e) {
        console.warn('作业起始工程生成失败', e.message);
      }
    }
    db.prepare('INSERT INTO assignment_works (assignment_id,student_id,project_id,created_at) VALUES (?,?,?,?)').run(a.id, u.id, projectId, t);
    return { projectId, type, reused: false, title };
  });

  // 编辑器里的「作业要求」浮层：只有从作业入口进来、且作品确实是这份作业的草稿才返回内容
  r.get('/api/assignments/:id/brief', 'any', (ctx) => {
    const u = ctx.user;
    const a = db
      .prepare(
        `SELECT a.*, c.name class_name, t.nickname teacher_name
         FROM assignments a LEFT JOIN classes c ON c.id=a.class_id LEFT JOIN users t ON t.id=a.teacher_id
         WHERE a.id = ?`
      )
      .get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '作业不存在');
    const projectId = Number(ctx.query.project || 0);
    if (!projectId) throw new HttpError(400, '缺少作品参数');
    const link = db
      .prepare('SELECT 1 FROM assignment_works WHERE assignment_id = ? AND student_id = ? AND project_id = ?')
      .get(a.id, u.id, projectId);
    if (!link) throw new HttpError(403, '作业内容只能在作业入口打开的创作页查看');
    const submission =
      db.prepare('SELECT status,score,feedback FROM submissions WHERE assignment_id = ? AND student_id = ?').get(a.id, u.id) || null;
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      description: a.description || '',
      starter: a.starter || '',
      dueAt: a.due_at || '',
      className: a.class_name || '',
      teacherName: a.teacher_name || '',
      createdAt: a.created_at,
      submission,
    };
  });

  r.delete('/api/assignments/:id', ['teacher', 'admin'], (ctx) => {
    const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '作业不存在');
    if (ctx.user.role !== 'admin' && a.teacher_id !== ctx.user.id) throw new HttpError(403, '无权删除');
    db.prepare('DELETE FROM submissions WHERE assignment_id = ?').run(a.id);
    db.prepare('DELETE FROM assignment_works WHERE assignment_id = ?').run(a.id);
    db.prepare('DELETE FROM assignments WHERE id = ?').run(a.id);
    return { ok: true };
  });

  r.post('/api/assignments/:id/submit', 'any', (ctx) => {
    const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(ctx.params.id));
    if (!a) throw new HttpError(404, '作业不存在');
    if (ctx.user.role !== 'student') throw new HttpError(403, '仅学生可提交作业');
    if (!ctx.user.class_id || a.class_id !== ctx.user.class_id) throw new HttpError(403, '这份作业不属于你的班级');
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(ctx.body.projectId));
    if (!p || p.user_id !== ctx.user.id) throw new HttpError(400, '请选择自己的作品提交');
    const t = now();
    db.prepare(
      `INSERT INTO submissions (assignment_id,student_id,project_id,score,feedback,status,created_at,updated_at)
       VALUES (?,?,?,NULL,'','submitted',?,?)
       ON CONFLICT(assignment_id,student_id) DO UPDATE SET project_id=excluded.project_id, status='submitted', updated_at=excluded.updated_at`
    ).run(a.id, ctx.user.id, p.id, t, t);
    // 提交的项目同时作为这份作业的「我的草稿」，之后再点「继续完成」直接打开它
    db.prepare(
      `INSERT INTO assignment_works (assignment_id,student_id,project_id,created_at) VALUES (?,?,?,?)
       ON CONFLICT(assignment_id,student_id) DO UPDATE SET project_id=excluded.project_id`
    ).run(a.id, ctx.user.id, p.id, t);
    return { ok: true };
  });

  r.get('/api/submissions', 'any', (ctx) => {
    const u = ctx.user;
    if (u.role === 'student') {
      return db
        .prepare(
          `SELECT s.*, a.title assignment_title, a.type, p.title project_title
           FROM submissions s JOIN assignments a ON a.id=s.assignment_id LEFT JOIN projects p ON p.id=s.project_id
           WHERE s.student_id = ? ORDER BY s.updated_at DESC`
        )
        .all(u.id);
    }
    const cond = ctx.query.assignmentId ? 's.assignment_id = ?' : '1=1';
    const args = ctx.query.assignmentId ? [Number(ctx.query.assignmentId)] : [];
    return db
      .prepare(
        `SELECT s.*, u.nickname, a.title assignment_title, p.title project_title, p.type
         FROM submissions s JOIN users u ON u.id=s.student_id JOIN assignments a ON a.id=s.assignment_id
         LEFT JOIN projects p ON p.id=s.project_id WHERE ${cond} ORDER BY s.updated_at DESC LIMIT 200`
      )
      .all(...args);
  });

  r.patch('/api/submissions/:id', ['teacher', 'admin'], (ctx) => {
    const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(Number(ctx.params.id));
    if (!s) throw new HttpError(404, '提交记录不存在');
    const score = ctx.body.score;
    if (score !== undefined && score !== null && (Number(score) < 0 || Number(score) > 100)) throw new HttpError(400, '分数范围 0-100');
    db.prepare('UPDATE submissions SET score = ?, feedback = ?, status = ?, updated_at = ? WHERE id = ?').run(
      score === undefined || score === null || score === '' ? null : Number(score),
      String(ctx.body.feedback ?? s.feedback).slice(0, 1000),
      'graded',
      now(),
      s.id
    );
    return db.prepare('SELECT * FROM submissions WHERE id = ?').get(s.id);
  });

  // ---------- 管理后台 ----------
  // ---------- 官方素材镜像 ----------
  r.get('/api/scratch/mirror', ['admin', 'teacher'], () => mirror.syncStatus());

  r.post('/api/scratch/mirror/sync', ['admin'], (ctx) => {
    const st = mirror.syncStatus();
    if (st.running) return st;
    mirror.syncAll().catch(() => {});
    return mirror.syncStatus();
  });

  r.get('/api/admin/stats', ['admin'], () => {
    const one = (sql, ...a) => db.prepare(sql).get(...a).c;
    return {
      users: one('SELECT COUNT(*) c FROM users'),
      students: one("SELECT COUNT(*) c FROM users WHERE role='student'"),
      teachers: one("SELECT COUNT(*) c FROM users WHERE role='teacher'"),
      projects: one('SELECT COUNT(*) c FROM projects'),
      published: one('SELECT COUNT(*) c FROM projects WHERE published=1'),
      pyProjects: one("SELECT COUNT(*) c FROM projects WHERE type='python'"),
      scratchProjects: one("SELECT COUNT(*) c FROM projects WHERE type='scratch'"),
      assets: one('SELECT COUNT(*) c FROM assets'),
      costumes: one("SELECT COUNT(*) c FROM assets WHERE kind='sprite'"),
      backdrops: one("SELECT COUNT(*) c FROM assets WHERE kind='backdrop'"),
      sounds: one("SELECT COUNT(*) c FROM assets WHERE kind='sound'"),
      classes: one('SELECT COUNT(*) c FROM classes'),
      assignments: one('SELECT COUNT(*) c FROM assignments'),
      submissions: one('SELECT COUNT(*) c FROM submissions'),
      comments: one('SELECT COUNT(*) c FROM comments'),
      types: db.prepare("SELECT type, COUNT(*) c FROM projects GROUP BY type").all(),
      recentUsers: db.prepare('SELECT id,nickname,username,role,created_at FROM users ORDER BY id DESC LIMIT 6').all(),
      topProjects: db.prepare('SELECT id,title,type,views,published FROM projects ORDER BY views DESC LIMIT 6').all(),
    };
  });

  // 系统状态：把资源占用直接暴露给管理员，便于判断要不要扩容
  r.get('/api/admin/system', ['admin'], () => {
    const mem = process.memoryUsage();
    const fileSize = (name) => {
      try {
        return fs.statSync(path.join(DATA_DIR, name)).size;
      } catch {
        return 0;
      }
    };
    return {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      uptime: Math.round(process.uptime()),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      db: {
        size: fileSize('codecamp.db'),
        wal: fileSize('codecamp.db-wal'),
        sb3: sizeOfDir(path.join(DATA_DIR, 'sb3')),
        uploads: sizeOfDir(path.join(DATA_DIR, 'uploads')),
      },
    };
  });

  // 老师后台首页的汇总数据（一次请求拿全，少三个来回）
  r.get('/api/teacher/overview', ['teacher', 'admin'], (ctx) => {
    const isAdmin = ctx.user.role === 'admin';
    const clsWhere = isAdmin ? '' : 'WHERE teacher_id = ?';
    const clsArgs = isAdmin ? [] : [ctx.user.id];
    const classes = db.prepare(`SELECT COUNT(*) c FROM classes ${clsWhere}`).get(...clsArgs).c;
    const students = db
      .prepare(
        isAdmin
          ? 'SELECT COUNT(*) c FROM users WHERE role = ?'
          : 'SELECT COUNT(*) c FROM users WHERE role = ? AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)'
      )
      .get('student', ...clsArgs).c;
    const aWhere = isAdmin ? '' : 'WHERE a.teacher_id = ?';
    const assignments = db.prepare(`SELECT COUNT(*) c FROM assignments a ${aWhere}`).get(...clsArgs).c;
    const pending = db
      .prepare(
        `SELECT COUNT(*) c FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE s.status = 'submitted' ${isAdmin ? '' : 'AND a.teacher_id = ?'}`
      )
      .get(...clsArgs).c;
    const graded = db
      .prepare(
        `SELECT COUNT(*) c FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE s.status = 'graded' ${isAdmin ? '' : 'AND a.teacher_id = ?'}`
      )
      .get(...clsArgs).c;
    const avg = db
      .prepare(
        `SELECT AVG(s.score) v FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE s.score IS NOT NULL ${isAdmin ? '' : 'AND a.teacher_id = ?'}`
      )
      .get(...clsArgs).v;
    const recent = db
      .prepare(
        `SELECT s.id, s.score, s.status, s.updated_at, u.nickname, a.title assignment_title, a.id assignment_id, p.title project_title
         FROM submissions s JOIN users u ON u.id = s.student_id
         JOIN assignments a ON a.id = s.assignment_id LEFT JOIN projects p ON p.id = s.project_id
         ${isAdmin ? '' : 'WHERE a.teacher_id = ?'}
         ORDER BY s.updated_at DESC LIMIT 8`
      )
      .all(...clsArgs);
    return { classes, students, assignments, pending, graded, avgScore: avg ? Math.round(avg) : null, recent };
  });

  // 学生后台首页：作品 / 作业 / 成绩一屏搞定
  r.get('/api/student/overview', 'any', (ctx) => {
    const uid = ctx.user.id;
    const one = (sql, ...a) => db.prepare(sql).get(...a).c;
    const works = one('SELECT COUNT(*) c FROM projects WHERE user_id = ?', uid);
    const published = one('SELECT COUNT(*) c FROM projects WHERE user_id = ? AND published = 1', uid);
    const likes = one('SELECT COUNT(*) c FROM likes l JOIN projects p ON p.id = l.project_id WHERE p.user_id = ?', uid);
    const inClass = !!ctx.user.class_id;
    const assignments = inClass ? one('SELECT COUNT(*) c FROM assignments WHERE class_id = ?', ctx.user.class_id) : 0;
    const submitted = one('SELECT COUNT(*) c FROM submissions WHERE student_id = ?', uid);
    const graded = one('SELECT COUNT(*) c FROM submissions WHERE student_id = ? AND status = ?', uid, 'graded');
    const avg = db.prepare('SELECT AVG(score) v FROM submissions WHERE student_id = ? AND score IS NOT NULL').get(uid).v;
    const recent = db
      .prepare(
        `SELECT s.score, s.status, s.updated_at, a.id assignment_id, a.title assignment_title, a.type
         FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE s.student_id = ? ORDER BY s.updated_at DESC LIMIT 6`
      )
      .all(uid);
    return { works, published, likes, assignments, submitted, graded, avgScore: avg ? Math.round(avg) : null, recent, inClass };
  });


  r.get('/api/admin/users', ['admin', 'teacher'], (ctx) => {
    const where = [];
    const args = [];
    if (ctx.query.q) {
      where.push('(username LIKE ? OR nickname LIKE ?)');
      args.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`);
    }
    if (ctx.query.role) {
      where.push('role = ?');
      args.push(ctx.query.role);
    }
    if (ctx.query.classId) {
      where.push('class_id = ?');
      args.push(Number(ctx.query.classId));
    }
    return db
      .prepare(
        `SELECT u.id,u.username,u.nickname,u.role,u.status,u.class_id,c.name class_name,u.created_at
         FROM users u LEFT JOIN classes c ON c.id=u.class_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY u.id DESC LIMIT 300`
      )
      .all(...args);
  });

  r.post('/api/admin/users', ['admin'], (ctx) => {
    const { username, password, nickname, role, classId } = ctx.body;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(String(username || ''))) throw new HttpError(400, '用户名需 3-20 位字母数字下划线');
    if (String(password || '').length < 6) throw new HttpError(400, '密码至少 6 位');
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new HttpError(409, '用户名已存在');
    const rl = ['admin', 'teacher', 'student'].includes(role) ? role : 'student';
    const info = db
      .prepare('INSERT INTO users (username,password,nickname,role,avatar,bio,class_id,status,created_at) VALUES (?,?,?,?,?,?,?,1,?)')
      .run(username, hashPassword(password), String(nickname || username).slice(0, 20), rl, '', '', classId ? Number(classId) : null, now());
    return pub(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  });

  r.patch('/api/admin/users/:id', ['admin'], (ctx) => {
    const id = Number(ctx.params.id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!u) throw new HttpError(404, '用户不存在');
    const b = ctx.body;
    if (b.nickname !== undefined) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(String(b.nickname).slice(0, 20), id);
    if (b.role !== undefined && ['admin', 'teacher', 'student'].includes(b.role)) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id);
    if (b.status !== undefined) db.prepare('UPDATE users SET status = ? WHERE id = ?').run(b.status ? 1 : 0, id);
    if (b.classId !== undefined) db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(b.classId ? Number(b.classId) : null, id);
    if (b.password) db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(String(b.password)), id);
    invalidateUser(id);
    return pub(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  });

  r.delete('/api/admin/users/:id', ['admin'], (ctx) => {
    const id = Number(ctx.params.id);
    if (id === ctx.user.id) throw new HttpError(400, '不能删除当前登录账号');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    invalidateUser(id);
    return { ok: true };
  });

  r.get('/api/admin/projects', ['admin'], (ctx) => {
    return db
      .prepare(
        `SELECT p.id,p.title,p.type,p.published,p.views,p.updated_at,u.nickname,
           (SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id) likes
         FROM projects p JOIN users u ON u.id=p.user_id ORDER BY p.updated_at DESC LIMIT 200`
      )
      .all();
  });

  r.get('/api/admin/settings', ['admin'], () => {
    return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
  });

  r.patch('/api/admin/settings', ['admin'], (ctx) => {
    for (const [k, v] of Object.entries(ctx.body || {})) {
      if (!/^[a-z_]{2,40}$/.test(k)) continue;
      db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v).slice(0, 300));
    }
    invalidateSite();
    return { ok: true };
  });

  // ---------- Python ----------
  const runState = new Map();
  r.post('/api/python/run', 'any', async (ctx) => {
    const code = String(ctx.body.code || '');
    if (!code.trim()) throw new HttpError(400, '代码为空');
    const last = runState.get(ctx.user.id) || 0;
    if (Date.now() - last < 800) throw new HttpError(429, '运行太频繁，请稍等一秒');
    runState.set(ctx.user.id, Date.now());
    const res = await py.runCode(code, { timeout: 15000 });
    return res;
  });

  r.get('/api/python/packages', 'any', async () => {
    const list = await py.listPackages();
    return { items: list, python: py.detectPython() || null };
  });

  r.post('/api/python/packages', 'any', async (ctx) => {
    if (ctx.user.role === 'student' && getSetting('allow_pip', '1') !== '1') throw new HttpError(403, '管理员已关闭学生安装第三方库');
    const list = Array.isArray(ctx.body.packages) ? ctx.body.packages : String(ctx.body.packages || '').split(/[\s,]+/);
    const pkgs = list.filter(Boolean).slice(0, 5);
    const index = getSetting('pip_index', 'https://mirrors.aliyun.com/pypi/simple');
    const res = await py.installPackages(pkgs, index);
    return res;
  });
}

module.exports = { buildApi };

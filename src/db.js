'use strict';
/**
 * 数据库层：单文件 SQLite（Node 22 内置 node:sqlite，零依赖）。
 *
 * 设计取舍：
 *  - 不引入 ORM / 不引入 MySQL：单文件 + WAL 足够支撑班级规模的读写，
 *    部署时只要拷走 data/codecamp.db 就是完整备份。
 *  - 表结构只保留必要字段，计数类数据（点赞数/评论数）用索引化子查询实时算，
 *    避免冗余列不一致。
 *  - 所有 SQL 走 prepare 缓存，热点接口不再重复编译语句（CPU 明显下降）。
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'codecamp.db'));

/* -------- 运行参数：WAL + 常规写入 + 内存临时表，兼顾速度与安全 -------- */
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -20000;
  PRAGMA mmap_size = 134217728;
  PRAGMA wal_autocheckpoint = 512;
  PRAGMA journal_size_limit = 67108864;
`);

/* -------- 语句缓存：同一 SQL 只编译一次（最多 400 条，超出清空重来） -------- */
const stmtCache = new Map();
const rawPrepare = db.prepare.bind(db);
db.prepare = function cachedPrepare(sql) {
  let stmt = stmtCache.get(sql);
  if (stmt === undefined) {
    if (stmtCache.size >= 400) stmtCache.clear();
    stmt = rawPrepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
};

/** 事务包装：fn 抛错自动回滚 */
function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw e;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  avatar TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  class_id INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  teacher_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  data TEXT DEFAULT '{}',
  thumb TEXT DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  tags TEXT DEFAULT '',
  url TEXT NOT NULL,
  uploader_id INTEGER,
  created_at TEXT NOT NULL,
  -- 素材元数据：老库由下面的 upgradeAssets() 逐列补齐，新库这里一次建全
  format TEXT DEFAULT '',
  md5 TEXT DEFAULT '',
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  bytes INTEGER DEFAULT 0,
  rate INTEGER DEFAULT 0,
  duration REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'scratch',
  due_at TEXT DEFAULT '',
  starter TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  score INTEGER,
  feedback TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- 作业对应的「学生自己的创作草稿」：从作业入口进入编辑器时打开这个作品
CREATE TABLE IF NOT EXISTS assignment_works (
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (assignment_id, student_id)
);
-- 作品分享链接：一个作品可以生成一个对外公开的分享页，页面上放作者挑好的常用按键
CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  note TEXT DEFAULT '',
  buttons TEXT DEFAULT '[]',
  views INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

// 素材表增量升级：kind 由 costume/backdrop 扩展为 sprite/backdrop/sound，并补充素材元数据
(function upgradeAssets() {
  const cols = db.prepare('PRAGMA table_info(assets)').all().map((c) => c.name);
  const add = (name, ddl) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE assets ADD COLUMN ${name} ${ddl}`);
  };
  add('format', "TEXT DEFAULT ''");
  add('md5', "TEXT DEFAULT ''");
  add('width', 'INTEGER DEFAULT 0');
  add('height', 'INTEGER DEFAULT 0');
  add('bytes', 'INTEGER DEFAULT 0');
  add('rate', 'INTEGER DEFAULT 0');
  add('duration', 'REAL DEFAULT 0');
  db.exec("UPDATE assets SET kind='sprite' WHERE kind='costume'");
})();

// 索引必须放在迁移之后建：老库缺列时 CREATE INDEX 会直接报错，导致启动失败
db.exec(`
-- 索引：覆盖列表、详情、计数、鉴权四条主查询路径
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_pub ON projects(published, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_likes_project ON likes(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);
CREATE INDEX IF NOT EXISTS idx_assets_md5 ON assets(md5);
CREATE INDEX IF NOT EXISTS idx_shares_project ON shares(project_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
CREATE INDEX IF NOT EXISTS idx_aw_project ON assignment_works(project_id);
`);

const now = () => new Date().toISOString();
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 2, 0, 0)).toISOString();

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (username,password,nickname,role,avatar,bio,class_id,status,created_at) VALUES (?,?,?,?,?,?,?,1,?)'
  );
  const pwd = hashPassword('123456');

  db.prepare('INSERT INTO classes (name,code,teacher_id,created_at) VALUES (?,?,?,?)').run('示例班级 · 少儿编程 A 班', 'CLASS01', 2, now());
  const classId = db.prepare('SELECT id FROM classes WHERE code = ?').get('CLASS01').id;

  insertUser.run('admin', pwd, '平台管理员', 'admin', '', '负责平台运营与素材审核', null, now());
  insertUser.run('teacher', pwd, '王老师', 'teacher', '', '信息科技教师，专注图形化与 Python 教学', classId, now());
  insertUser.run('student', pwd, '小明', 'student', '', '小学五年级，喜欢做小游戏', classId, now());
  insertUser.run('xiaohong', pwd, '小红', 'student', '', '喜欢用 Python 画画', classId, now());
  insertUser.run('teacher2', pwd, '李老师', 'teacher', '', 'Python 教研组', null, now());

  /* 演示作品使用官方 Scratch 3 作品包（.sb3），由 src/seed-scratch.js 生成 */
  const demoScratch = { format: 'sb3', seed: 'demo' };

  const demoPython = `import turtle

t = turtle.Turtle()
t.speed(0)
colors = ["#ff5c8a", "#ffb703", "#4cc9f0", "#7ae582", "#b892ff"]
for i in range(60):
    t.pencolor(colors[i % len(colors)])
    t.forward(i * 4)
    t.right(91)

print("画完啦！一共 60 条边")
`;

  const insProject = db.prepare(
    'INSERT INTO projects (user_id,type,title,description,data,thumb,published,views,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  insProject.run(3, 'scratch', '小猫走迷宫', '用方向键控制小猫走出迷宫，学习侦测与条件判断。', JSON.stringify(demoScratch), '', 1, 42, iso(2026, 9, 12), iso(2026, 9, 12));
  insProject.run(4, 'python', '彩色螺旋线', '用 turtle 画出会变色的螺旋，练习循环与列表。', JSON.stringify({ code: demoPython }), '', 1, 31, iso(2026, 9, 15), iso(2026, 9, 15));
  insProject.run(3, 'python', '猜数字小游戏', '随机数 + while 循环 + 输入输出。', JSON.stringify({ code: 'import random\n\nsecret = random.randint(1, 100)\nfor i in range(1, 8):\n    guess = int(input("猜一个 1-100 的数字："))\n    if guess == secret:\n        print(f"猜对了！你用了 {i} 次")\n        break\n    print("大了一点" if guess > secret else "小了一点")\nelse:\n    print(f"没猜中，答案是 {secret}")\n' }), '', 0, 8, iso(2026, 10, 2), iso(2026, 10, 2));

  db.prepare(
    'INSERT INTO assignments (teacher_id,class_id,title,description,type,due_at,starter,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(
    2,
    classId,
    '第 3 课 · 让角色动起来',
    `## 本课目标

用积木让小猫**听你的话**地移动。

### 要求

1. 至少使用「移动 10 步」和「碰到边缘就反弹」
2. 按 \`空格键\` 也能触发一次移动
3. 给作品起个名字，并发布到社区

> 小提示：先想清楚「按什么键 → 做什么动作」，再动手拖积木。

\`\`\`text
当按下 → 键
  面向 90 方向
  移动 10 步
\`\`\`
`,
    'scratch',
    iso(2026, 10, 25),
    '',
    iso(2026, 10, 10)
  );
  db.prepare(
    'INSERT INTO assignments (teacher_id,class_id,title,description,type,due_at,starter,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(
    2,
    classId,
    '第 4 课 · 用 turtle 画五角星',
    `## 任务

用 \`for\` 循环画出五角星：边长 120，颜色自选。

| 参数 | 值 |
| --- | --- |
| 重复次数 | 5 |
| 每次转角 | 144° |
| 边长 | 120 |

提交一份 **Python 作品**。`,
    'python',
    iso(2026, 10, 30),
    'import turtle\n\nt = turtle.Turtle()\n',
    iso(2026, 10, 12)
  );

  db.prepare("INSERT INTO comments (project_id,user_id,content,created_at) VALUES (?,?,?,?)").run(1, 4, '小猫好可爱，我照着做了一个！', iso(2026, 9, 20));
  db.prepare("INSERT INTO likes (user_id,project_id,created_at) VALUES (?,?,?)").run(4, 1, iso(2026, 9, 20));
  db.prepare("INSERT INTO likes (user_id,project_id,created_at) VALUES (?,?,?)").run(3, 2, iso(2026, 9, 21));

  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING").run('site_name', 'CodeCamp 少儿编程学堂');
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING").run('site_slogan', '让每个孩子都能创造自己的作品');
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING").run('allow_register', '1');
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING").run('pip_index', process.env.PIP_INDEX || 'https://mirrors.aliyun.com/pypi/simple');
}

seed();

/* 兼容早期数据结构：scripts 为 XML 字符串时迁移为 xml + scripts 数组 */
function migrate() {
  const rows = db.prepare("SELECT id,data FROM projects WHERE type='scratch'").all();
  const upd = db.prepare('UPDATE projects SET data = ? WHERE id = ?');
  for (const r of rows) {
    let d;
    try {
      d = JSON.parse(r.data);
    } catch {
      continue;
    }
    let changed = false;
    for (const sp of d.sprites || []) {
      if (typeof sp.scripts === 'string') {
        sp.xml = sp.xml || sp.scripts;
        sp.scripts = [];
        changed = true;
      } else if (!Array.isArray(sp.scripts)) {
        sp.scripts = [];
        changed = true;
      }
    }
    if (changed) upd.run(JSON.stringify(d), r.id);
  }
}
migrate();

/** 退出前把 WAL 收进主库，避免日志文件越滚越大 */
function closeDb() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {}
  try {
    db.close();
  } catch {}
}

module.exports = { db, tx, now, DATA_DIR, ROOT, closeDb };

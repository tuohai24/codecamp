import { api, loadMe, setToken, state } from '../api.js';
import { esc, toast } from '../ui.js';

export async function render(root, { query }) {
  let mode = query.mode === 'register' ? 'register' : 'login';
  const site = state.site || {};

  function paint() {
    root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="row" style="gap:10px;margin-bottom:16px">
          <div class="logo" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;font-weight:800">CC</div>
          <div>
            <h1>${mode === 'login' ? '登录账号' : '注册新账号'}</h1>
            <div class="tip" style="margin:0">${esc(site.name || 'CodeCamp 少儿编程学堂')}</div>
          </div>
        </div>

        <div class="field">
          <label>用户名</label>
          <input id="username" placeholder="字母、数字或下划线" autocomplete="username" />
        </div>
        ${mode === 'register' ? `<div class="field"><label>昵称</label><input id="nickname" placeholder="展示在作品和评论里" maxlength="20" /></div>` : ''}
        <div class="field">
          <label>密码</label>
          <input id="password" type="password" placeholder="${mode === 'register' ? '至少 6 位' : '请输入密码'}" autocomplete="current-password" />
        </div>
        <button class="btn primary lg" id="submit" style="width:100%">${mode === 'login' ? '登录' : '注册并登录'}</button>

        <div class="center muted tiny" style="margin-top:16px">
          ${mode === 'login' ? (site.allowRegister === false ? '' : `还没有账号？<a href="#/login?mode=register" style="color:var(--brand);font-weight:600">立即注册</a>`) : `已有账号？<a href="#/login" style="color:var(--brand);font-weight:600">去登录</a>`}
        </div>

        ${
          mode === 'login'
            ? `<div class="card" style="margin-top:20px;padding:12px;background:#fbfbff">
                <div class="tiny muted" style="margin-bottom:6px">演示账号（密码均为 123456）</div>
                <div class="row wrap" style="gap:6px">
                  <button class="btn sm ghost" data-acc="admin">管理员 admin</button>
                  <button class="btn sm ghost" data-acc="teacher">教师 teacher</button>
                  <button class="btn sm ghost" data-acc="student">学生 student</button>
                </div>
              </div>`
            : ''
        }
      </div>
    </div>`;

    const submit = root.querySelector('#submit');
    const doSubmit = async () => {
      const username = root.querySelector('#username').value.trim();
      const password = root.querySelector('#password').value;
      const nickname = root.querySelector('#nickname') ? root.querySelector('#nickname').value.trim() : '';
      if (!username || !password) return toast('请填写用户名和密码', 'err');
      submit.disabled = true;
      try {
        const res = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
          method: 'POST',
          body: mode === 'login' ? { username, password } : { username, password, nickname },
        });
        setToken(res.token);
        await loadMe();
        toast('欢迎回来，' + res.user.nickname, 'ok');
        const target = res.user.role === 'admin' ? '#/admin' : res.user.role === 'teacher' ? '#/teacher' : '#/me';
        location.hash = query.next || target;
        if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        submit.disabled = false;
      }
    };
    submit.addEventListener('click', doSubmit);
    root.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && doSubmit()));
    root.querySelectorAll('[data-acc]').forEach((b) =>
      b.addEventListener('click', () => {
        root.querySelector('#username').value = b.dataset.acc;
        root.querySelector('#password').value = '123456';
        doSubmit();
      })
    );
  }

  paint();
}

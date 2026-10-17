// 進入點：路由與主畫面、迴向頁
// 路由：#/  主畫面 ｜ #/play/<id> ｜ #/count/<id> ｜ #/records ｜ #/dedication

import { esc, fmtNum, prefs } from './common.js';
import { loadConfig, loadText } from './loader.js';
import { renderPlayView } from './player.js';
import { renderCountView } from './counter.js';
import { renderRecordsView, todaySummary } from './records.js';

let view = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
let cleanup = null;
let cfg = null;

function renderHome() {
  let mode = prefs.get('mode', 'play');
  let cat = prefs.get('category', cfg.categories[0].id);

  view.innerHTML = `
    <div class="mode-pick">
      <button type="button" data-mode="play"><b>▶</b>播放</button>
      <button type="button" data-mode="count"><b>📿</b>計數</button>
    </div>
    <div class="seg" role="tablist">${cfg.categories.map(c =>
      `<button type="button" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
    </div>
    <ul class="item-list"></ul>
    <div class="today card"></div>
    <nav class="home-nav">
      <a class="btn" href="#/records">紀錄</a>
      <a class="btn" href="#/dedication">迴向</a>
    </nav>`;

  function draw() {
    view.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === mode));
    view.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-selected', b.dataset.cat === cat));
    let lastGroup = null;
    // 播放模式只列出有音源的項目（例如十小咒各咒沒有單獨音源，只列合誦）
    const shown = cfg.items.filter(it =>
      it.category === cat && (mode !== 'play' || cfg.sources(it.id).length));
    view.querySelector('.item-list').innerHTML = shown.map(it => {
      const n = cfg.sources(it.id).length;
      const note = mode === 'play' && n > 1 ? `${n} 個音源` : '';
      const head = it.group && it.group !== lastGroup ? `<li class="group-head">${esc(it.group)}</li>` : '';
      lastGroup = it.group || null;
      return `${head}<li class="${it.group ? 'in-group' : ''}">
        <a href="#/${mode}/${encodeURIComponent(it.id)}">
          <span>${esc(it.name)}</span><small>${note}</small>
        </a></li>`;
    }).join('');
  }

  view.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; prefs.set('mode', mode); draw(); }
    const c = e.target.closest('[data-cat]');
    if (c) { cat = c.dataset.cat; prefs.set('category', cat); draw(); }
  });

  draw();
  const todayEl = view.querySelector('.today');
  todaySummary().then(({ play, count }) => {
    todayEl.innerHTML = `今日功課：播放 <b>${fmtNum(play)}</b> 遍・計數 <b>${fmtNum(count)}</b> 次`;
  }).catch(() => {});
}

async function renderDedication() {
  const el = view; // 載入期間若已換頁，不要寫到新頁面
  el.innerHTML = '<div class="loading">載入中…</div>';
  const text = await loadText('迴向文.txt');
  el.innerHTML = text
    ? `<div class="card scripture dedication">${esc(text)}</div>`
    : `<div class="empty-text">尚未填入迴向文。<br>請將內容貼到 <code>texts/迴向文.txt</code> 後重新整理。</div>`;
}

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  // 每頁換一個新的 #view，舊頁面的事件監聽隨之丟棄
  const fresh = view.cloneNode(false);
  view.replaceWith(fresh);
  view = fresh;
  window.scrollTo(0, 0);
  const [name, rawId] = location.hash.replace(/^#\/?/, '').split('/');
  const id = rawId && decodeURIComponent(rawId);
  backBtn.hidden = !name;

  if (name === 'play' || name === 'count') {
    const item = cfg.item(id);
    if (!item) { location.hash = '#/'; return; }
    titleEl.textContent = item.name;
    cleanup = (name === 'play' ? renderPlayView : renderCountView)(view, item, cfg);
  } else if (name === 'records') {
    titleEl.textContent = '紀錄';
    renderRecordsView(view, cfg);
  } else if (name === 'dedication') {
    titleEl.textContent = '迴向';
    renderDedication();
  } else {
    titleEl.textContent = '念佛機';
    renderHome();
  }
}

backBtn.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.hash = '#/';
});

(async () => {
  try {
    cfg = await loadConfig();
  } catch (err) {
    view.innerHTML = `<div class="empty-text">${esc(err.message)}<br>
      請用 <code>啟動.bat</code> 或網址開啟本 App，不要直接點開 index.html。</div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

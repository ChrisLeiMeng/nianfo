// 紀錄：IndexedDB 存取，以及 年／月／日 查詢頁
// 一筆紀錄 = 一次播放或計數：{ id, mode: 'play'|'count', itemId, ts, endTs, count, youtube? }

import { esc, fmtTime, fmtNum, pad2, prefs, toast } from './common.js';

const DB_NAME = 'nianfo';
const STORE = 'records';
let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('ts', 'ts');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result);
    t.onerror = () => reject(t.error);
  });
}

// 新增或更新；回傳 id
export const saveRecord = rec => tx('readwrite', s => s.put(rec));
export const deleteRecord = id => tx('readwrite', s => s.delete(id));
export const allRecords = () => tx('readonly', s => s.getAll());
export const recordsBetween = (from, to) =>
  tx('readonly', s => s.index('ts').getAll(IDBKeyRange.bound(from, to, false, true)));

async function importRecords(list) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    let n = 0;
    for (const r of list) {
      if (!r || !r.itemId || !r.ts || !r.mode) continue;
      const { id, ...rest } = r; // 用新 id 避免覆蓋現有紀錄
      s.add(rest);
      n++;
    }
    t.oncomplete = () => resolve(n);
    t.onerror = () => reject(t.error);
  });
}

// 合計：{ play, count }
export function sum(list) {
  return list.reduce((a, r) => {
    a[r.mode] += r.count || 0;
    return a;
  }, { play: 0, count: 0 });
}

export async function todaySummary() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return sum(await recordsBetween(from, from + 86400000));
}

/* ---------- 紀錄頁 ---------- */

const MODE_LABEL = { play: '播放', count: '計數' };
const UNIT = { play: '遍', count: '次' };

function sumText({ play, count }) {
  const parts = [];
  if (play) parts.push(`播放 ${fmtNum(play)} 遍`);
  if (count) parts.push(`計數 ${fmtNum(count)} 次`);
  return parts.join('・') || '—';
}

function periodRange(level, d) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  if (level === 'year') return [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
  if (level === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 1)];
  return [new Date(y, m, day), new Date(y, m, day + 1)];
}

function periodLabel(level, d) {
  const y = d.getFullYear(), m = d.getMonth() + 1;
  if (level === 'year') return `${y} 年`;
  if (level === 'month') return `${y} 年 ${m} 月`;
  const wk = '日一二三四五六'[d.getDay()];
  return `${y} 年 ${m} 月 ${d.getDate()} 日（${wk}）`;
}

function shift(level, d, step) {
  const n = new Date(d);
  if (level === 'year') n.setFullYear(n.getFullYear() + step, 0, 1);
  else if (level === 'month') n.setMonth(n.getMonth() + step, 1);
  else n.setDate(n.getDate() + step);
  return n;
}

function groupBy(list, keyFn) {
  const m = new Map();
  for (const r of list) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function renderRecordsView(view, cfg) {
  let level = prefs.get('recordLevel', 'day');
  let date = new Date();
  const itemName = id => cfg.item(id)?.name || id;

  view.innerHTML = `
    <div class="seg" role="tablist">
      <button type="button" data-level="year">年</button>
      <button type="button" data-level="month">月</button>
      <button type="button" data-level="day">日</button>
    </div>
    <div class="period-nav">
      <button type="button" data-step="-1" aria-label="上一期">◀</button>
      <span class="period-label"></span>
      <button type="button" data-step="1" aria-label="下一期">▶</button>
    </div>
    <button type="button" class="link-btn" data-today>回到今天</button>
    <section class="card"><h3>合計</h3><div class="rec-summary"></div></section>
    <section class="card"><h3 class="rec-detail-title"></h3><div class="rec-detail"></div></section>
    <div class="row backup">
      <button type="button" class="btn" data-export>匯出紀錄</button>
      <label class="btn">匯入紀錄<input type="file" accept="application/json,.json" hidden data-import></label>
    </div>
    <p class="hint">紀錄只存在這台裝置的瀏覽器中，換手機或清除瀏覽器資料前請先匯出備份。</p>`;

  async function refresh() {
    view.querySelectorAll('[data-level]').forEach(b =>
      b.setAttribute('aria-selected', b.dataset.level === level));
    view.querySelector('.period-label').textContent = periodLabel(level, date);

    const [from, to] = periodRange(level, date);
    const list = (await recordsBetween(from.getTime(), to.getTime())).sort((a, b) => a.ts - b.ts);

    // 合計：依項目
    const byItem = groupBy(list, r => r.itemId);
    view.querySelector('.rec-summary').innerHTML = list.length
      ? `<div class="total">${sumText(sum(list))}</div>
         <ul class="rec-list">${[...byItem].map(([id, rs]) =>
           `<li><span>${esc(itemName(id))}</span><span>${sumText(sum(rs))}</span></li>`).join('')}</ul>`
      : '<p class="hint">這段期間沒有紀錄。</p>';

    const title = view.querySelector('.rec-detail-title');
    const detail = view.querySelector('.rec-detail');
    if (level === 'day') {
      title.textContent = '每筆紀錄';
      detail.innerHTML = list.length ? `<ul class="rec-list">${list.map(r => `
        <li>
          <span class="rec-time">${fmtTime(r.ts)}</span>
          <span class="rec-name"><em class="tag tag-${r.mode}">${MODE_LABEL[r.mode]}</em>${esc(itemName(r.itemId))}</span>
          <span class="rec-count">${fmtNum(r.count)} ${UNIT[r.mode]}</span>
          <button type="button" class="del" data-del="${r.id}" aria-label="刪除這筆">✕</button>
        </li>`).join('')}</ul>` : '';
    } else {
      // 年 → 依月份；月 → 依日期，點擊可往下鑽
      const isYear = level === 'year';
      title.textContent = isYear ? '各月份' : '各日';
      const groups = groupBy(list, r => {
        const d = new Date(r.ts);
        return isYear ? d.getMonth() : d.getDate();
      });
      detail.innerHTML = list.length ? `<ul class="rec-list drill">${[...groups].map(([k, rs]) => `
        <li><button type="button" data-drill="${k}">
          <span>${isYear ? `${k + 1} 月` : `${date.getMonth() + 1}/${pad2(k)}`}</span>
          <span>${sumText(sum(rs))} ›</span>
        </button></li>`).join('')}</ul>` : '';
    }
  }

  view.addEventListener('click', async e => {
    const t = e.target;
    const lv = t.closest('[data-level]');
    if (lv) { level = lv.dataset.level; prefs.set('recordLevel', level); return refresh(); }
    const st = t.closest('[data-step]');
    if (st) { date = shift(level, date, Number(st.dataset.step)); return refresh(); }
    if (t.closest('[data-today]')) { date = new Date(); return refresh(); }
    const dr = t.closest('[data-drill]');
    if (dr) {
      const k = Number(dr.dataset.drill);
      if (level === 'year') { date = new Date(date.getFullYear(), k, 1); level = 'month'; }
      else { date = new Date(date.getFullYear(), date.getMonth(), k); level = 'day'; }
      return refresh();
    }
    const del = t.closest('[data-del]');
    if (del && confirm('確定刪除這筆紀錄？')) {
      await deleteRecord(Number(del.dataset.del));
      return refresh();
    }
    if (t.closest('[data-export]')) {
      const data = JSON.stringify(await allRecords(), null, 1);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const d = new Date();
      a.download = `念佛紀錄-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  });

  view.querySelector('[data-import]').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const list = JSON.parse(await file.text());
      if (!Array.isArray(list)) throw new Error();
      const n = await importRecords(list);
      toast(`已匯入 ${n} 筆紀錄`);
      refresh();
    } catch {
      toast('匯入失敗：檔案格式不正確');
    }
  });

  refresh();
}

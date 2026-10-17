// 播放／計數頁下方的顯示區：切換「顯示經文」或「顯示佛菩薩像」

import { esc, prefs } from './common.js';
import { loadText } from './loader.js';

export function renderDisplay(container, item, category) {
  let mode = prefs.get('displayMode', 'image');
  let fontSize = prefs.get('fontSize', 22);

  container.innerHTML = `
    <div class="seg" role="tablist">
      <button type="button" data-mode="text">${esc(category.textLabel)}</button>
      <button type="button" data-mode="image">顯示佛菩薩像</button>
    </div>
    <div class="display-panel"></div>`;
  const panel = container.querySelector('.display-panel');

  function showImage() {
    panel.innerHTML = `
      <figure class="deity">
        <img src="images/${encodeURIComponent(item.image || '')}" alt="${esc(item.name)} 佛菩薩像">
      </figure>`;
    const img = panel.querySelector('img');
    img.addEventListener('error', () => {
      panel.innerHTML = `<div class="deity-missing">🪷<span>${esc(item.chant || item.name)}</span></div>`;
    });
  }

  async function showText() {
    panel.innerHTML = `<div class="loading">載入中…</div>`;
    // 佛號沒有 txt，直接顯示名號
    const body = item.text ? await loadText(item.text) : (item.chant || item.name);
    if (mode !== 'text') return;
    if (!body) {
      panel.innerHTML = `
        <div class="empty-text">尚未填入內容。<br>
        請將內容貼到 <code>texts/${esc(item.text)}</code> 後重新整理。</div>`;
      return;
    }
    panel.innerHTML = `
      <div class="font-tools">
        <button type="button" data-font="-2" aria-label="字體縮小">A−</button>
        <button type="button" data-font="2" aria-label="字體放大">A＋</button>
      </div>
      <div class="scripture ${item.text ? '' : 'chant'}" style="font-size:${fontSize}px">${esc(body)}</div>`;
  }

  function apply() {
    container.querySelectorAll('.seg button').forEach(b => {
      b.setAttribute('aria-selected', b.dataset.mode === mode);
    });
    mode === 'text' ? showText() : showImage();
  }

  container.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      prefs.set('displayMode', mode);
      apply();
      return;
    }
    const f = e.target.closest('[data-font]');
    if (f) {
      fontSize = Math.min(40, Math.max(14, fontSize + Number(f.dataset.font)));
      prefs.set('fontSize', fontSize);
      panel.querySelector('.scripture').style.fontSize = fontSize + 'px';
    }
  });

  apply();
}

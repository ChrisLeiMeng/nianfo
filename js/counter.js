// 計數模式：點一下 +1，可設目標數，木魚音效，自動存檔

import { esc, fmtNum, keepAwake, prefs, toast } from './common.js';
import { renderDisplay } from './display.js';
import { saveRecord, deleteRecord } from './records.js';

const TARGETS = [0, 21, 49, 108, 1080, 10000]; // 0 = 不設目標

let audioCtx = null;
function knock() {
  try {
    audioCtx ||= new AudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  } catch { /* 不支援音效時略過 */ }
}

export function renderCountView(view, item, cfg) {
  const category = cfg.category(item.category);
  let target = prefs.get('target', 108);
  let sound = prefs.get('sound', true);
  let count = 0;
  let session = null;
  let saveTimer = null;

  view.innerHTML = `
    <section class="card counter">
      <div class="count-num" aria-live="polite">0</div>
      <div class="count-progress"></div>
      <button type="button" class="tap" data-tap>
        <span>${esc(item.chant || item.name)}</span>
        <small>點一下 +1</small>
      </button>
      <div class="controls">
        <label class="field inline">目標
          <select data-target>${TARGETS.map(n =>
            `<option value="${n}" ${n === target ? 'selected' : ''}>${n ? fmtNum(n) : '不設定'}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="btn" data-undo>−1</button>
        <button type="button" class="btn" data-sound></button>
      </div>
      <button type="button" class="btn btn-block" data-finish>結束本次並存檔</button>
    </section>
    <section class="display"></section>
    <a class="btn btn-block" href="#/dedication">迴向</a>`;

  renderDisplay(view.querySelector('.display'), item, category);

  const numEl = view.querySelector('.count-num');
  const progEl = view.querySelector('.count-progress');
  const soundBtn = view.querySelector('[data-sound]');

  function update() {
    numEl.textContent = fmtNum(count);
    progEl.textContent = target ? `${fmtNum(count)} ／ ${fmtNum(target)}` : '';
    progEl.classList.toggle('reached', !!target && count >= target);
    soundBtn.textContent = sound ? '木魚音：開' : '木魚音：關';
  }

  // 每次點擊後稍等再寫入，避免連續點擊時頻繁存檔；
  // 寫入依序排隊，避免第一筆還沒拿到 id 就又寫入而產生重複紀錄
  let saving = Promise.resolve();
  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    saving = saving.then(writeSession).catch(() => toast('存檔失敗'));
    return saving;
  }
  async function writeSession() {
    if (!session) return;
    if (count === 0) {
      if (session.id) await deleteRecord(session.id);
      session = null;
      return;
    }
    session.count = count;
    session.endTs = Date.now();
    session.id = await saveRecord(session);
  }
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  };

  view.querySelector('[data-tap]').addEventListener('click', () => {
    if (!session) {
      session = { mode: 'count', itemId: item.id, ts: Date.now(), count: 0 };
      keepAwake(true);
    }
    count++;
    if (sound) knock();
    navigator.vibrate?.(15);
    if (target && count === target) {
      navigator.vibrate?.([80, 60, 80]);
      toast(`已圓滿 ${fmtNum(target)}，可以迴向了`);
    }
    update();
    scheduleSave();
  });

  view.querySelector('[data-undo]').addEventListener('click', () => {
    if (count === 0) return;
    count--;
    update();
    scheduleSave();
  });

  view.querySelector('[data-target]').addEventListener('change', e => {
    target = Number(e.target.value);
    prefs.set('target', target);
    update();
  });

  soundBtn.addEventListener('click', () => {
    sound = !sound;
    prefs.set('sound', sound);
    update();
  });

  view.querySelector('[data-finish]').addEventListener('click', async () => {
    if (!count) return toast('尚未開始計數');
    const total = count;
    await flush();
    session = null;
    count = 0;
    keepAwake(false);
    update();
    toast(`已存檔：${fmtNum(total)} 次`);
  });

  // App 被切到背景或關閉時立即存檔
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  update();

  return () => {
    flush();
    keepAwake(false);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
  };
}

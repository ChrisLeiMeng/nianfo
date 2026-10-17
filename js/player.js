// 播放模式：YouTube IFrame 嵌入播放，循環指定遍數，每播完一遍自動記錄

import { esc, fmtNum, keepAwake, prefs, toast } from './common.js';
import { renderDisplay } from './display.js';
import { saveRecord } from './records.js';

const LOOP_OPTIONS = [1, 3, 7, 21, 49, 108, 0]; // 0 = 無限循環

let apiPromise = null;
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { apiPromise = null; reject(new Error('無法連線到 YouTube')); };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

const ERROR_TEXT = {
  2: '影片網址不正確',
  5: '此裝置無法播放這部影片',
  100: '影片已被移除或設為私人',
  101: '影片擁有者不允許嵌入播放',
  150: '影片擁有者不允許嵌入播放',
  153: '請用網址開啟本 App（不要直接點開 index.html）'
};

export function renderPlayView(view, item, cfg) {
  const category = cfg.category(item.category);
  const sources = cfg.sources(item.id);
  const srcKey = 'source.' + item.id;
  let srcIndex = Math.min(prefs.get(srcKey, 0), Math.max(sources.length - 1, 0));
  let loop = prefs.get('loop', 1);

  view.innerHTML = `
    <section class="card player-card">
      ${sources.length > 1 ? `
        <label class="field">音源
          <select data-source>${sources.map((s, i) =>
            `<option value="${i}" ${i === srcIndex ? 'selected' : ''}>${esc(s.label || `音源 ${i + 1}`)}</option>`).join('')}
          </select>
        </label>` : ''}
      <div class="yt-wrap"><div id="yt-player"></div></div>
      <div class="yt-msg" hidden></div>
      <div class="controls">
        <button type="button" class="btn-primary" data-play disabled>▶ 播放</button>
        <label class="field inline">循環
          <select data-loop>${LOOP_OPTIONS.map(n =>
            `<option value="${n}" ${n === loop ? 'selected' : ''}>${n ? n + ' 次' : '不停循環'}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="stat">本次已播放 <b data-done>0</b> 次<span data-remain></span><span data-reps></span></div>
    </section>
    <section class="display"></section>
    <a class="btn btn-block" href="#/dedication">迴向</a>`;

  renderDisplay(view.querySelector('.display'), item, category);

  const msg = view.querySelector('.yt-msg');
  const playBtn = view.querySelector('[data-play]');
  const doneEl = view.querySelector('[data-done]');
  const remainEl = view.querySelector('[data-remain]');
  const repsEl = view.querySelector('[data-reps]');

  if (!sources.length) {
    view.querySelector('.yt-wrap').hidden = true;
    msg.hidden = false;
    msg.innerHTML = `此項目尚未設定音源，請在 <code>config/sources.json</code> 的
      <code>"${esc(item.id)}"</code> 加入 YouTube 影片 ID。<br>
      <a href="#/count/${encodeURIComponent(item.id)}">改用計數模式 ›</a>`;
    return () => {};
  }

  let player = null;
  let playing = false;
  let done = 0;   // 影片播完幾次
  let total = 0;  // 換算成遍數（一支影片可能含多遍，見 sources.json 的 reps）
  let finished = false;
  let session = null; // 目前這次播放的紀錄
  let sessionStart = 0;

  function updateStat() {
    doneEl.textContent = fmtNum(done);
    remainEl.textContent = loop && !finished ? `／共 ${loop} 次` : '';
    repsEl.textContent = total !== done ? `（合計 ${fmtNum(total)} 遍）` : '';
    playBtn.textContent = playing ? '❚❚ 暫停' : (finished ? '↻ 再播一次' : '▶ 播放');
  }

  function showError(code) {
    const s = sources[srcIndex];
    msg.hidden = false;
    msg.innerHTML = `${esc(ERROR_TEXT[code] || `播放發生錯誤（代碼 ${code}）`)}<br>
      <a href="https://www.youtube.com/watch?v=${encodeURIComponent(s.youtube)}" target="_blank" rel="noopener">在 YouTube 開啟 ›</a>`;
  }

  async function onEnded() {
    done++;
    total += Number(sources[srcIndex].reps) || 1;
    if (!session) session = { mode: 'play', itemId: item.id, ts: sessionStart, count: 0 };
    session.count = total;
    session.endTs = Date.now();
    session.youtube = sources[srcIndex].youtube;
    session.id = await saveRecord(session);

    if (!loop || done < loop) {
      player.seekTo(0, true);
      player.playVideo();
    } else {
      finished = true;
      keepAwake(false);
      toast(`已圓滿 ${fmtNum(total)} 遍，可以迴向了`);
    }
    updateStat();
  }

  function onStateChange(e) {
    const S = window.YT.PlayerState;
    if (e.data === S.PLAYING) {
      if (finished || !sessionStart) {
        // 新的一次播放
        finished = false;
        done = 0;
        total = 0;
        session = null;
        sessionStart = Date.now();
      }
      playing = true;
      msg.hidden = true;
      keepAwake(true);
    } else if (e.data === S.PAUSED) {
      playing = false;
    } else if (e.data === S.ENDED) {
      playing = false;
      onEnded();
    }
    updateStat();
  }

  let disposed = false;
  loadYouTubeAPI().then(() => {
    if (disposed) return; // API 載入期間已離開頁面
    player = new window.YT.Player(view.querySelector('#yt-player'), {
      videoId: sources[srcIndex].youtube,
      playerVars: { playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => { playBtn.disabled = false; },
        onStateChange,
        onError: e => showError(e.data)
      }
    });
  }).catch(err => {
    msg.hidden = false;
    msg.textContent = err.message + '，請確認網路連線後重新整理。';
  });

  playBtn.addEventListener('click', () => {
    if (!player) return;
    playing ? player.pauseVideo() : player.playVideo();
  });

  view.querySelector('[data-loop]').addEventListener('change', e => {
    loop = Number(e.target.value);
    prefs.set('loop', loop);
    updateStat();
  });

  view.querySelector('[data-source]')?.addEventListener('change', e => {
    srcIndex = Number(e.target.value);
    prefs.set(srcKey, srcIndex);
    msg.hidden = true;
    // 換音源仍算同一次播放，已播遍數保留
    if (player) playing ? player.loadVideoById(sources[srcIndex].youtube) : player.cueVideoById(sources[srcIndex].youtube);
  });

  updateStat();

  return () => {
    disposed = true;
    keepAwake(false);
    try { player?.destroy(); } catch { /* 忽略 */ }
  };
}

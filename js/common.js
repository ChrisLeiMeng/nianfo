// 共用小工具：HTML 跳脫、時間格式、偏好設定、螢幕常亮

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const pad2 = n => String(n).padStart(2, '0');

export function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const fmtNum = n => Number(n).toLocaleString('zh-TW');

// 偏好設定存在 localStorage；被封鎖時退回預設值
export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('nf.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('nf.' + key, JSON.stringify(value)); } catch { /* 忽略 */ }
  }
};

// 播放或計數時讓螢幕保持常亮（瀏覽器不支援時略過）
let wakeLock = null;
let wantAwake = false;

export async function keepAwake(on) {
  wantAwake = on;
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* 省電模式等情況會被拒絕，忽略 */ }
}

// 切回 App 時，系統已釋放的常亮要重新申請
document.addEventListener('visibilitychange', () => {
  if (wantAwake && document.visibilityState === 'visible') keepAwake(true);
});

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

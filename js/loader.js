// 讀取 config/*.json 與 texts/*.txt

let config = null;

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`無法讀取 ${path}（${res.status}）`);
  return res.json();
}

export async function loadConfig() {
  if (config) return config;
  const [itemsCfg, sources] = await Promise.all([
    loadJSON('config/items.json'),
    loadJSON('config/sources.json')
  ]);
  const byId = new Map(itemsCfg.items.map(it => [it.id, it]));
  const catById = new Map(itemsCfg.categories.map(c => [c.id, c]));
  config = {
    categories: itemsCfg.categories,
    items: itemsCfg.items,
    item: id => byId.get(id),
    category: id => catById.get(id),
    sources: id => (sources[id] || []).filter(s => s && s.youtube)
  };
  return config;
}

// 回傳 txt 內容；檔案不存在或空白時回傳 ''
export async function loadText(file) {
  if (!file) return '';
  try {
    const res = await fetch('texts/' + encodeURIComponent(file), { cache: 'no-cache' });
    if (!res.ok) return '';
    return (await res.text()).replace(/^﻿/, '').trim();
  } catch {
    return '';
  }
}

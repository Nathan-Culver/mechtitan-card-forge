(() => {
  'use strict';

  const W = 660, H = 900, PPI = 240;
  const STORAGE_KEY = 'mechtitan-card-forge-v1';
  const form = document.querySelector('#cardForm');
  const canvas = document.querySelector('#cardCanvas');
  const ctx = canvas.getContext('2d');
  const cardList = document.querySelector('#cardList');
  const saveStatus = document.querySelector('#saveStatus');
  const selected = new Set();
  let cards = [];
  let currentId = null;
  let artImage = null;
  const layerImages = {};
  const layerSources = {
    reference: 'assets/unit-reference-calibration.png', frame: 'assets/unit-frame-v2.png', bolt: 'assets/rarity-bolt-v2.png', construction: 'assets/construction-ring.svg',
    operation: 'assets/operation-disc.svg', cycleRing: 'assets/cycle-ring.svg', assetPill: 'assets/asset-cost-pill.svg',
    speedXS: 'assets/speed-xs.svg', speedS: 'assets/speed-s.svg', speedM: 'assets/speed-m.svg', speedF: 'assets/speed-f.svg', speedXF: 'assets/speed-xf.svg',
    header0: 'assets/header-assets-0.svg', header1: 'assets/header-assets-1.svg', header2: 'assets/header-assets-2.svg',
    header3: 'assets/header-assets-3.svg', header4: 'assets/header-assets-4.svg', header5: 'assets/header-assets-5.svg',
    attackPill: 'assets/attack-pill.svg', defensePill: 'assets/defense-pill.svg', activation: 'assets/tap-icon.svg',
    leftStatHousing: 'assets/stat-housing-left.svg', rightStatHousing: 'assets/stat-housing-right.svg'
  };
  const REFERENCE_ART = 'assets/naga-d-sample-art.png';
  let history = [];
  let historyIndex = -1;
  let historyTimer = null;
  let toastTimer = null;

  const defaults = {
    name: 'UNTITLED UNIT', construction: 0, operation: 0, assetL: '', assetP: '', assetS: '', assetT: '', assetU: '',
    loadout: 'Tonnage • Weapons • Systems', traits: 'Mech • Faction • Role', rules: 'Add rules text.', flavor: '', speed: 'M',
    attack: 0, armor: 0, structure: 1, cycle: '', rarity: 'Common', faction: '', artist: '', copyright: '© 2026 MechTitan TCG', setCode: 'CORE', collector: '001/001',
    theme: 'titanium', titleSize: 100, uppercaseTitle: true, artData: '', artScale: 100, artX: 0, artY: 0
  };

  function preloadLayers() {
    return Promise.all(Object.entries(layerSources).map(([key, src]) => new Promise(resolve => {
      const img = new Image(); img.onload = () => { layerImages[key] = img; render(); resolve(); }; img.onerror = resolve; img.src = src;
    })));
  }

  const themeMap = {
    titanium: { dark: '#06111a', mid: '#12334a', edge: '#3fbfe9', glow: '#7ce2ff' },
    ember: { dark: '#180806', mid: '#512017', edge: '#ef6a3d', glow: '#ffb16f' },
    royal: { dark: '#13091c', mid: '#382052', edge: '#a875e8', glow: '#d8b8ff' },
    verdant: { dark: '#06160e', mid: '#17462b', edge: '#43bb77', glow: '#92efb2' }
  };

  function uid() { return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }
  function assetValue(value) { return value === '' || value == null ? '' : clamp(value, 1, 4, 1); }
  function toast(message) {
    const el = document.querySelector('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function slug(text) { return (text || 'mechtitan-card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mechtitan-card'; }
  function escXml(text) { return String(text ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
  function normalizeCard(raw = {}) {
    const merged = { ...defaults, ...raw };
    return {
      ...merged,
      id: /^[a-z0-9_-]+$/i.test(String(raw.id || '')) ? String(raw.id) : uid(),
      name: String(merged.name || defaults.name).slice(0, 34),
      construction: clamp(merged.construction, 0, 20, 0), operation: clamp(merged.operation, 0, 4, 0),
      assetL: assetValue(merged.assetL), assetP: assetValue(merged.assetP), assetS: assetValue(merged.assetS), assetT: assetValue(merged.assetT), assetU: assetValue(merged.assetU),
      speed: ['XS','S','M','F','XF'].includes(String(merged.speed).toUpperCase()) ? String(merged.speed).toUpperCase() : 'M',
      attack: clamp(merged.attack, 0, 20, 0), armor: clamp(merged.armor, 0, 5, 0), structure: clamp(merged.structure, 1, 30, 1),
      cycle: merged.cycle === '' || merged.cycle == null ? '' : clamp(merged.cycle, 0, 3, 0),
      rarity: merged.rarity === 'Legendary' ? 'Unique' : (['Common','Uncommon','Rare','Unique'].includes(merged.rarity) ? merged.rarity : 'Common'),
      theme: themeMap[merged.theme] ? merged.theme : 'titanium', titleSize: clamp(merged.titleSize, 75, 115, 100),
      uppercaseTitle: merged.uppercaseTitle !== false && String(merged.uppercaseTitle).toLowerCase() !== 'false',
      artScale: clamp(merged.artScale, 100, 220, 100), artX: clamp(merged.artX, -100, 100, 0), artY: clamp(merged.artY, -100, 100, 0)
    };
  }

  function getFormData() {
    const fd = new FormData(form);
    const obj = Object.fromEntries(fd.entries());
    obj.uppercaseTitle = document.querySelector('#uppercaseTitle').checked;
    obj.artData = form.dataset.artData || '';
    return normalizeCard({ ...obj, id: currentId || uid() });
  }

  function setFormData(card, push = true) {
    const c = normalizeCard(card);
    currentId = c.id;
    Object.entries(c).forEach(([key, value]) => {
      const el = form.elements[key];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = value ?? '';
    });
    form.dataset.artData = c.artData || '';
    loadArt(c.artData || '');
    updateOutputs();
    saveStatus.textContent = cards.some(x => x.id === currentId) ? 'Saved locally' : 'New card';
    if (push) pushHistory();
    render();
    renderLibrary();
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cards, currentId }));
  }

  function saveCurrent(showToast = true) {
    const card = getFormData();
    const index = cards.findIndex(c => c.id === card.id);
    if (index >= 0) cards[index] = card; else cards.unshift(card);
    currentId = card.id;
    persist();
    renderLibrary();
    saveStatus.textContent = 'Saved locally';
    if (showToast) toast('Card saved to this browser');
    return card;
  }

  function loadStore() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored?.cards?.length) {
        cards = stored.cards.map(normalizeCard);
        currentId = cards.some(c => c.id === stored.currentId) ? stored.currentId : cards[0].id;
        return cards.find(c => c.id === currentId);
      }
    } catch (_) { /* use prototype */ }
    const prototype = normalizeCard({
      ...defaults, id: uid(), name: 'NAGA D', construction: 8, operation: 2, assetL: 3, assetU: 3,
      loadout: '80 tons • Med Laser • 4 SRMs • 2 Arrow IVs', traits: 'Mech • Artillery • Omni • Clan • Wolf',
      rules: 'Artillery Fire 2 — Deal 2 damage to a unit or the target. Use this ability only during a mission.',
      flavor: "Its primary use as an artillery platform limits the variety of other weaponry this 'Mech can carry.",
      speed: 'M', attack: 7, armor: 2, structure: 5, cycle: 2, rarity: 'Common', faction: 'Clan Wolf',
      artist: 'Randy Asplund-Faith', copyright: '©1997 Wizards of the Coast, Inc.', collector: '001/180',
      artData: REFERENCE_ART
    });
    cards = [prototype]; currentId = prototype.id; persist(); return prototype;
  }

  function pushHistory() {
    const snapshot = JSON.stringify(getFormData());
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    if (history.length > 40) history.shift();
    historyIndex = history.length - 1;
    updateUndoButtons();
  }
  function updateUndoButtons() {
    document.querySelector('#undoBtn').disabled = historyIndex <= 0;
    document.querySelector('#redoBtn').disabled = historyIndex >= history.length - 1;
  }
  function travelHistory(direction) {
    const next = historyIndex + direction;
    if (next < 0 || next >= history.length) return;
    historyIndex = next;
    setFormData(JSON.parse(history[historyIndex]), false);
    saveStatus.textContent = 'Unsaved changes';
    updateUndoButtons();
  }

  function updateOutputs() {
    ['artScale','artX','artY','titleSize'].forEach(id => {
      const input = document.querySelector(`#${id}`);
      const out = document.querySelector(`#${id}Out`);
      if (out) out.textContent = (id.includes('Scale') || id === 'titleSize') ? `${input.value}%` : input.value;
    });
    const zoom = document.querySelector('#zoom');
    document.querySelector('#zoomOut').textContent = `${zoom.value}%`;
    canvas.style.width = `${Math.round(660 * Number(zoom.value) / 100)}px`;
  }

  function loadArt(data) {
    artImage = null;
    if (!data) { render(); return; }
    const img = new Image();
    img.onload = () => { artImage = img; render(); };
    img.onerror = () => { artImage = null; render(); };
    img.src = data;
  }

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath(); c.roundRect(x, y, w, h, r); return c;
  }
  function fitText(c, text, maxWidth, startSize, minSize = 18, weight = 800) {
    let size = startSize;
    while (size > minSize) { c.font = `${weight} ${size}px Arial, sans-serif`; if (c.measureText(text).width <= maxWidth) break; size -= 1; }
    return size;
  }
  function fillTextOpticallyCentered(c, text, centerX, centerY) {
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(text ?? ''), centerX, centerY + 1);
    c.restore();
  }
  function strokeEmbossedEllipse(c, cx, cy, rx, ry, width = 4) {
    c.save();
    c.lineJoin = 'round';
    c.lineWidth = width + 1.2;
    c.strokeStyle = 'rgba(0, 0, 0, .78)';
    c.beginPath(); c.ellipse(cx + .55, cy + .7, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    const rim = c.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    rim.addColorStop(0, '#8e9691'); rim.addColorStop(.18, '#59615f');
    rim.addColorStop(.42, '#252a2a'); rim.addColorStop(.7, '#090b0c');
    rim.addColorStop(.88, '#414846'); rim.addColorStop(1, '#6f7772');
    c.lineWidth = width * .9;
    c.strokeStyle = rim;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = Math.max(.55, width * .17);
    c.strokeStyle = 'rgba(220,207,174,.24)';
    c.setLineDash([2.4, 1.2, .7, 1.8]);
    c.beginPath(); c.ellipse(cx - .45, cy - .45, rx - width * .62, ry - width * .62, 0, Math.PI * 1.02, Math.PI * 1.72); c.stroke();
    c.setLineDash([]); c.strokeStyle = 'rgba(0,0,0,.52)';
    c.beginPath(); c.ellipse(cx + .45, cy + .55, rx - width * .62, ry - width * .62, 0, -.02, Math.PI * .76); c.stroke();
    c.restore();
  }
  function strokeEmbossedRoundedRect(c, x, y, w, h, r, width = 3) {
    c.save();
    c.lineWidth = width + 1.1; c.strokeStyle = 'rgba(0,0,0,.78)';
    roundedRect(c, x + .5, y + .8, w, h, r).stroke();
    const rim = c.createLinearGradient(x, y, x + w, y + h);
    rim.addColorStop(0, '#929993'); rim.addColorStop(.2, '#5d6460');
    rim.addColorStop(.46, '#222625'); rim.addColorStop(.76, '#080a0b'); rim.addColorStop(1, '#737a74');
    c.lineWidth = width * .9; c.strokeStyle = rim; roundedRect(c, x, y, w, h, r).stroke();
    c.lineWidth = .65; c.strokeStyle = 'rgba(220,207,174,.26)'; c.setLineDash([3, 1.4, .8, 1.8]);
    c.beginPath(); c.moveTo(x + r, y + 2); c.lineTo(x + w - r, y + 2); c.stroke();
    c.setLineDash([]); c.strokeStyle = 'rgba(0,0,0,.5)';
    c.beginPath(); c.moveTo(x + r, y + h - 2); c.lineTo(x + w - r, y + h - 2); c.stroke();
    c.restore();
  }
  function fillTexturedEllipse(c, cx, cy, rx, ry, colors, seed = 0) {
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    const base = c.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    colors.forEach((color, i) => base.addColorStop(i / (colors.length - 1), color));
    c.fillStyle = base; c.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    const glow = c.createRadialGradient(cx - rx * .38, cy - ry * .44, 1, cx, cy, Math.max(rx, ry) * 1.35);
    glow.addColorStop(0, 'rgba(238,224,190,.18)'); glow.addColorStop(.42, 'rgba(255,255,255,.03)'); glow.addColorStop(1, 'rgba(0,0,0,.22)');
    c.fillStyle = glow; c.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    c.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 18; i++) {
      const px = cx - rx + ((i * 37 + seed * 11) % 97) / 96 * rx * 2;
      const py = cy - ry + ((i * 61 + seed * 17) % 89) / 88 * ry * 2;
      const size = 1.2 + ((i * 13 + seed) % 7) * .34;
      c.fillStyle = i % 3 ? 'rgba(235,218,177,.13)' : 'rgba(0,0,0,.14)';
      c.beginPath(); c.ellipse(px, py, size * 1.8, size, -.45, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over'; c.restore();
  }
  function drawCycleControl(c, centerX, centerY) {
    c.save(); c.fillStyle = '#f8f8f6'; c.strokeStyle = '#050505'; c.lineCap = 'butt';
    c.beginPath(); c.arc(centerX, centerY, 18.5, 0, Math.PI * 2); c.fill();
    c.lineWidth = 4;
    [[0,-26,0,-18],[0,18,0,26],[-26,0,-18,0],[18,0,26,0]].forEach(([x1,y1,x2,y2]) => {
      c.beginPath(); c.moveTo(centerX+x1, centerY+y1); c.lineTo(centerX+x2, centerY+y2); c.stroke();
    });
    c.lineCap = 'round'; c.lineWidth = 7.5;
    // Each arc stops before the opposing arrowhead, leaving the reference's
    // narrow white break while remaining joined to its own arrowhead.
    c.beginPath(); c.arc(centerX, centerY, 18, Math.PI + .28, Math.PI * 2 - .62); c.stroke();
    c.beginPath(); c.arc(centerX, centerY, 18, .28, Math.PI - .62); c.stroke();
    c.fillStyle = '#050505';
    c.beginPath(); c.moveTo(centerX + 20, centerY - 14); c.lineTo(centerX + 24.5, centerY + 5); c.lineTo(centerX + 10, centerY + 4); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(centerX - 20, centerY + 14); c.lineTo(centerX - 24.5, centerY - 5); c.lineTo(centerX - 10, centerY - 4); c.closePath(); c.fill();
    c.lineCap = 'round'; c.lineWidth = .8; c.strokeStyle = 'rgba(219,207,177,.2)'; c.setLineDash([2.4, 1.6]);
    c.beginPath(); c.arc(centerX - .35, centerY - .35, 17.4, Math.PI + .3, Math.PI * 2 - .64); c.stroke();
    c.beginPath(); c.arc(centerX - .35, centerY - .35, 17.4, .3, Math.PI - .64); c.stroke();
    c.setLineDash([]);
    c.restore();
  }
  function drawSpeedGauge(c, speed, x, y, w, h) {
    const marker = { XS: 27, S: 44, M: 62, F: 80, XF: 98 }[speed] || 62;
    const markerX = x + marker * w / 125;
    const cx = x + 62 * w / 125, cy = y + h / 2, rx = 56 * w / 125, ry = 45 * h / 100;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    const fastSide = c.createLinearGradient(x, y, x + w, y + h);
    fastSide.addColorStop(0, '#e9cf79'); fastSide.addColorStop(.35, '#d8b84e'); fastSide.addColorStop(.72, '#efd277'); fastSide.addColorStop(1, '#9e7625');
    c.fillStyle = fastSide; c.fillRect(x, y, w, h);
    const slowSide = c.createLinearGradient(x, y, markerX, y + h);
    slowSide.addColorStop(0, '#e4ad50'); slowSide.addColorStop(.3, '#c86429'); slowSide.addColorStop(.68, '#e18c37'); slowSide.addColorStop(1, '#8e3b1c');
    c.fillStyle = slowSide; c.fillRect(x, y, markerX - x, h);
    c.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 15; i++) {
      c.fillStyle = i % 3 ? 'rgba(236,210,155,.13)' : 'rgba(66,25,0,.18)';
      c.beginPath(); c.ellipse(x + ((i * 29) % 67), y + ((i * 19) % 47), 3.2, 1.35, -.45, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.restore();
    c.save(); c.fillStyle = '#050505';
    c.beginPath(); c.moveTo(markerX - 6, y + 3); c.lineTo(markerX + 6, y + 3); c.lineTo(markerX, y + 14); c.closePath(); c.fill();
    c.restore();
    strokeEmbossedEllipse(c, cx, cy, rx, ry, 3.4);
  }
  function drawStatHousing(c, x, y, w, h, mirrored = false) {
    c.save();
    const shell = c.createLinearGradient(x, y, x, y + h);
    shell.addColorStop(0, '#176183'); shell.addColorStop(.23, '#082b40'); shell.addColorStop(.62, '#020d17'); shell.addColorStop(1, '#0b3850');
    c.fillStyle = shell; c.strokeStyle = '#020508'; c.lineWidth = 3.5;
    c.beginPath();
    if (mirrored) {
      c.moveTo(x + 18, y); c.lineTo(x + w - 13, y); c.lineTo(x + w, y + 15); c.lineTo(x + w, y + h - 12);
      c.lineTo(x + w - 16, y + h); c.lineTo(x + 15, y + h); c.lineTo(x, y + h - 17); c.lineTo(x, y + 15);
    } else {
      c.moveTo(x + 13, y); c.lineTo(x + w - 18, y); c.lineTo(x + w, y + 15); c.lineTo(x + w, y + h - 17);
      c.lineTo(x + w - 15, y + h); c.lineTo(x + 16, y + h); c.lineTo(x, y + h - 12); c.lineTo(x, y + 15);
    }
    c.closePath(); c.fill(); c.stroke();
    const recess = c.createLinearGradient(x, y + 5, x, y + h - 5);
    recess.addColorStop(0, '#343638'); recess.addColorStop(.45, '#202326'); recess.addColorStop(1, '#111417');
    c.fillStyle = recess; c.strokeStyle = '#07121a'; c.lineWidth = 2.5;
    roundedRect(c, x + 6, y + 6, w - 12, h - 12, (h - 12) / 2).fill();
    roundedRect(c, x + 6, y + 6, w - 12, h - 12, (h - 12) / 2).stroke();
    c.strokeStyle = '#2d86a7'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + 17, y + 5); c.lineTo(x + w - 25, y + 5); c.stroke();
    c.strokeStyle = '#a38a6b'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x + 19, y + h - 5); c.lineTo(x + w - 22, y + h - 5); c.stroke();
    c.restore();
  }
  function drawTapIcon(c, centerX, centerY) {
    c.save(); c.translate(centerX - 10.5, centerY - 10.5); c.scale(.21, .21);
    c.fillStyle = '#231f20'; c.beginPath(); c.arc(50, 50, 49, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(50, 50, 49, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#fff';
    c.fill(new Path2D('M37 84 47 74C31 56 30 38 40 28c8-8 20-8 28 5l8-12 4 33H46l12-10c-7-6-14-7-20-2-9 8-5 22 5 32Z'));
    c.restore();
    c.restore();
  }
  function wrapLines(c, text, maxWidth, maxLines = 6) {
    const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (c.measureText(test).width > maxWidth && line) { lines.push(line); line = word; if (lines.length === maxLines - 1) break; }
      else line = test;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (words.length && lines.length === maxLines) {
      while (c.measureText(lines[maxLines - 1] + '…').width > maxWidth && lines[maxLines - 1].includes(' ')) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S+$/, '');
      if (!String(text).endsWith(lines[maxLines - 1])) lines[maxLines - 1] += '…';
    }
    return lines;
  }

  function drawStyledSegments(c, segments, x, y, maxWidth, lineHeight, maxLines) {
    let cursorX = x, cursorY = y, lines = 1;
    for (const segment of segments) {
      const words = String(segment.text || '').split(/(\s+)/).filter(Boolean);
      for (const word of words) {
        c.font = `${segment.style || 'normal'} ${segment.weight || 400} ${segment.size || 18}px Arial, sans-serif`;
        const width = c.measureText(word).width;
        if (!/^\s+$/.test(word) && cursorX + width > x + maxWidth && cursorX > x) {
          lines += 1;
          if (lines > maxLines) return cursorY;
          cursorX = x; cursorY += lineHeight;
        }
        if (cursorX === x && /^\s+$/.test(word)) continue;
        c.fillText(word, cursorX, cursorY);
        cursorX += width;
      }
    }
    return cursorY;
  }

  function drawCard(target, card, scale = 1, guides = false) {
    const c = target; const t = themeMap[card.theme] || themeMap.titanium;
    c.save(); c.scale(scale, scale); c.clearRect(0, 0, W, H);
    const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#00101e'); bg.addColorStop(.5, '#020609'); bg.addColorStop(1, '#001523'); c.fillStyle = bg; c.fillRect(0, 0, W, H);

    const trim = { x: 30, y: 30, w: 600, h: 840 };
    const mx = value => trim.x + value * trim.w / 1056;
    const my = value => trim.y + value * trim.h / 1490;
    const mw = value => value * trim.w / 1056;
    const mh = value => value * trim.h / 1490;
    if (layerImages.frame) c.drawImage(layerImages.frame, trim.x, trim.y, trim.w, trim.h);
    else if (layerImages.reference) c.drawImage(layerImages.reference, trim.x, trim.y, trim.w, trim.h);

    const art = { x: mx(78), y: my(284), w: mw(900), h: mh(726) };
    c.save(); c.beginPath(); c.rect(art.x, art.y, art.w, art.h); c.clip();
    if (artImage) {
      const cover = Math.max(art.w / artImage.width, art.h / artImage.height) * (card.artScale / 100);
      const dw = artImage.width * cover, dh = artImage.height * cover;
      c.drawImage(artImage, art.x + (art.w - dw) / 2 + card.artX * 1.8, art.y + (art.h - dh) / 2 + card.artY * 1.5, dw, dh);
    } else {
      const g = c.createLinearGradient(art.x, art.y, art.x + art.w, art.y + art.h); g.addColorStop(0, t.mid); g.addColorStop(.6, '#101820'); g.addColorStop(1, t.dark); c.fillStyle = g; c.fillRect(art.x, art.y, art.w, art.h);
      c.strokeStyle = t.edge + '88'; c.lineWidth = 2;
      for (let x = -100; x < 800; x += 44) { c.beginPath(); c.moveTo(x, art.y); c.lineTo(x + 270, art.y + art.h); c.stroke(); }
      c.fillStyle = '#dcecf3a8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 18px Arial'; c.fillText('UPLOAD UNIT ARTWORK', W / 2, 382); c.font = '500 11px Arial'; c.fillText('ART TAB  •  PNG / JPEG / WEBP', W / 2, 407);
    }
    c.restore();

    c.textBaseline = 'middle'; c.textAlign = 'center';
    if (layerImages.construction) c.drawImage(layerImages.construction, 72, 69, 44, 44);
    else { c.fillStyle = '#f8f8f6'; c.strokeStyle = '#050505'; c.lineWidth = 4; c.beginPath(); c.arc(94, 91, 20, 0, Math.PI * 2); c.fill(); c.stroke(); }
    strokeEmbossedEllipse(c, 94, 91, 20, 20, 3.1);
    c.fillStyle = '#050505'; c.font = '900 31px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.construction, 95, 93);
    if (layerImages.operation) c.drawImage(layerImages.operation, 121, 73, 37, 37);
    else { c.fillStyle = '#050505'; c.beginPath(); c.arc(139.5, 91.5, 18.5, 0, Math.PI * 2); c.fill(); }
    strokeEmbossedEllipse(c, 139.5, 91.5, 18, 18, 2.7);
    c.fillStyle = '#fff'; c.font = '900 28px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.operation, 139.5, 91.5);

    const title = card.uppercaseTitle ? card.name.toUpperCase() : card.name;
    const titleSize = fitText(c, title, 350, 46 * card.titleSize / 100, 22, 900);
    c.fillStyle = '#040404'; c.font = `900 ${titleSize}px "Arial Black", "Arial Narrow", Arial`; c.shadowColor = '#8d8d8d'; c.shadowOffsetY = 1; fillTextOpticallyCentered(c, title, 347, 91); c.shadowColor = 'transparent'; c.shadowOffsetY = 0;
    if (card.cycle !== '') {
      drawCycleControl(c, 568.5, 91.5);
      c.fillStyle = '#050505'; c.font = '900 27px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.cycle, 568.5, 91.5);
    }

    const assets = [['L','#167ee6'],['P','#9c4dcc'],['S','#f0bc18'],['T','#f04e9b'],['U','#24b769']].filter(([key]) => card[`asset${key}`] !== '');
    // Leave a narrow black reveal between the white Asset rail and header boxes.
    // This keeps their centered strokes visually separate instead of touching.
    const firstRowLeft = assets.length ? 185 : 60;
    const secondRowLeft = assets.length > 1 ? 185 : 60;

    // Rebuild the complete variable header on top of the fixed frame so no legacy
    // two-cost geometry can leak through at 0, 1, or 3–5 Asset Costs.
    c.fillStyle = '#020202'; c.fillRect(mx(60), my(155), mw(930), mh(126));
    if (assets.length) {
      const railBottom = 151 + assets.length * 63;
      c.fillStyle = '#f4f3ef'; c.strokeStyle = '#050505'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(mx(60), my(155)); c.lineTo(mx(175), my(155)); c.lineTo(mx(175), my(railBottom));
      c.lineTo(mx(157), my(railBottom + 11)); c.lineTo(mx(60), my(railBottom + 11)); c.closePath(); c.fill();
      // Keep the rail open at the top so no horizontal rule sits above the first cost pill.
      c.beginPath(); c.moveTo(mx(175), my(155)); c.lineTo(mx(175), my(railBottom));
      c.lineTo(mx(157), my(railBottom + 11)); c.lineTo(mx(60), my(railBottom + 11)); c.lineTo(mx(60), my(155)); c.stroke();
    }
    c.fillStyle = '#020202'; c.strokeStyle = '#050505'; c.lineWidth = 4;
    c.fillRect(mx(firstRowLeft), my(155), mw(990 - firstRowLeft), mh(64));
    c.strokeRect(mx(firstRowLeft), my(155), mw(990 - firstRowLeft), mh(64));
    c.fillRect(mx(secondRowLeft), my(219), mw(990 - secondRowLeft), mh(62));
    c.strokeRect(mx(secondRowLeft), my(219), mw(990 - secondRowLeft), mh(62));
    c.strokeStyle = '#eeeeec'; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(mx(secondRowLeft + 18), my(219)); c.lineTo(mx(974), my(219)); c.stroke();

    const firstRowCenter = mx((firstRowLeft + 990) / 2);
    const secondRowCenter = mx((secondRowLeft + 990) / 2);
    const firstRowWidth = mw(990 - firstRowLeft - 24);
    const secondRowWidth = mw(990 - secondRowLeft - 24);

    const loadoutSize = fitText(c, card.loadout, firstRowWidth, 23, 16, 500);
    c.fillStyle = '#f4f4f4'; c.font = `500 ${loadoutSize}px Arial`; fillTextOpticallyCentered(c, card.loadout, firstRowCenter, my(187));
    const traitLine = `${card.rarity} • ${card.traits}`;
    const traitSize = fitText(c, traitLine, secondRowWidth, 23, 15, 500);
    c.font = `500 ${traitSize}px Arial`; fillTextOpticallyCentered(c, traitLine, secondRowCenter, my(250));

    assets.forEach(([key, color], i) => {
      const y = 120 + i * 36;
      const assetFill = c.createLinearGradient(68, y, 126, y + 29);
      assetFill.addColorStop(0, '#e9e5d9'); assetFill.addColorStop(.42, '#d2d3cd'); assetFill.addColorStop(.72, '#e2dfd3'); assetFill.addColorStop(1, '#aeb3ae');
      c.fillStyle = assetFill; roundedRect(c, 68, y, 58, 29, 14).fill();
      strokeEmbossedRoundedRect(c, 68, y, 58, 29, 14, 2.7);
      const colorTexture = c.createLinearGradient(99, y + 2, 124, y + 27);
      colorTexture.addColorStop(0, '#d5c9ad'); colorTexture.addColorStop(.1, color); colorTexture.addColorStop(.58, color); colorTexture.addColorStop(1, '#252728');
      c.fillStyle = colorTexture; roundedRect(c, 99, y + 2, 25, 25, 9).fill();
      c.fillStyle = '#050505'; c.font = '900 25px "Arial Black", Arial'; fillTextOpticallyCentered(c, card[`asset${key}`], 83, y + 15);
      c.fillStyle = '#fff'; c.font = '900 23px "Arial Black", Arial'; fillTextOpticallyCentered(c, key, 111.5, y + 15);
    });

    const rarityCount = { Unique: 1, Rare: 2, Uncommon: 3, Common: 4 }[card.rarity] || 4;
    c.fillStyle = '#050708'; c.beginPath(); c.moveTo(478, 586); c.lineTo(581, 586); c.lineTo(575, 608); c.lineTo(467, 608); c.closePath(); c.fill();
    for (let i = 0; i < rarityCount; i++) {
      const x = 571 - (rarityCount - i) * 22;
      if (layerImages.bolt) c.drawImage(layerImages.bolt, x + 1, 590, 16, 16);
      else { c.fillStyle = '#cfd2d4'; c.beginPath(); c.arc(x + 9, 598, 7, 0, Math.PI * 2); c.fill(); }
    }

    c.fillStyle = '#080808'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    drawTapIcon(c, 94, 660);
    const ruleParts = String(card.rules || '').split(/\s+[—–-]\s+/, 2);
    const ruleSegments = ruleParts.length > 1
      ? [{ text: ': ', weight: 600, size: 20.5 }, { text: `${ruleParts[0]} `, weight: 800, size: 20.5 }, { text: `(${ruleParts[1]})`, style: 'italic', weight: 400, size: 21.5 }]
      : [{ text: ': ', weight: 600, size: 20.5 }, { text: card.rules, weight: 700, size: 20.5 }];
    let y = drawStyledSegments(c, ruleSegments, 107, 668, 464, 24, 4) + 40;
    if (card.flavor) { c.font = 'italic 21px Arial'; wrapLines(c, card.flavor, 466, 3).forEach(line => { c.fillText(line, 85, y); y += 23; }); }

    // Cover the plain frame pods with beveled blue-black housings that visually
    // lock into the surrounding metalwork, then seat the stat gauges as insets.
    if (layerImages.leftStatHousing) c.drawImage(layerImages.leftStatHousing, 58, 776, 149, 64);
    else drawStatHousing(c, 58, 776, 149, 64, false);
    if (layerImages.rightStatHousing) c.drawImage(layerImages.rightStatHousing, 453, 776, 151, 64);
    else drawStatHousing(c, 453, 776, 151, 64, true);
    drawSpeedGauge(c, card.speed, 68, 783, 68, 50);
    fillTexturedEllipse(c, 168, 808, 32.5, 24.5, ['#cf4a4d', '#b70b15', '#7e090e', '#c82a2f', '#52080b'], 7);
    strokeEmbossedEllipse(c, 168, 808, 32.5, 24.5, 3.2);
    fillTexturedEllipse(c, 498, 808, 24.5, 24.5, ['#deddd4', '#b4bbb9', '#737b7c', '#c9cbc4', '#686f70'], 13);
    strokeEmbossedEllipse(c, 498, 808, 24.5, 24.5, 3.1);
    fillTexturedEllipse(c, 559, 808, 31.5, 23.5, ['#454b4d', '#252827', '#0d0f0f', '#343938', '#151817'], 19);
    strokeEmbossedEllipse(c, 559, 808, 31.5, 23.5, 2.7);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#050505'; c.font = `900 ${card.speed.length > 1 ? 29 : 35}px "Arial Black", Arial`; fillTextOpticallyCentered(c, card.speed, 103, 808);
    c.fillStyle = '#fff'; c.font = '900 37px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.attack, 168, 808);
    c.fillStyle = '#050505'; fillTextOpticallyCentered(c, card.armor, 498, 808);
    c.fillStyle = '#fff'; fillTextOpticallyCentered(c, card.structure, 559, 808);
    c.fillStyle = '#050505'; c.font = '600 16px "Arial Narrow", Arial'; fillTextOpticallyCentered(c, card.artist ? `Illus. ${card.artist}` : 'Artist credit', 330, 806);
    c.font = '500 11.5px Arial'; fillTextOpticallyCentered(c, card.copyright || `${card.setCode} • ${card.collector}`, 330, 821);

    if (guides) {
      c.save(); c.setLineDash([8, 7]); c.strokeStyle = '#ff3f6dcc'; c.lineWidth = 2; c.strokeRect(30, 30, 600, 840); c.setLineDash([]); c.fillStyle = '#ff3f6d'; c.font = '700 10px Arial'; c.textAlign = 'left'; c.fillText('TRIM', 35, 43); c.restore();
    }
    c.restore();
  }

  function render() { drawCard(ctx, getFormData(), 1, document.querySelector('#showBleed').checked); }

  function renderLibrary() {
    const query = document.querySelector('#searchCards').value.toLowerCase();
    const faction = document.querySelector('#filterFaction').value;
    const factions = [...new Set(cards.map(c => c.faction).filter(Boolean))].sort();
    const filter = document.querySelector('#filterFaction');
    const old = filter.value; filter.innerHTML = '<option value="">All factions</option>' + factions.map(x => `<option>${escXml(x)}</option>`).join(''); filter.value = old;
    const shown = cards.filter(c => (!query || `${c.name} ${c.faction} ${c.traits}`.toLowerCase().includes(query)) && (!faction || c.faction === faction));
    cardList.innerHTML = shown.length ? shown.map(c => `<article class="library-card ${c.id === currentId ? 'current' : ''}" data-id="${c.id}" tabindex="0"><input type="checkbox" aria-label="Select ${escXml(c.name)}" ${selected.has(c.id) ? 'checked' : ''}><div class="mini-card"></div><div class="library-meta"><strong>${escXml(c.name)}</strong><span>${escXml(c.faction || c.traits || 'Unassigned')}</span></div><span class="library-cost">${c.construction}</span></article>`).join('') : '<p class="hint">No cards match this view.</p>';
    document.querySelector('#selectionCount').textContent = `${selected.size} selected`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function stampPngDpi(blob, dpi) {
    const source = new Uint8Array(await blob.arrayBuffer());
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21); const view = new DataView(chunk.buffer);
    view.setUint32(0, 9); chunk.set([112,72,89,115], 4); view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
    view.setUint32(17, crc32(chunk.subarray(4, 17)));
    const output = new Uint8Array(source.length + chunk.length);
    output.set(source.subarray(0, 33), 0); output.set(chunk, 33); output.set(source.subarray(33), 54);
    return new Blob([output], { type: 'image/png' });
  }
  async function stampJpegDpi(blob, dpi) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    for (let i = 2; i + 16 < bytes.length && bytes[i] === 0xff;) {
      const marker = bytes[i + 1], length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker === 0xe0 && String.fromCharCode(...bytes.subarray(i + 4, i + 9)) === 'JFIF\0') {
        bytes[i + 11] = 1; bytes[i + 12] = dpi >> 8; bytes[i + 13] = dpi & 255; bytes[i + 14] = dpi >> 8; bytes[i + 15] = dpi & 255;
        break;
      }
      if (!length) break; i += length + 2;
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  async function renderCardBlob(card, format, dpi) {
    const factor = dpi / PPI; const out = document.createElement('canvas'); out.width = W * factor; out.height = H * factor;
    const outCtx = out.getContext('2d');
    let image = artImage;
    if (card.artData && card.id !== currentId) image = await new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = card.artData; });
    const previous = artImage; artImage = image; drawCard(outCtx, card, factor, false); artImage = previous;
    if (format === 'svg') {
      const png = out.toDataURL('image/png');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2.75in" height="3.75in" viewBox="0 0 ${out.width} ${out.height}"><title>${escXml(card.name)}</title><image width="${out.width}" height="${out.height}" href="${png}"/></svg>`;
      return new Blob([svg], { type: 'image/svg+xml' });
    }
    const raster = await new Promise(resolve => out.toBlob(resolve, format === 'jpeg' ? 'image/jpeg' : 'image/png', .95));
    return format === 'jpeg' ? stampJpegDpi(raster, dpi) : stampPngDpi(raster, dpi);
  }

  async function exportCard(card = getFormData(), format = document.querySelector('#exportFormat').value, dpi = Number(document.querySelector('#exportDpi').value)) {
    const blob = await renderCardBlob(card, format, dpi); const ext = format === 'jpeg' ? 'jpg' : format;
    downloadBlob(blob, `${slug(card.name)}-${dpi}dpi.${ext}`); toast(`${card.name} exported at ${dpi} DPI`);
  }

  function exportProject() {
    saveCurrent(false);
    const project = { app: 'MechTitan Card Forge', version: 1, exportedAt: new Date().toISOString(), print: { trimInches: [2.5,3.5], bleedInches: .125 }, cards };
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], {type:'application/json'}), `${slug(cards[0]?.setCode || 'mechtitan')}-card-set.json`);
    toast(`Exported ${cards.length} card${cards.length === 1 ? '' : 's'}`);
  }

  function importProjectFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result); const incoming = Array.isArray(data) ? data : data.cards;
        if (!Array.isArray(incoming) || !incoming.length) throw new Error('No cards found');
        cards = incoming.map(c => normalizeCard({ ...c, id: c.id || uid() })); currentId = cards[0].id; selected.clear(); persist(); setFormData(cards[0]); toast(`Loaded ${cards.length} cards`);
      } catch (error) { toast(`Could not load project: ${error.message}`); }
    }; reader.readAsText(file);
  }

  function parseDelimited(text, delimiter) {
    const rows = []; let row = [], cell = '', quote = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i+1];
      if (ch === '"' && quote && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quote = !quote;
      else if (ch === delimiter && !quote) { row.push(cell); cell = ''; }
      else if ((ch === '\n' || ch === '\r') && !quote) { if (ch === '\r' && next === '\n') i++; row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    const headers = rows.shift().map(h => h.trim()); return rows.map(r => Object.fromEntries(headers.map((h,i) => [h, r[i] ?? ''])));
  }

  function mapImportRow(row) {
    const aliases = { cardname:'name', title:'name', constructioncost:'construction', operationcost:'operation', logistics:'assetL', politics:'assetP', strategics:'assetS', tactics:'assetT', support:'assetU', cardtext:'rules', ruletext:'rules', flavortext:'flavor', cyclevalue:'cycle', speedvalue:'speed', set:'setCode', number:'collector' };
    const mapped = {};
    Object.entries(row).forEach(([key,value]) => { const compact = key.replace(/[^a-z0-9]/gi,'').toLowerCase(); const target = aliases[compact] || Object.keys(defaults).find(k => k.toLowerCase() === compact); if (target) mapped[target] = value; });
    return normalizeCard({ ...mapped, id: uid() });
  }

  async function bulkImport(file) {
    try {
      let rows;
      if (/\.json$/i.test(file.name)) { const json = JSON.parse(await file.text()); rows = Array.isArray(json) ? json : json.cards; }
      else if (/\.xlsx?$/i.test(file.name)) {
        if (!window.XLSX) throw new Error('Spreadsheet reader is still loading. Try again in a moment.');
        const book = XLSX.read(await file.arrayBuffer()); rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
      } else { const text = await file.text(); rows = parseDelimited(text, /\.tsv$/i.test(file.name) ? '\t' : ','); }
      if (!Array.isArray(rows) || !rows.length) throw new Error('No data rows found');
      const imported = rows.map(mapImportRow); cards.push(...imported); currentId = imported[0].id; persist(); setFormData(imported[0]); toast(`Imported ${imported.length} cards`);
    } catch (error) { toast(`Import failed: ${error.message}`); }
  }

  form.addEventListener('input', () => {
    updateOutputs(); render(); saveStatus.textContent = 'Unsaved changes';
    clearTimeout(historyTimer); historyTimer = setTimeout(pushHistory, 350);
  });
  document.querySelector('#showBleed').addEventListener('change', render);
  document.querySelector('#zoom').addEventListener('input', updateOutputs);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => { x.classList.toggle('active', x === tab); x.setAttribute('aria-selected', x === tab); });
    document.querySelectorAll('.tab-page').forEach(x => x.classList.toggle('active', x.dataset.page === tab.dataset.tab));
  }));
  document.querySelector('#chooseArtBtn').addEventListener('click', () => document.querySelector('#artFile').click());
  document.querySelector('#artFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 12 * 1024 * 1024) return toast('Artwork must be under 12 MB');
    const reader = new FileReader(); reader.onload = () => { form.dataset.artData = reader.result; loadArt(reader.result); saveStatus.textContent = 'Unsaved changes'; pushHistory(); }; reader.readAsDataURL(file);
  });
  document.querySelector('#clearArtBtn').addEventListener('click', () => { form.dataset.artData = ''; artImage = null; render(); pushHistory(); });
  document.querySelector('#saveBtn').addEventListener('click', () => saveCurrent());
  document.querySelector('#exportImageBtn').addEventListener('click', () => exportCard());
  document.querySelector('#exportProjectBtn').addEventListener('click', exportProject);
  document.querySelector('#importProjectBtn').addEventListener('click', () => document.querySelector('#projectFile').click());
  document.querySelector('#projectFile').addEventListener('change', e => e.target.files[0] && importProjectFile(e.target.files[0]));
  document.querySelector('#bulkImportBtn').addEventListener('click', () => document.querySelector('#bulkFile').click());
  document.querySelector('#bulkFile').addEventListener('change', e => e.target.files[0] && bulkImport(e.target.files[0]));
  document.querySelector('#newCardBtn').addEventListener('click', () => { currentId = uid(); history = []; historyIndex = -1; setFormData({ ...defaults, id: currentId }); });
  document.querySelector('#duplicateBtn').addEventListener('click', () => { const source = cards.find(c => c.id === currentId) || getFormData(); const copy = normalizeCard({ ...source, id: uid(), name: `${source.name} COPY` }); cards.unshift(copy); persist(); setFormData(copy); toast('Card duplicated'); });
  document.querySelector('#deleteBtn').addEventListener('click', () => {
    const ids = selected.size ? [...selected] : [currentId]; cards = cards.filter(c => !ids.includes(c.id)); selected.clear();
    if (!cards.length) cards.push(normalizeCard({ ...defaults, id: uid() })); currentId = cards[0].id; persist(); setFormData(cards[0]); toast(`Deleted ${ids.length} card${ids.length === 1 ? '' : 's'}`);
  });
  document.querySelector('#undoBtn').addEventListener('click', () => travelHistory(-1));
  document.querySelector('#redoBtn').addEventListener('click', () => travelHistory(1));
  document.querySelector('#searchCards').addEventListener('input', renderLibrary);
  document.querySelector('#filterFaction').addEventListener('change', renderLibrary);
  cardList.addEventListener('click', event => {
    const item = event.target.closest('.library-card'); if (!item) return; const id = item.dataset.id;
    if (event.target.matches('input[type=checkbox]')) { event.target.checked ? selected.add(id) : selected.delete(id); renderLibrary(); return; }
    const card = cards.find(c => c.id === id); if (card) setFormData(card);
  });
  cardList.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.library-card')) { event.preventDefault(); const card = cards.find(c => c.id === event.target.dataset.id); if (card) setFormData(card); } });
  document.querySelector('#exportGroupBtn').addEventListener('click', async () => {
    const ids = selected.size ? [...selected] : [currentId]; const group = cards.filter(c => ids.includes(c.id)); if (!group.length) return toast('Select at least one saved card');
    const format = document.querySelector('#exportFormat').value, dpi = Number(document.querySelector('#exportDpi').value);
    for (let i = 0; i < group.length; i++) { await exportCard(group[i], format, dpi); await new Promise(r => setTimeout(r, 250)); }
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveCurrent(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1); }
  });

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const tools = [
      {
        name: 'read_current_card', title: 'Read current card', description: 'Read the fields of the card currently open in MechTitan Card Forge.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => getFormData()
      },
      {
        name: 'stage_card_fields', title: 'Stage card fields', description: 'Update visible fields on the currently open card without saving it to the set library.',
        inputSchema: { type: 'object', properties: { fields: { type: 'object', additionalProperties: true } }, required: ['fields'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: input => { if (!input?.fields || typeof input.fields !== 'object') throw new Error('fields must be an object'); setFormData({ ...getFormData(), ...input.fields, id: currentId }); saveStatus.textContent = 'Unsaved changes'; return { status: 'staged', id: currentId, name: getFormData().name }; }
      },
      {
        name: 'save_current_card', title: 'Save current card', description: 'Save the current visible card to the local set library.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { const card = saveCurrent(false); return { status: 'saved', id: card.id, name: card.name, totalCards: cards.length }; }
      }
    ];
    tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {} });
  }

  preloadLayers();
  const initial = loadStore(); setFormData(initial); updateUndoButtons(); registerWebMcp();
})();

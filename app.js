(() => {
  'use strict';

  const W = 660, H = 900, PPI = 240;
  const STORAGE_KEY = 'mechtitan-card-forge-v1';
  const form = document.querySelector('#cardForm');
  const canvas = document.querySelector('#cardCanvas');
  const ctx = canvas.getContext('2d');
  const mobileCanvas = document.querySelector('#mobileCardCanvas');
  const mobileCtx = mobileCanvas.getContext('2d');
  const stickyPreview = document.querySelector('#stickyPreview');
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
    leftStatHousing: 'assets/stat-housing-left.svg', rightStatHousing: 'assets/stat-housing-right.svg',
    attackOnlyHousing: 'assets/stat-housing-attack-only.svg?v=10', structureOnlyHousing: 'assets/stat-housing-structure-only.svg?v=10',
    statTextureWhite: 'assets/stat-texture-white.png', statTexturePalette: 'assets/stat-texture-palette.png'
  };
  let history = [];
  let historyIndex = -1;
  let historyTimer = null;
  let toastTimer = null;

  const defaults = {
    name: '', construction: '-', operation: '-', assetL: '', assetP: '', assetS: '', assetT: '', assetU: '',
    loadout: '', traits: '', rules: '', flavor: '', speed: '-',
    attack: '-', armor: '-', structure: '-', cycle: '-', rarity: 'None', faction: '', artist: '', copyright: '', setCode: '', collector: '',
    theme: 'titanium', titleSize: 100, uppercaseTitle: false, showTags: false, showTypes: true, artData: '', artScale: 100, artX: 0, artY: 0
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
  function removableStat(value, min, max, fallback) {
    return String(value ?? '').trim() === '-' ? '-' : clamp(value, min, max, fallback);
  }
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
      construction: removableStat(merged.construction, 0, 20, 0), operation: removableStat(merged.operation, 0, 4, 0),
      assetL: assetValue(merged.assetL), assetP: assetValue(merged.assetP), assetS: assetValue(merged.assetS), assetT: assetValue(merged.assetT), assetU: assetValue(merged.assetU),
      speed: ['XS','S','M','F','XF','-'].includes(String(merged.speed).toUpperCase()) ? String(merged.speed).toUpperCase() : 'M',
      attack: removableStat(merged.attack, 0, 20, 0), armor: removableStat(merged.armor, 0, 5, 0), structure: removableStat(merged.structure, 1, 30, 1),
      cycle: merged.cycle === '' || merged.cycle == null ? '' : removableStat(merged.cycle, 0, 3, 0),
      rarity: merged.rarity === 'Legendary' ? 'Unique' : (['Common','Uncommon','Rare','Unique','None'].includes(merged.rarity) ? merged.rarity : 'Common'),
      theme: themeMap[merged.theme] ? merged.theme : 'titanium', titleSize: clamp(merged.titleSize, 75, 115, 100),
      uppercaseTitle: merged.uppercaseTitle !== false && String(merged.uppercaseTitle).toLowerCase() !== 'false',
      showTags: merged.showTags !== false && String(merged.showTags).toLowerCase() !== 'false',
      showTypes: true,
      artScale: clamp(merged.artScale, 100, 220, 100), artX: clamp(merged.artX, -100, 100, 0), artY: clamp(merged.artY, -100, 100, 0)
    };
  }

  function getFormData() {
    const fd = new FormData(form);
    const obj = Object.fromEntries(fd.entries());
    obj.uppercaseTitle = document.querySelector('#uppercaseTitle').checked;
    obj.showTags = document.querySelector('#showTags').checked;
    obj.showTypes = true;
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

  function clearCurrentCard() {
    const current = cards.find(card => card.id === currentId);
    const label = current?.name || getFormData().name || 'this card';
    if (!window.confirm(`Clear ${label}? This replaces its saved contents in this browser with a blank card.`)) return;

    currentId ||= uid();
    history = [];
    historyIndex = -1;
    const blank = normalizeCard({ ...defaults, id: currentId });
    const index = cards.findIndex(card => card.id === currentId);
    if (index >= 0) cards[index] = blank; else cards.unshift(blank);
    selected.delete(currentId);
    persist();
    setFormData(blank);
    updateUndoButtons();
    toast('Saved card cleared');
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
    const blank = normalizeCard({ ...defaults, id: uid() });
    cards = [blank]; currentId = blank.id; persist(); return blank;
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
  function fillTextGlyphCentered(c, text, centerX, centerY) {
    const value = String(text ?? '');
    const metrics = c.measureText(value);
    const ascent = metrics.actualBoundingBoxAscent || 0;
    const descent = metrics.actualBoundingBoxDescent || 0;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText(value, centerX, centerY + (ascent - descent) / 2);
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
    c.setLineDash([]);
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
  function drawImageTextureEllipse(c, image, source, cx, cy, rx, ry, alpha = 1) {
    if (!image) return;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    c.globalAlpha = alpha;
    c.drawImage(image, source.x, source.y, source.w, source.h, cx - rx, cy - ry, rx * 2, ry * 2);
    c.restore();
  }
  function drawImageTextureRoundedRect(c, image, source, x, y, w, h, radius, alpha = 1) {
    if (!image) return;
    c.save(); roundedRect(c, x, y, w, h, radius).clip(); c.globalAlpha = alpha;
    c.drawImage(image, source.x, source.y, source.w, source.h, x, y, w, h);
    c.restore();
  }
  function drawCycleControl(c, centerX, centerY) {
    c.save(); c.fillStyle = '#f8f8f6'; c.strokeStyle = '#050505'; c.lineCap = 'butt';
    c.beginPath(); c.arc(centerX, centerY, 18.5, 0, Math.PI * 2); c.fill();
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
    // x/y/w/h describe the visible oval itself. This keeps Speed identical in
    // size and shape to Attack instead of inheriting the SVG's outer padding.
    const markerX = x + (marker - 6) * w / 112;
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    if (layerImages.statTexturePalette) {
      // Apply the supplied yellow texture only to the fixed portion of the gauge.
      c.drawImage(layerImages.statTexturePalette, 4, 423, 913, 423, x, y, w, h);
      // Lift the dark source swatch without flattening its hand-painted variation.
      c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(255, 231, 145, .34)'; c.fillRect(x, y, w, h);
      // Restore the moving Speed segment with its original untextured orange paint.
      c.globalCompositeOperation = 'source-over';
      const slowSide = c.createLinearGradient(x, y, markerX, y + h);
      slowSide.addColorStop(0, '#e4ad50'); slowSide.addColorStop(.3, '#c86429'); slowSide.addColorStop(.68, '#e18c37'); slowSide.addColorStop(1, '#8e3b1c');
      c.fillStyle = slowSide; c.fillRect(x, y, markerX - x, h);
      c.globalCompositeOperation = 'source-over';
    } else {
      const fastSide = c.createLinearGradient(x, y, x + w, y + h);
      fastSide.addColorStop(0, '#e9cf79'); fastSide.addColorStop(.35, '#d8b84e'); fastSide.addColorStop(.72, '#efd277'); fastSide.addColorStop(1, '#9e7625');
      c.fillStyle = fastSide; c.fillRect(x, y, w, h);
      const slowSide = c.createLinearGradient(x, y, markerX, y + h);
      slowSide.addColorStop(0, '#e4ad50'); slowSide.addColorStop(.3, '#c86429'); slowSide.addColorStop(.68, '#e18c37'); slowSide.addColorStop(1, '#8e3b1c');
      c.fillStyle = slowSide; c.fillRect(x, y, markerX - x, h);
    }
    c.save(); c.beginPath(); c.rect(markerX, y, x + w - markerX, h); c.clip();
    c.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 15; i++) {
      c.fillStyle = i % 3 ? 'rgba(236,210,155,.13)' : 'rgba(66,25,0,.18)';
      c.beginPath(); c.ellipse(x + ((i * 29) % 67), y + ((i * 19) % 47), 3.2, 1.35, -.45, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.restore();
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
    const recessX = mirrored ? x + 19 : x + 13;
    const recessW = mirrored ? w - 28 : w - 17;
    roundedRect(c, recessX, y + 6, recessW, h - 12, (h - 12) / 2).fill();
    roundedRect(c, recessX, y + 6, recessW, h - 12, (h - 12) / 2).stroke();
    c.strokeStyle = '#2d86a7'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + 17, y + 5); c.lineTo(x + w - 25, y + 5); c.stroke();
    c.strokeStyle = '#a38a6b'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x + 19, y + h - 5); c.lineTo(x + w - 22, y + h - 5); c.stroke();
    c.restore();
  }
  function drawFramePaperTexture(c, x, y, w, h, sourceY, mirrorY = false, sourceX = x, sourceW = w, sourceH = h) {
    c.fillStyle = '#f4f3ef'; c.fillRect(x, y, w, h);
    if (layerImages.frame) {
      const frameTrim = { x: 30, y: 30, w: 600, h: 840 };
      const frameScaleX = layerImages.frame.naturalWidth / frameTrim.w;
      const frameScaleY = layerImages.frame.naturalHeight / frameTrim.h;
      c.save();
      if (mirrorY) {
        c.translate(0, y * 2 + h);
        c.scale(1, -1);
      }
      c.drawImage(
        layerImages.frame,
        (sourceX - frameTrim.x) * frameScaleX, (sourceY - frameTrim.y) * frameScaleY,
        sourceW * frameScaleX, sourceH * frameScaleY,
        x, y, w, h
      );
      c.restore();
    } else if (layerImages.statTextureWhite) {
      c.drawImage(layerImages.statTextureWhite, x, y, w, h);
    }
  }
  function clearLegacyStatFooter(c, x, y, w, h) {
    c.save();
    // Continue the exact paper used by the main rules box into the rebuilt
    // footer. Read from the pristine frame asset (not the live canvas, which
    // already contains flavor text) so the artist strip shares its grain,
    // brightness, and export scaling with the area directly above it.
    const paperH = h - 7;
    const footerCornerBevel = 24;
    c.save();
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + paperH - footerCornerBevel);
    c.lineTo(x + w - footerCornerBevel, y + paperH);
    c.lineTo(x + footerCornerBevel, y + paperH);
    c.lineTo(x, y + paperH - footerCornerBevel);
    c.closePath();
    c.clip();
    drawFramePaperTexture(c, x, y, w, paperH, y - paperH, true);
    c.restore();
    const railY = y + h - 7;
    const rail = c.createLinearGradient(0, railY, 0, y + h);
    rail.addColorStop(0, '#02070b'); rail.addColorStop(.3, '#0c4a69'); rail.addColorStop(.65, '#021724'); rail.addColorStop(1, '#000407');
    c.fillStyle = rail; c.fillRect(x, railY, w, 7);
    c.strokeStyle = '#020508'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, railY); c.lineTo(x + w, railY); c.stroke();
    c.strokeStyle = 'rgba(40, 124, 158, .7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, railY + 2.5); c.lineTo(x + w, railY + 2.5); c.stroke();
    c.restore();
  }
  function drawTapIcon(c, centerX, centerY) {
    c.save(); c.translate(centerX - 10.5, centerY - 10.5); c.scale(.21, .21);
    c.fillStyle = '#231f20'; c.beginPath(); c.arc(50, 50, 49, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(50, 50, 49, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#fff';
    c.translate(0, 6);
    c.fill(new Path2D('M37 86 51 72C22 52 18 31 38 20c11-6 24-2 32 9l6-8 4 33H46l13-10c-6-5-12-6-17-1-8 8-3 20 9 29Z'));
    c.restore();
    c.restore();
  }
  function drawResourceIcon(c, value, centerX, centerY) {
    c.save();
    c.fillStyle = '#f8f8f6';
    c.strokeStyle = '#050505';
    c.lineWidth = 2.2;
    c.beginPath(); c.arc(centerX, centerY, 11.5, 0, Math.PI * 2); c.fill(); c.stroke();
    strokeEmbossedEllipse(c, centerX, centerY, 11.5, 11.5, 1.5);
    c.fillStyle = '#050505';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${String(value).length > 1 ? 12.075 : 14.7}px "Arial Black", Arial`;
    fillTextOpticallyCentered(c, String(value), centerX, centerY + .5);
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

  function parseMarkdownSegments(text, base = {}) {
    const source = String(text || '');
    const segments = [];
    const pattern = /(\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|\*[\s\S]+?\*|_[\s\S]+?_)/g;
    let cursor = 0;
    const push = (value, changes = {}) => { if (value) segments.push({ ...base, ...changes, text: value }); };
    for (const match of source.matchAll(pattern)) {
      push(source.slice(cursor, match.index));
      const token = match[0];
      if ((token.startsWith('***') && token.endsWith('***')) || (token.startsWith('___') && token.endsWith('___'))) {
        push(token.slice(3, -3), { style: 'italic', weight: Math.max(700, base.weight || 400) });
      } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
        push(token.slice(2, -2), { weight: Math.max(700, base.weight || 400) });
      } else if (token.startsWith('~~') && token.endsWith('~~')) {
        push(token.slice(2, -2), { strike: true });
      } else {
        push(token.slice(1, -1), { style: 'italic' });
      }
      cursor = match.index + token.length;
    }
    push(source.slice(cursor));
    return segments;
  }

  function drawStyledSegments(c, segments, x, y, maxWidth, lineHeight, maxLines, draw = true) {
    let cursorX = x, cursorY = y, lines = 1;
    for (const segment of segments) {
      // Rules text supports compact inline game symbols: {T}/{t} for Tap and
      // {0} through {20} for resource costs. Keep each symbol atomic while
      // wrapping so it behaves like a single printed glyph.
      const words = String(segment.text || '').split(/(\{(?:[tT]|[0-9]|1[0-9]|20)\}|:|\n|[ \t\r]+)/).filter(Boolean);
      for (const word of words) {
        if (word === '\n') {
          lines += 1;
          if (lines > maxLines) return { cursorY, lines: maxLines };
          cursorX = x; cursorY += lineHeight;
          continue;
        }
        const tapToken = /^\{[tT]\}$/.test(word);
        const resourceToken = /^\{(?:[0-9]|1[0-9]|20)\}$/.test(word);
        const colonToken = word === ':';
        const fontWeight = colonToken ? 640 : (segment.weight || 400);
        c.font = `${segment.style || 'normal'} ${fontWeight} ${segment.size || 18}px Arial, sans-serif`;
        const width = resourceToken ? 26.5 : tapToken ? 23 : c.measureText(word).width;
        if (!/^\s+$/.test(word) && cursorX + width > x + maxWidth && cursorX > x) {
          lines += 1;
          if (lines > maxLines) return cursorY;
          cursorX = x; cursorY += lineHeight;
        }
        if (cursorX === x && /^\s+$/.test(word)) continue;
        if (draw) {
          if (tapToken) drawTapIcon(c, cursorX + 10.5, cursorY - 7.5);
          else if (resourceToken) drawResourceIcon(c, word.slice(1, -1), cursorX + 12.25, cursorY - 7.5);
          else {
            c.fillText(word, cursorX, cursorY);
            if (segment.strike && !/^\s+$/.test(word)) {
              c.save(); c.strokeStyle = c.fillStyle; c.lineWidth = Math.max(1, (segment.size || 18) / 16);
              c.beginPath(); c.moveTo(cursorX, cursorY - (segment.size || 18) * .32); c.lineTo(cursorX + width, cursorY - (segment.size || 18) * .32); c.stroke(); c.restore();
            }
          }
        }
        cursorX += width;
      }
    }
    return { cursorY, lines };
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

    const metadataHidden = !card.showTags && !card.showTypes;
    const singleMetadataRow = card.showTags !== card.showTypes;
    const typesOnly = !card.showTags && card.showTypes;
    const artTopSource = metadataHidden ? 155 : singleMetadataRow ? 219 : 284;
    const artBottomSource = 1010;
    const hasAssetCosts = ['L', 'P', 'S', 'T', 'U'].some(key => card[`asset${key}`] !== '');
    const artLeftSource = hasAssetCosts ? 78 : 42;
    const artRightSource = 978;
    const art = {
      x: mx(artLeftSource),
      y: my(artTopSource),
      w: mx(artRightSource) - mx(artLeftSource),
      h: my(artBottomSource) - my(artTopSource)
    };
    let artPlacement = null;
    c.save(); c.beginPath(); c.rect(art.x, art.y, art.w, art.h); c.clip();
    if (artImage) {
      const cover = Math.max(art.w / artImage.width, art.h / artImage.height) * (card.artScale / 100);
      const dw = artImage.width * cover, dh = artImage.height * cover;
      artPlacement = { x: art.x + (art.w - dw) / 2 + card.artX * 1.8, y: art.y + (art.h - dh) / 2 + card.artY * 1.5, w: dw, h: dh };
      c.drawImage(artImage, artPlacement.x, artPlacement.y, artPlacement.w, artPlacement.h);
    } else {
      const g = c.createLinearGradient(art.x, art.y, art.x + art.w, art.y + art.h); g.addColorStop(0, t.mid); g.addColorStop(.6, '#101820'); g.addColorStop(1, t.dark); c.fillStyle = g; c.fillRect(art.x, art.y, art.w, art.h);
      c.strokeStyle = t.edge + '88'; c.lineWidth = 2;
      for (let x = -100; x < 800; x += 44) { c.beginPath(); c.moveTo(x, art.y); c.lineTo(x + 270, art.y + art.h); c.stroke(); }
      c.fillStyle = '#dcecf3a8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 18px Arial'; c.fillText('UPLOAD UNIT ARTWORK', W / 2, 382); c.font = '500 11px Arial'; c.fillText('ART TAB  •  PNG / JPEG / WEBP', W / 2, 407);
    }
    c.restore();

    const drawHeaderIdentity = () => {
      c.textBaseline = 'middle'; c.textAlign = 'center';
      if (card.construction !== '-') {
        if (layerImages.construction) c.drawImage(layerImages.construction, 72, 68, 44, 44);
        else { c.fillStyle = '#f8f8f6'; c.strokeStyle = '#050505'; c.lineWidth = 4; c.beginPath(); c.arc(94, 90, 20, 0, Math.PI * 2); c.fill(); c.stroke(); }
        strokeEmbossedEllipse(c, 94, 90, 20, 20, 3.1);
        c.fillStyle = '#050505'; c.font = '900 31px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.construction, 94, 92);
      }
      if (card.operation !== '-') {
        if (layerImages.operation) c.drawImage(layerImages.operation, 121, 72, 37, 37);
        else { c.fillStyle = '#050505'; c.beginPath(); c.arc(139.5, 90.5, 18.5, 0, Math.PI * 2); c.fill(); }
        strokeEmbossedEllipse(c, 139.5, 90.5, 18, 18, 2.7);
        c.fillStyle = '#fff'; c.font = '900 28px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.operation, 139.5, 90.5);
      }

      const title = card.uppercaseTitle ? card.name.toUpperCase() : card.name;
      const titleSize = fitText(c, title, 350, 46 * card.titleSize / 100, 22, 900);
      c.fillStyle = '#040404'; c.font = `900 ${titleSize}px "Arial Black", "Arial Narrow", Arial`; c.shadowColor = '#8d8d8d'; c.shadowOffsetY = 1; fillTextGlyphCentered(c, title, 347, 101.5); c.shadowColor = 'transparent'; c.shadowOffsetY = 0;
      if (card.cycle !== '' && card.cycle !== '-') {
        drawCycleControl(c, 565.5, 89.5);
        c.fillStyle = '#050505'; c.font = '900 27px "Arial Black", Arial'; fillTextOpticallyCentered(c, card.cycle, 565.5, 89.5);
      }
    };
    drawHeaderIdentity();

    const assets = [['L','#0b5fae'],['P','#9c4dcc'],['S','#8a6500'],['T','#8b1e2d'],['U','#117d45']].filter(([key]) => card[`asset${key}`] !== '');
    // The Asset rail and header boxes share one edge so the white header reads
    // as a single continuous card component.
    const assetRailLeft = 60;
    const assetRailRight = assetRailLeft + (205 - assetRailLeft) * .75;
    const assetRailEdgeTopSource = 148;
    const assetRailTopSource = assetRailEdgeTopSource - 2 / (840 / 1490);
    const assetGap = 10;
    const assetRailTop = my(155);
    const assetStackHeight = assets.length * 29 + Math.max(0, assets.length - 1) * assetGap;
    const assetStartY = assetRailTop + 5;
    const assetLastPillBottom = assetStartY + assetStackHeight;
    const assetRailBottom = assetLastPillBottom + 10;
    // Keep the Asset rail flush with the name panel instead of widening it
    // into the card frame. The existing pill bounds are centered between this
    // edge and assetRailRight.
    const assetRailPaperLeft = mx(assetRailLeft);
    const blackBoxStrokeInset = 2 / (600 / 1056);
    const firstRowLeft = assets.length ? assetRailRight + blackBoxStrokeInset : 60;
    const secondRowLeft = assets.length > 1 ? assetRailRight + blackBoxStrokeInset : 60;

    // Rebuild the complete variable header on a textured paper base. Each
    // metadata row can then be removed together with its black container.
    // Sample only the clean interior paper. Including the text-box sidewall in
    // this crop visually doubles the left card frame inside the header.
    // When both metadata rows are removed, the enlarged artwork occupies this
    // space. Do not lay the placeholder paper back over it.
    if (!metadataHidden) {
      const metadataPaperHeight = singleMetadataRow ? 64 : 126;
      drawFramePaperTexture(c, mx(60), my(155), mw(930), mh(metadataPaperHeight), 620, false, 90, 480);
    }
    if (assets.length) {
      // Paint the entire name/cost band and Asset rail through one clipped
      // texture pass so they read as a single continuous paper component. The
      // paper reaches behind the frame's small black notches, while the pills
      // retain their established horizontal position.
      const headerPanelLeft = mx(60);
      const headerPanelRight = mx(990);
      const headerPanelTop = my(60);
      const headerPanelBottom = my(assetRailEdgeTopSource);
      const headerCornerBevel = 14;
      c.beginPath();
      c.moveTo(headerPanelLeft + headerCornerBevel, headerPanelTop);
      c.lineTo(headerPanelRight - headerCornerBevel, headerPanelTop);
      c.lineTo(headerPanelRight, headerPanelTop + headerCornerBevel);
      c.lineTo(headerPanelRight, headerPanelBottom);
      c.lineTo(headerPanelLeft, headerPanelBottom);
      c.lineTo(headerPanelLeft, headerPanelTop + headerCornerBevel);
      c.closePath();
      c.moveTo(assetRailPaperLeft, my(assetRailTopSource)); c.lineTo(mx(assetRailRight), my(assetRailTopSource)); c.lineTo(mx(assetRailRight), assetLastPillBottom);
      c.lineTo(mx(assetRailRight) - 8, assetRailBottom); c.lineTo(assetRailPaperLeft, assetRailBottom); c.closePath();
      c.save(); c.clip();
      // Limit the source to clean text-box paper. A five-pill rail is taller
      // than that clean source band; sampling an equally tall region reaches
      // the dark footer frame and creates black patches between lower pills.
      drawFramePaperTexture(c, assetRailPaperLeft, my(60), mx(990) - assetRailPaperLeft, assetRailBottom - my(60), 620, false, 90, 480, 140);
      c.restore();
      c.strokeStyle = '#050505';
      // Keep the rail open at the top. The two vertical edges are half the
      // weight of the beveled lower edge so the white panel reads less boxed-in.
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(mx(assetRailRight), assetRailTop); c.lineTo(mx(assetRailRight), assetLastPillBottom); c.stroke();
      c.beginPath(); c.moveTo(assetRailPaperLeft, my(assetRailEdgeTopSource)); c.lineTo(assetRailPaperLeft, assetRailBottom); c.stroke();
      // Continue the left card frame beneath the end cap as a shallow support
      // shelf, matching the framed ledge beneath the metadata boxes.
      const supportLeft = 44;
      const supportRight = mx(assetRailRight) - 8;
      const supportTop = assetRailBottom;
      const supportHeight = 7;
      const supportFill = c.createLinearGradient(0, supportTop, 0, supportTop + supportHeight);
      supportFill.addColorStop(0, '#0b4f6d');
      supportFill.addColorStop(.48, '#031824');
      supportFill.addColorStop(1, '#01070b');
      c.fillStyle = supportFill;
      c.strokeStyle = '#020508';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(supportLeft, supportTop);
      c.lineTo(supportRight, supportTop);
      c.lineTo(supportRight - 7, supportTop + supportHeight);
      c.lineTo(supportLeft + 8, supportTop + supportHeight);
      c.lineTo(supportLeft, supportTop + 3);
      c.closePath();
      c.fill(); c.stroke();
      c.strokeStyle = '#a58d6c';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(supportLeft + 11, supportTop + 2.5); c.lineTo(supportRight - 7, supportTop + 2.5); c.stroke();
      c.strokeStyle = '#050505';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(mx(assetRailRight), assetLastPillBottom); c.lineTo(mx(assetRailRight) - 8, assetRailBottom); c.lineTo(assetRailPaperLeft, assetRailBottom); c.stroke();
      // The unified paper pass covers these foreground elements, so restore
      // them after the surface is complete.
      drawHeaderIdentity();
    }
    c.fillStyle = '#020202'; c.strokeStyle = '#050505'; c.lineWidth = 4;
    if (card.showTags) {
      c.fillRect(mx(firstRowLeft), my(155), mw(990 - firstRowLeft), mh(64));
      c.strokeRect(mx(firstRowLeft), my(155), mw(990 - firstRowLeft), mh(64));
    }
    if (card.showTypes) {
      const typesRowLeft = typesOnly ? firstRowLeft : secondRowLeft;
      const typesRowTop = typesOnly ? 155 : 219;
      c.fillRect(mx(typesRowLeft), my(typesRowTop), mw(990 - typesRowLeft), mh(62));
      c.strokeRect(mx(typesRowLeft), my(typesRowTop), mw(990 - typesRowLeft), mh(62));
      c.strokeStyle = '#eeeeec'; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(mx(typesRowLeft + 18), my(typesRowTop)); c.lineTo(mx(974), my(typesRowTop)); c.stroke();
    }

    if (card.showTags || card.showTypes) {
      const lastMetadataBottomSource = card.showTypes ? (typesOnly ? 217 : 281) : 219;
      const supportTop = my(lastMetadataBottomSource);
      const supportLeft = mx(900);
      const supportRight = 616;
      const supportHeight = 7;
      const supportFill = c.createLinearGradient(0, supportTop, 0, supportTop + supportHeight);
      supportFill.addColorStop(0, '#0b4f6d');
      supportFill.addColorStop(.48, '#031824');
      supportFill.addColorStop(1, '#01070b');
      c.fillStyle = supportFill;
      c.strokeStyle = '#020508';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(supportRight, supportTop);
      c.lineTo(supportLeft, supportTop);
      c.lineTo(supportLeft + 7, supportTop + supportHeight);
      c.lineTo(supportRight - 8, supportTop + supportHeight);
      c.lineTo(supportRight, supportTop + 3);
      c.closePath();
      c.fill(); c.stroke();
      c.strokeStyle = '#a58d6c';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(supportLeft + 7, supportTop + 2.5); c.lineTo(supportRight - 11, supportTop + 2.5); c.stroke();
    }

    if (assets.length && (card.showTags || card.showTypes)) {
      // The source frame's left metadata shelf can cross the Assets rail at a
      // pill boundary. Repaint only the rail portion above that shelf; pills
      // are drawn afterward, so their rims remain completely intact.
      const lastMetadataBottomSource = card.showTypes ? (typesOnly ? 217 : 281) : 219;
      const maskY = my(lastMetadataBottomSource) - 2;
      const maskHeight = 11;
      const railRight = mx(assetRailRight);
      drawFramePaperTexture(c, assetRailPaperLeft, maskY, railRight - assetRailPaperLeft, maskHeight, 650, false, 90, 100, maskHeight);
      c.strokeStyle = '#050505';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(assetRailPaperLeft, maskY); c.lineTo(assetRailPaperLeft, maskY + maskHeight); c.stroke();
      c.beginPath(); c.moveTo(railRight, maskY); c.lineTo(railRight, maskY + maskHeight); c.stroke();
    }

    const firstRowCenter = mx((firstRowLeft + 990) / 2);
    const secondRowCenter = mx((secondRowLeft + 990) / 2);
    const firstRowWidth = mw(990 - firstRowLeft - 24);
    const secondRowWidth = mw(990 - secondRowLeft - 24);

    if (card.showTags) {
      const loadoutSize = fitText(c, card.loadout, firstRowWidth, 23, 16, 500);
      c.fillStyle = '#f4f4f4'; c.font = `500 ${loadoutSize}px Arial`; fillTextOpticallyCentered(c, card.loadout, firstRowCenter, my(187));
    }
    if (card.showTypes) {
      const traitLine = card.rarity === 'None' ? card.traits : `${card.rarity} • ${card.traits}`;
      const typesRowCenter = typesOnly ? firstRowCenter : secondRowCenter;
      const typesRowWidth = typesOnly ? firstRowWidth : secondRowWidth;
      const typesTextY = typesOnly ? 187 : 250;
      const traitSize = fitText(c, traitLine, typesRowWidth, 23, 15, 500);
      c.fillStyle = '#f4f4f4'; c.font = `500 ${traitSize}px Arial`; fillTextOpticallyCentered(c, traitLine, typesRowCenter, my(typesTextY));
    }

    const assetPillOpticalX = 0;
    const assetPillLeft = mx(assetRailLeft) + 5 + assetPillOpticalX;
    const assetPillRight = mx(assetRailRight) - 5 + assetPillOpticalX;
    const assetPillWidth = assetPillRight - assetPillLeft;
    const assetPillSplit = assetPillLeft + assetPillWidth / 2;
    const assetValueCenter = (assetPillLeft + assetPillSplit) / 2;
    const assetLetterCenter = (assetPillSplit + assetPillRight) / 2;
    assets.forEach(([key, color], i) => {
      const y = assetStartY + i * (29 + assetGap);
      const assetFill = c.createLinearGradient(assetPillLeft, y, assetPillRight, y + 29);
      assetFill.addColorStop(0, '#e9e5d9'); assetFill.addColorStop(.42, '#d2d3cd'); assetFill.addColorStop(.72, '#e2dfd3'); assetFill.addColorStop(1, '#aeb3ae');
      c.fillStyle = assetFill; roundedRect(c, assetPillLeft, y, assetPillWidth, 29, 14).fill();
      strokeEmbossedRoundedRect(c, assetPillLeft, y, assetPillWidth, 29, 14, 2.5);
      // Clip the color field to the complete pill silhouette so it seats directly
      // against the right and bottom inner edges instead of leaving a pale gap.
      c.save();
      roundedRect(c, assetPillLeft, y, assetPillWidth, 29, 14).clip();
      const colorTexture = c.createLinearGradient(assetPillSplit, y, assetPillRight, y + 29);
      colorTexture.addColorStop(0, '#b8ad94'); colorTexture.addColorStop(.12, color); colorTexture.addColorStop(.68, color); colorTexture.addColorStop(1, '#16191a');
      c.fillStyle = colorTexture; c.fillRect(assetPillSplit, y, assetPillRight - assetPillSplit, 29);
      c.restore();
      // Redraw the outside edge over the clipped fill for a clean, continuous rim.
      strokeEmbossedRoundedRect(c, assetPillLeft, y, assetPillWidth, 29, 14, 2.5);
      c.fillStyle = '#050505'; c.font = '900 25px "Arial Black", Arial'; fillTextGlyphCentered(c, card[`asset${key}`], assetValueCenter + 2, y + 21.5);
      c.fillStyle = '#fff'; c.font = '900 22px "Arial Black", Arial'; fillTextGlyphCentered(c, key, assetLetterCenter, y + 20.5);
    });

    // The bundled sample artwork also contains the legacy four-bolt strip.
    // Continue a clean rectangular band of the already-rendered artwork from
    // immediately above it, rather than restoring those baked-in sockets or
    // leaving a floating trapezoidal patch. Scale the backing-store sample so
    // preview and high-DPI exports remain identical.
    const rarityArtPatch = document.createElement('canvas'); rarityArtPatch.width = 142; rarityArtPatch.height = 25;
    rarityArtPatch.getContext('2d').drawImage(c.canvas, 450 * scale, 550 * scale, 142 * scale, 25 * scale, 0, 0, 142, 25);
    c.drawImage(rarityArtPatch, 450, 575, 142, 25);

    const rarityCount = { None: 0, Unique: 1, Rare: 2, Uncommon: 3, Common: 4 }[card.rarity] ?? 4;
    const boltHousingRight = 592;
    if (rarityCount > 0) {
      const boltHousingWidth = rarityCount * 22 + 2;
      const boltHousingLeft = boltHousingRight - boltHousingWidth;
      const boltHousingFill = c.createLinearGradient(0, 582, 0, 601);
      boltHousingFill.addColorStop(0, '#596369'); boltHousingFill.addColorStop(.16, '#1b2d36'); boltHousingFill.addColorStop(.42, '#05080a'); boltHousingFill.addColorStop(1, '#102f3e');
      c.fillStyle = boltHousingFill; c.strokeStyle = '#020406'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(boltHousingLeft + 5, 582); c.lineTo(boltHousingRight, 582); c.lineTo(boltHousingRight, 601); c.lineTo(boltHousingLeft, 601); c.closePath(); c.fill(); c.stroke();
      // The bright leading bevel makes the moving left sidewall readable as
      // bolt counts change, while the housing stays inside the frame mount.
      c.strokeStyle = '#748086'; c.lineWidth = 1.25;
      c.beginPath(); c.moveTo(boltHousingLeft + 5, 583); c.lineTo(boltHousingLeft + 1, 599); c.stroke();
      c.strokeStyle = 'rgba(73, 154, 184, .7)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(boltHousingLeft + 6, 584); c.lineTo(boltHousingRight, 584); c.stroke();
      for (let i = 0; i < rarityCount; i++) {
        // Keep the bolt row seated against the right side while the housing
        // contracts only from its left edge; the frame-side edge never moves.
        const boltCenterX = boltHousingRight - 12 - (rarityCount - 1 - i) * 22;
        if (layerImages.bolt) c.drawImage(layerImages.bolt, boltCenterX - 8, 584, 16, 16);
        else { c.fillStyle = '#cfd2d4'; c.beginPath(); c.arc(boltCenterX, 592, 7, 0, Math.PI * 2); c.fill(); }
      }
    }
    // Rebuild the uninterrupted frame rail last so neither the mount nor the
    // bolt housing can overlap it.
    const rarityRail = c.createLinearGradient(0, 600, 0, 610);
    rarityRail.addColorStop(0, '#02070b'); rarityRail.addColorStop(.28, '#0c4a69'); rarityRail.addColorStop(.6, '#021724'); rarityRail.addColorStop(1, '#000407');
    c.fillStyle = rarityRail; c.fillRect(457, 600, 135, 10);
    c.strokeStyle = '#020508'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(457, 600); c.lineTo(592, 600); c.moveTo(457, 610); c.lineTo(592, 610); c.stroke();
    c.strokeStyle = 'rgba(40, 124, 158, .72)'; c.lineWidth = 1; c.beginPath(); c.moveTo(458, 603); c.lineTo(591, 603); c.stroke();

    c.fillStyle = '#080808'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const ruleParts = String(card.rules || '').split(/\s+[—–-]\s+/, 2);
    const ruleSegments = ruleParts.length > 1
      ? [
          ...parseMarkdownSegments(`${ruleParts[0]} `, { weight: 800, size: 20.5 }),
          ...parseMarkdownSegments(`(${ruleParts[1]})`, { style: 'italic', weight: 400, size: 21.5 })
        ]
      : parseMarkdownSegments(card.rules, { weight: 700, size: 20.5 });
    drawStyledSegments(c, ruleSegments, 85, 653, 486, 24, 4);
    if (card.flavor) {
      const flavorSegments = parseMarkdownSegments(card.flavor, { style: 'italic', weight: 400, size: 21 });
      const flavorLayout = drawStyledSegments(c, flavorSegments, 85, 0, 466, 23, 3, false);
      const flavorY = 764 - Math.max(0, flavorLayout.lines - 1) * 23;
      drawStyledSegments(c, flavorSegments, 85, flavorY, 466, 23, 3);
    }

    const hasSpeed = card.speed !== '-', hasAttack = card.attack !== '-';
    const hasArmor = card.armor !== '-', hasStructure = card.structure !== '-';
    const statCenterY = 808;
    const pairedLeftX = 73;
    const speedCenterX = 113.5, attackCenterX = 181.5;
    const armorCenterX = 494.5, structureCenterX = 555.5;
    const compactLeftX = 70.5, compactRightX = 500, compactHousingWidth = 88;
    // Both mirrored compact housings use the same true 44px midpoint.
    const liveAttackCenterX = !hasSpeed && hasAttack ? compactLeftX + 44 : attackCenterX;
    const liveStructureCenterX = !hasArmor && hasStructure ? compactRightX + 44 : structureCenterX;
    const restoreFrameRegion = (x, y, w, h) => {
      if (!layerImages.frame) return;
      const frameScaleX = layerImages.frame.naturalWidth / trim.w;
      const frameScaleY = layerImages.frame.naturalHeight / trim.h;
      c.drawImage(
        layerImages.frame,
        (x - trim.x) * frameScaleX, (y - trim.y) * frameScaleY,
        w * frameScaleX, h * frameScaleY,
        x, y, w, h
      );
    };

    // The source frame contains paired grey pods. When either pair becomes
    // compact, rebuild the complete footer in one pass so neither an unused
    // oval nor hard-edged cleanup rectangles remain behind the live housings.
    if (!(hasSpeed && hasAttack && hasArmor && hasStructure)) {
      clearLegacyStatFooter(c, 58, 776, 534, 64);
      // The compact housings have transparent lower corners. Put the original
      // frame rail beneath them before they are drawn, so those cutouts reveal
      // the blue/gold card frame rather than the rebuilt white footer paper.
      restoreFrameRegion(30, 832, 600, 8);
    }

    // Swap the paired housings for compact single-stat assets when one side is
    // removed. Attack-only remains anchored to the original housing's right
    // edge; Structure-only remains anchored to the card's right frame.
    if (hasSpeed && hasAttack) {
      if (layerImages.leftStatHousing) c.drawImage(layerImages.leftStatHousing, pairedLeftX, 776, 149, 64);
      else drawStatHousing(c, pairedLeftX, 776, 149, 64, false);
    } else if (hasSpeed || hasAttack) {
      if (layerImages.attackOnlyHousing) c.drawImage(layerImages.attackOnlyHousing, compactLeftX, 776, compactHousingWidth, 64);
      else drawStatHousing(c, compactLeftX, 776, compactHousingWidth, 64, false);
    }
    const rightHousing = { x: 462, y: 779, w: 130, h: 58 };
    if (hasArmor && hasStructure) {
      if (layerImages.rightStatHousing) c.drawImage(layerImages.rightStatHousing, rightHousing.x, rightHousing.y, rightHousing.w, rightHousing.h);
      else drawStatHousing(c, rightHousing.x, rightHousing.y, rightHousing.w, rightHousing.h, true);
      drawImageTextureRoundedRect(c, layerImages.statTexturePalette, { x: 937, y: 423, w: 909, h: 423 }, 468, 784, 116, 48, 24, .96);
    } else if (hasArmor || hasStructure) {
      const singleRightX = hasStructure ? compactRightX : 458;
      const singleRightWidth = hasStructure ? compactHousingWidth : 73;
      const singleRightY = hasStructure ? 776 : 779;
      const singleRightHeight = hasStructure ? 64 : 58;
      if (layerImages.structureOnlyHousing) c.drawImage(layerImages.structureOnlyHousing, singleRightX, singleRightY, singleRightWidth, singleRightHeight);
      else drawStatHousing(c, singleRightX, singleRightY, singleRightWidth, singleRightHeight, true);
      if (hasStructure) drawImageTextureRoundedRect(c, layerImages.statTexturePalette, { x: 937, y: 423, w: 909, h: 423 }, liveStructureCenterX - 29.5, 784, 59, 48, 24, .96);
    }

    if (hasSpeed) drawSpeedGauge(c, card.speed, speedCenterX - 32.5, statCenterY - 24.5, 65, 49);
    if (hasAttack) {
      fillTexturedEllipse(c, liveAttackCenterX, statCenterY, 32.5, 24.5, ['#cf4a4d', '#b70b15', '#7e090e', '#c82a2f', '#52080b'], 7);
      drawImageTextureEllipse(c, layerImages.statTexturePalette, { x: 517, y: 0, w: 816, h: 406 }, liveAttackCenterX, statCenterY, 32.5, 24.5);
      strokeEmbossedEllipse(c, liveAttackCenterX, statCenterY, 32.5, 24.5, 3.2);
    }
    if (hasArmor) {
      fillTexturedEllipse(c, armorCenterX, statCenterY, 24.5, 24.5, ['#deddd4', '#b4bbb9', '#737b7c', '#c9cbc4', '#686f70'], 13);
      drawImageTextureEllipse(c, layerImages.statTextureWhite, { x: 0, y: 0, w: 176, h: 81 }, armorCenterX, statCenterY, 24.5, 24.5);
      c.save(); c.beginPath(); c.ellipse(armorCenterX, statCenterY, 24.5, 24.5, 0, 0, Math.PI * 2); c.clip();
      c.fillStyle = 'rgba(91, 98, 98, .18)'; c.fillRect(armorCenterX - 24.5, statCenterY - 24.5, 49, 49); c.restore();
      strokeEmbossedEllipse(c, armorCenterX, statCenterY, 24.5, 24.5, 3.1);
    }
    c.textAlign = 'center';
    if (hasSpeed) { c.fillStyle = '#050505'; c.font = `900 ${card.speed.length > 1 ? 29 : 35}px "Arial Black", Arial`; fillTextGlyphCentered(c, card.speed, speedCenterX, statCenterY); }
    if (hasAttack) { c.fillStyle = '#fff'; c.font = '900 37px "Arial Black", Arial'; fillTextGlyphCentered(c, card.attack, liveAttackCenterX, statCenterY); }
    if (hasArmor) { c.fillStyle = '#050505'; c.font = '900 37px "Arial Black", Arial'; fillTextGlyphCentered(c, card.armor, armorCenterX, statCenterY); }
    if (hasStructure) { c.fillStyle = '#fff'; c.font = '900 37px "Arial Black", Arial'; fillTextGlyphCentered(c, card.structure, liveStructureCenterX, statCenterY); }
    c.fillStyle = '#050505'; c.font = '600 16px "Arial Narrow", Arial'; fillTextOpticallyCentered(c, card.artist ? `Illus. ${card.artist}` : 'Artist credit', 330, 806);
    c.font = '500 11.5px Arial'; fillTextOpticallyCentered(c, card.copyright || `${card.setCode} • ${card.collector}`, 330, 821);

    if (!(hasSpeed && hasAttack && hasArmor && hasStructure) && layerImages.frame) {
      // Compact stat housings sit beneath the card's structural shell. Restore
      // the outer sidewalls and bottom rail last so the frame remains complete
      // instead of looking cropped where a replacement housing meets it.
      // Restore all the way to each compact housing. The source frame supplies
      // the true sidewall geometry, so no paper wedge or synthetic connector
      // can sit above or crop the card frame.
      restoreFrameRegion(30, 760, 41, 110);
      // Meet the footer at the frame's true inner edge. The earlier 579px
      // restore started 10px too far inward and left the right side stepped
      // away from the surrounding frame.
      const rightFrameRestoreX = !hasArmor && !hasStructure ? 589 : 588;
      restoreFrameRegion(rightFrameRestoreX, 760, 630 - rightFrameRestoreX, 110);
      restoreFrameRegion(30, 840, 600, 30);
    }

    if (guides) {
      c.save(); c.setLineDash([8, 7]); c.strokeStyle = '#ff3f6dcc'; c.lineWidth = 2; c.strokeRect(30, 30, 600, 840); c.setLineDash([]); c.fillStyle = '#ff3f6d'; c.font = '700 10px Arial'; c.textAlign = 'left'; c.fillText('TRIM', 35, 43); c.restore();
    }
    c.restore();
  }

  function syncMobilePreview() {
    mobileCtx.clearRect(0, 0, W, H);
    mobileCtx.drawImage(canvas, 0, 0, W, H);
  }

  function setStickyPreview(enabled) {
    document.body.classList.toggle('mobile-preview-enabled', enabled);
    document.querySelector('#mobilePreviewDock').setAttribute('aria-hidden', String(!enabled));
    localStorage.setItem('mechtitan-sticky-preview', enabled ? '1' : '0');
    if (enabled) syncMobilePreview();
  }

  function render() {
    drawCard(ctx, getFormData(), 1, document.querySelector('#showBleed').checked);
    syncMobilePreview();
  }

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
  stickyPreview.addEventListener('change', () => setStickyPreview(stickyPreview.checked));
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
  document.querySelector('#clearCardBtn').addEventListener('click', clearCurrentCard);
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

  stickyPreview.checked = localStorage.getItem('mechtitan-sticky-preview') === '1';
  setStickyPreview(stickyPreview.checked);
  preloadLayers();
  const initial = loadStore(); setFormData(initial); updateUndoButtons(); registerWebMcp();
})();

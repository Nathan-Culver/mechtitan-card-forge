(() => {
  'use strict';

  const forge = window.MechTitanForge;
  if (!forge) return;

  const PROJECT_KEY = 'mechtitan-projects-v1';
  const PRESET_KEY = 'mechtitan-presets-v1';
  const REVISION_KEY = 'mechtitan-revisions-v1';
  const HORIZONTAL = new Set(['horizontal', 'horizontal-tall-text', 'split-combine']);
  const TWO_SIDED = new Set(['split-combine', 'flip', 'double-faced', 'composite-left', 'composite-right']);
  const horizontalFrame = new Image();
  horizontalFrame.onload = () => forge.render();
  horizontalFrame.src = 'assets/horizontal-frame-v2.png';
  const horizontalTallFrame = new Image();
  horizontalTallFrame.onload = () => forge.render();
  horizontalTallFrame.src = 'assets/horizontal-tall-text-frame.png';
  const horizontalSplitFrame = new Image();
  horizontalSplitFrame.onload = () => forge.render();
  horizontalSplitFrame.src = 'assets/horizontal-split-frame.png';
  const compositeTopFrame = new Image();
  compositeTopFrame.onload = () => forge.render();
  compositeTopFrame.src = 'assets/composite-back-top.png';
  const compositeBottomFrame = new Image();
  compositeBottomFrame.onload = () => forge.render();
  compositeBottomFrame.src = 'assets/composite-back-bottom.png';
  const $ = selector => document.querySelector(selector);
  const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
  const projectId = () => `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();
  let projects = [];
  let activeProjectId = '';
  let presets = safeJson(localStorage.getItem(PRESET_KEY), []);
  if (!Array.isArray(presets)) presets = [];
  let revisions = safeJson(localStorage.getItem(REVISION_KEY), { cards: {}, projects: {} });
  if (!revisions || typeof revisions !== 'object') revisions = { cards: {}, projects: {} };
  revisions.cards ||= {}; revisions.projects ||= {};
  let dragCardId = '';
  let projectSaveTimer = 0;

  function normalizeProject(raw = {}) {
    return {
      id: String(raw.id || projectId()),
      name: String(raw.name || 'Untitled Set').slice(0, 100),
      description: String(raw.description || '').slice(0, 2000),
      type: raw.type === 'deck' ? 'deck' : 'set',
      coverCardId: String(raw.coverCardId || ''),
      cardIds: Array.isArray(raw.cardIds) ? [...new Set(raw.cardIds.map(String))] : [],
      createdAt: raw.createdAt || now(), updatedAt: raw.updatedAt || now()
    };
  }

  function loadProjects() {
    const stored = safeJson(localStorage.getItem(PROJECT_KEY), null);
    projects = Array.isArray(stored?.projects) ? stored.projects.map(normalizeProject) : [];
    activeProjectId = stored?.activeProjectId || '';
    if (!projects.length) {
      const first = normalizeProject({ name: 'My First Set', type: 'set', cardIds: forge.getCards().map(card => card.id) });
      projects = [first]; activeProjectId = first.id;
    }
    if (!projects.some(project => project.id === activeProjectId)) activeProjectId = projects[0].id;
    const known = new Set(projects.flatMap(project => project.cardIds));
    let changed = false;
    const cards = forge.getCards().map(card => {
      if (!card.projectId || !projects.some(project => project.id === card.projectId)) {
        changed = true; known.add(card.id); activeProject().cardIds.push(card.id); return { ...card, projectId: activeProjectId };
      }
      const owner = projects.find(project => project.id === card.projectId);
      if (!owner.cardIds.includes(card.id)) { owner.cardIds.push(card.id); changed = true; }
      return card;
    });
    if (changed) forge.setCards(cards);
    persistProjects();
  }

  function activeProject() { return projects.find(project => project.id === activeProjectId) || projects[0]; }
  function activeCards() {
    const project = activeProject();
    const map = new Map(forge.getCards().filter(card => card.projectId === project.id).map(card => [card.id, card]));
    const ordered = project.cardIds.map(id => map.get(id)).filter(Boolean);
    map.forEach((card, id) => { if (!project.cardIds.includes(id)) { project.cardIds.push(id); ordered.push(card); } });
    return ordered;
  }
  function persistProjects() { localStorage.setItem(PROJECT_KEY, JSON.stringify({ projects, activeProjectId })); }
  function persistRevisions() { localStorage.setItem(REVISION_KEY, JSON.stringify(revisions)); }
  function decorateCard(card) {
    const project = activeProject();
    if (!card.projectId) card.projectId = project.id;
    if (card.projectId === project.id && !project.cardIds.includes(card.id)) { project.cardIds.push(card.id); project.updatedAt = now(); persistProjects(); }
    return card;
  }
  function filterCards(cards) { return activeCards(); }
  function dimensions(card) {
    if (card?.template === 'split-combine') return { width: 1320, height: 900 };
    if (card?.template?.startsWith('composite') && card.previewFace === 'back') return { width: 900, height: 660 };
    return HORIZONTAL.has(card?.template) ? { width: 900, height: 660 } : { width: 660, height: 900 };
  }

  const themeColors = {
    titanium: ['#06111a', '#17415c', '#52c9ed'], ember: ['#190806', '#612719', '#ee7148'],
    royal: ['#13091c', '#462762', '#ab7ee7'], verdant: ['#06160e', '#1d5534', '#55c783']
  };
  function plain(value) { return String(value || '').replace(/<[^>]*>/g, '').replace(/\*\*|__/g, '').replace(/\*|_/g, '').replace(/\{\s*(?:[0-5]\s*,\s*)?[LPSTUtlpstu]\s*\}/g, '◆').replace(/\{\d+\}/g, '◉'); }
  function wrap(ctx, text, x, y, width, lineHeight, maxLines = 10, align = 'left') {
    const words = plain(text).split(/\s+/).filter(Boolean); const lines = []; let line = '';
    words.forEach(word => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > width && line) { lines.push(line); line = word; } else line = test; });
    if (line) lines.push(line);
    ctx.textAlign = align; const drawX = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
    lines.slice(0, maxLines).forEach((value, index) => ctx.fillText(value, drawX, y + index * lineHeight));
  }
  function framePath(ctx, x, y, w, h, cut = 24) {
    ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
  }
  function drawPanel(ctx, card, x, y, w, h, art, secondary = false, extended = false) {
    const colors = themeColors[card.theme] || themeColors.titanium;
    ctx.save(); framePath(ctx, x, y, w, h, Math.min(26, w * .05));
    const edge = ctx.createLinearGradient(x, y, x + w, y + h); edge.addColorStop(0, colors[2]); edge.addColorStop(.28, colors[0]); edge.addColorStop(.72, colors[1]); edge.addColorStop(1, '#020508'); ctx.fillStyle = edge; ctx.fill();
    ctx.strokeStyle = '#02070a'; ctx.lineWidth = 12; ctx.stroke(); ctx.strokeStyle = colors[2]; ctx.lineWidth = 2; ctx.stroke();
    const pad = extended ? 0 : 25; const top = y + 72; const textHeight = card.template === 'unit-tall-text' ? h * .48 : h * .31; const artBottom = y + h - textHeight;
    ctx.save(); ctx.beginPath(); ctx.rect(x + pad, top, w - pad * 2, artBottom - top); ctx.clip();
    if (art) {
      const ratio = Math.max((w - pad * 2) / art.width, (artBottom - top) / art.height) * (Number(card.artScale || 100) / 100);
      const aw = art.width * ratio, ah = art.height * ratio;
      ctx.drawImage(art, x + w / 2 - aw / 2 + Number(card.artX || 0), top + (artBottom - top) / 2 - ah / 2 + Number(card.artY || 0), aw, ah);
    } else {
      ctx.fillStyle = '#09131d'; ctx.fillRect(x + pad, top, w - pad * 2, artBottom - top);
      ctx.strokeStyle = `${colors[2]}66`; ctx.lineWidth = 2;
      for (let sx = x - h; sx < x + w; sx += 45) { ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + h, artBottom); ctx.stroke(); }
    }
    ctx.restore();
    ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x + 26, y + h - textHeight, w - 52, textHeight - 26);
    ctx.fillStyle = '#050709'; ctx.fillRect(x + 26, y + 18, w - 52, 58);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.max(18, Math.min(36, w / 15))}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const name = secondary ? card.secondaryName : card.name; ctx.fillText(plain(name) || 'UNTITLED', x + w / 2, y + 47, w - 90);
    ctx.fillStyle = '#080a0c'; ctx.textBaseline = 'alphabetic'; ctx.font = `${Math.max(15, w / 28)}px Arial`;
    const rules = secondary ? card.secondaryRules : card.rules; const flavor = secondary ? card.secondaryFlavor : card.flavor;
    wrap(ctx, rules, x + 44, y + h - textHeight + 38, w - 88, Math.max(19, w / 24), 7, card.rulesAlign || 'left');
    ctx.font = `italic ${Math.max(13, w / 32)}px Arial`; ctx.fillStyle = '#333'; wrap(ctx, flavor, x + 44, y + h - 70, w - 88, Math.max(16, w / 29), 2, card.rulesAlign || 'left');
    ctx.font = `700 ${Math.max(12, w / 34)}px Arial`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    const traits = secondary ? card.secondaryTraits : card.traits; ctx.fillText(plain(traits || card.rarity), x + 42, y + 70, w - 84);
    ctx.restore();
  }
  function horizontalTextLayout(ctx, text, maxWidth, maxLines = 2) {
    const words = plain(text).split(/\s+/).filter(Boolean);
    for (let size = 27; size >= 13; size--) {
      ctx.font = `500 ${size}px Arial`;
      const lines = []; let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      if (lines.length <= maxLines) return { lines, size, lineHeight: size * 1.05 };
    }
    ctx.font = '500 13px Arial';
    const lines = []; let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return { lines: lines.slice(0, maxLines), size: 13, lineHeight: 14 };
  }
  function drawHorizontalRules(ctx, card, box, upsideDown = false, maxLines = 2) {
    const text = plain(card.rules);
    const layout = horizontalTextLayout(ctx, text || 'Card ability text', box.w - 34, maxLines);
    const align = card.rulesAlign || 'left';
    const drawX = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w - 17 : box.x + 17;
    const startY = box.y + box.h / 2 - (layout.lines.length - 1) * layout.lineHeight / 2 + Number(card.rulesY || 0) * .12;
    ctx.save();
    if (upsideDown) {
      const centerX = box.x + box.w / 2, centerY = box.y + box.h / 2;
      ctx.translate(centerX, centerY); ctx.rotate(Math.PI); ctx.translate(-centerX, -centerY);
    }
    ctx.fillStyle = '#080a0c'; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.font = `500 ${layout.size}px Arial`;
    layout.lines.forEach((line, index) => ctx.fillText(line, drawX + Number(card.rulesX || 0) * .18, startY + index * layout.lineHeight, box.w - 34));
    ctx.restore();
  }
  function drawHorizontalCard(ctx, card, art, tallText = false) {
    const width = 900, height = 660;
    const colors = themeColors[card.theme] || themeColors.titanium;
    const frame = tallText ? horizontalTallFrame : horizontalFrame;
    const topBox = tallText ? { x: 48, y: 44, w: 802, h: 109 } : { x: 52, y: 47, w: 796, h: 48 };
    const artBox = tallText ? { x: 48, y: 169, w: 802, h: 260 } : { x: 49, y: 110, w: 800, h: 386 };
    const nameStrip = tallText ? { x: 48, y: 435, w: 802, h: 44 } : { x: 49, y: 501, w: 800, h: 44 };
    const bottomBox = tallText ? { x: 48, y: 491, w: 802, h: 126 } : { x: 52, y: 556, w: 796, h: 47 };

    ctx.fillStyle = '#010407'; ctx.fillRect(0, 0, width, height);
    if (frame.complete && frame.naturalWidth) ctx.drawImage(frame, 0, 0, width, height);
    else {
      framePath(ctx, 6, 6, width - 12, height - 12, 34);
      const shell = ctx.createLinearGradient(0, 0, width, height); shell.addColorStop(0, colors[1]); shell.addColorStop(.45, colors[0]); shell.addColorStop(1, '#010407');
      ctx.fillStyle = shell; ctx.fill(); ctx.strokeStyle = colors[2]; ctx.lineWidth = 3; ctx.stroke();
    }

    // Reuse the clean paper from the blank upper panel so both rules boxes
    // have the same texture and no example text remains baked into the frame.
    if (frame.complete && frame.naturalWidth) {
      const paperSource = tallText ? { x: 88, y: 79, w: 1304, h: 130 } : { x: 86, y: 77, w: 1305, h: 74 };
      ctx.drawImage(frame, paperSource.x, paperSource.y, paperSource.w, paperSource.h, topBox.x, topBox.y, topBox.w, topBox.h);
      ctx.drawImage(frame, paperSource.x, paperSource.y, paperSource.w, paperSource.h, bottomBox.x, bottomBox.y, bottomBox.w, bottomBox.h);
    } else {
      ctx.fillStyle = '#f3f2ee'; ctx.fillRect(topBox.x, topBox.y, topBox.w, topBox.h); ctx.fillRect(bottomBox.x, bottomBox.y, bottomBox.w, bottomBox.h);
    }

    ctx.save(); ctx.beginPath(); ctx.rect(artBox.x, artBox.y, artBox.w, artBox.h); ctx.clip();
    if (art) {
      const ratio = Math.max(artBox.w / art.width, artBox.h / art.height) * (Number(card.artScale || 100) / 100);
      const aw = art.width * ratio, ah = art.height * ratio;
      ctx.drawImage(art, artBox.x + (artBox.w - aw) / 2 + Number(card.artX || 0) * 1.5, artBox.y + (artBox.h - ah) / 2 + Number(card.artY || 0) * 1.25, aw, ah);
    } else {
      const field = ctx.createLinearGradient(artBox.x, artBox.y, artBox.x + artBox.w, artBox.y + artBox.h);
      field.addColorStop(0, colors[1]); field.addColorStop(.6, '#102131'); field.addColorStop(1, colors[0]);
      ctx.fillStyle = field; ctx.fillRect(artBox.x, artBox.y, artBox.w, artBox.h);
      ctx.strokeStyle = `${colors[2]}72`; ctx.lineWidth = 2;
      for (let sx = artBox.x - artBox.h; sx < artBox.x + artBox.w; sx += 50) { ctx.beginPath(); ctx.moveTo(sx, artBox.y); ctx.lineTo(sx + artBox.h, artBox.y + artBox.h); ctx.stroke(); }
      ctx.fillStyle = '#dcecf3b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 30px Arial'; ctx.fillText('UPLOAD UNIT ARTWORK', width / 2, artBox.y + artBox.h / 2 - 8);
      ctx.font = '600 16px Arial'; ctx.fillText('ART TAB  •  PNG / JPEG / WEBP', width / 2, artBox.y + artBox.h / 2 + 27);
    }
    ctx.restore();

    ctx.fillStyle = '#020304'; ctx.fillRect(nameStrip.x, nameStrip.y, nameStrip.w, nameStrip.h);
    ctx.textBaseline = 'middle';
    const title = plain(card.name) || 'CARD NAME';
    ctx.font = `900 ${Math.min(31, Math.max(19, Number(card.titleSize || 100) * .27))}px Arial`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(card.uppercaseTitle === false ? title : title.toUpperCase(), nameStrip.x + 14 + Number(card.nameX || 0) * .18, nameStrip.y + nameStrip.h / 2 + Number(card.nameY || 0) * .15, nameStrip.w * .46);
    const typeParts = [card.rarity === 'None' ? '' : card.rarity, plain(card.traits)].filter(Boolean);
    ctx.font = '600 22px Arial'; ctx.textAlign = 'right';
    ctx.fillText(typeParts.join(' • ') || plain(card.cardKind), nameStrip.x + nameStrip.w - 14, nameStrip.y + nameStrip.h / 2, nameStrip.w * .52);

    const maxRuleLines = tallText ? 5 : 2;
    drawHorizontalRules(ctx, card, bottomBox, false, maxRuleLines);
    drawHorizontalRules(ctx, card, topBox, true, maxRuleLines);
  }

  function splitValue(card, key, secondary) {
    if (!secondary) return card[key];
    const value = card[`secondary${key[0].toUpperCase()}${key.slice(1)}`];
    return value === '' || value == null ? card[key] : value;
  }

  function drawSplitHalf(ctx, card, art, secondary, originX) {
    const paper = horizontalFrame.complete && horizontalFrame.naturalWidth ? horizontalFrame : null;
    const header = { x: originX + 64, y: 64, w: 524, h: 82 };
    const metadata = { x: originX + 126, y: 148, w: 462, h: 44 };
    const artBox = { x: originX + 74, y: 192, w: 512, h: 406 };
    const rulesBox = { x: originX + 78, y: 618, w: 510, h: 212 };
    const sample = { x: 86, y: 77, w: 1305, h: 130 };

    if (paper) {
      ctx.drawImage(paper, sample.x, sample.y, sample.w, sample.h, header.x, header.y, header.w, header.h);
      ctx.drawImage(paper, sample.x, sample.y, sample.w, sample.h, rulesBox.x, rulesBox.y, rulesBox.w, rulesBox.h);
      ctx.drawImage(paper, sample.x, sample.y, sample.w, sample.h, originX + 64, 148, 63, 100);
    } else {
      ctx.fillStyle = '#f2f1ed'; ctx.fillRect(header.x, header.y, header.w, header.h); ctx.fillRect(rulesBox.x, rulesBox.y, rulesBox.w, rulesBox.h);
    }

    ctx.save(); ctx.beginPath(); ctx.rect(artBox.x, artBox.y, artBox.w, artBox.h); ctx.clip();
    if (art) {
      const scaleKey = secondary ? 'secondaryArtScale' : 'artScale';
      const xKey = secondary ? 'secondaryArtX' : 'artX';
      const yKey = secondary ? 'secondaryArtY' : 'artY';
      const ratio = Math.max(artBox.w / art.width, artBox.h / art.height) * (Number(card[scaleKey] || 100) / 100);
      const aw = art.width * ratio, ah = art.height * ratio;
      ctx.drawImage(art, artBox.x + (artBox.w - aw) / 2 + Number(card[xKey] || 0), artBox.y + (artBox.h - ah) / 2 + Number(card[yKey] || 0), aw, ah);
    } else {
      const gradient = ctx.createLinearGradient(artBox.x, artBox.y, artBox.x + artBox.w, artBox.y + artBox.h);
      gradient.addColorStop(0, '#16435c'); gradient.addColorStop(.55, '#102536'); gradient.addColorStop(1, '#06111a');
      ctx.fillStyle = gradient; ctx.fillRect(artBox.x, artBox.y, artBox.w, artBox.h); ctx.strokeStyle = '#3fbfe977'; ctx.lineWidth = 2;
      for (let sx = artBox.x - artBox.h; sx < artBox.x + artBox.w; sx += 45) { ctx.beginPath(); ctx.moveTo(sx, artBox.y); ctx.lineTo(sx + artBox.h, artBox.y + artBox.h); ctx.stroke(); }
      ctx.fillStyle = '#dcecf3b8'; ctx.textAlign = 'center'; ctx.font = '900 20px Arial'; ctx.fillText(`UPLOAD ${secondary ? 'SECOND-HALF ' : ''}ARTWORK`, artBox.x + artBox.w / 2, artBox.y + artBox.h / 2);
    }
    ctx.restore();

    ctx.fillStyle = '#030303'; ctx.fillRect(metadata.x, metadata.y, metadata.w, metadata.h);
    const rarity = splitValue(card, 'rarity', secondary);
    const traits = splitValue(card, 'traits', secondary);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 19px Arial';
    ctx.fillText([rarity === 'None' ? '' : rarity, plain(traits)].filter(Boolean).join(' • '), metadata.x + metadata.w / 2, metadata.y + metadata.h / 2, metadata.w - 18);

    const title = plain(splitValue(card, 'name', secondary)) || (secondary ? 'SECOND HALF' : 'CARD NAME');
    ctx.fillStyle = '#050505'; ctx.font = '900 34px Arial'; ctx.fillText(title.toUpperCase(), originX + 350, 108, 330);
    const construction = splitValue(card, 'construction', secondary), operation = splitValue(card, 'operation', secondary), cycle = splitValue(card, 'cycle', secondary);
    const costCircle = (x, value, dark = false) => { if (value === '-') return; ctx.fillStyle = dark ? '#111' : '#f4f4ef'; ctx.strokeStyle = '#050505'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(originX + x, 109, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = dark ? '#fff' : '#050505'; ctx.font = '900 28px Arial'; ctx.fillText(value, originX + x, 111); };
    costCircle(94, construction); costCircle(139, operation, true); costCircle(566, cycle);

    const assets = ['L','P','S','T','U'].map(key => [key, splitValue(card, `asset${key}`, secondary)]).filter(([, value]) => value !== '');
    assets.forEach(([key, value], index) => {
      const y = 167 + index * 34; ctx.fillStyle = '#efeee8'; ctx.strokeStyle = '#050505'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(originX + 67, y - 15, 56, 30, 15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ({ L:'#0b5fae', P:'#9c4dcc', S:'#EDD012', T:'#8b1e2d', U:'#117d45' })[key]; ctx.beginPath(); ctx.roundRect(originX + 98, y - 12, 22, 24, 8); ctx.fill();
      ctx.fillStyle = '#050505'; ctx.font = '900 20px Arial'; ctx.fillText(value, originX + 85, y + 1); ctx.fillStyle = key === 'S' ? '#050505' : '#fff'; ctx.fillText(key, originX + 109, y + 1);
    });

    ctx.fillStyle = '#080808'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '500 18px Arial';
    wrap(ctx, splitValue(card, 'rules', secondary), rulesBox.x + 22, rulesBox.y + 36, rulesBox.w - 44, 22, 4, 'left');
    ctx.font = 'italic 17px Arial'; wrap(ctx, splitValue(card, 'flavor', secondary), rulesBox.x + 22, rulesBox.y + 130, rulesBox.w - 44, 21, 3, 'left');

    const speed = splitValue(card, 'speed', secondary), attack = splitValue(card, 'attack', secondary), armor = splitValue(card, 'armor', secondary), structure = splitValue(card, 'structure', secondary);
    const stat = (x, value, fill, color) => { if (value === '-') return; ctx.fillStyle = fill; ctx.strokeStyle = '#050505'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(originX + x, 807, 27, 23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 29px Arial'; ctx.fillText(value, originX + x, 809); };
    stat(113, speed, '#d7862e', '#050505'); stat(170, attack, '#a30d16', '#fff'); stat(494, armor, '#d7d7d1', '#050505'); stat(550, structure, '#555', '#fff');
    ctx.fillStyle = '#050505'; ctx.font = '600 11px Arial'; ctx.textAlign = 'center'; ctx.fillText(card.artist ? `Illus. ${card.artist}` : 'Artist credit', originX + 330, 807); ctx.font = '500 9px Arial'; ctx.fillText(card.copyright || `${card.setCode} • ${card.collector}`, originX + 330, 821);
  }

  function drawSplitCard(ctx, card, primaryArt, secondaryArt) {
    const width = 1320, height = 900;
    ctx.fillStyle = '#01070b'; ctx.fillRect(0, 0, width, height);
    if (horizontalSplitFrame.complete && horizontalSplitFrame.naturalWidth) ctx.drawImage(horizontalSplitFrame, 0, 0, width, height);
    drawSplitHalf(ctx, card, primaryArt, false, 0);
    drawSplitHalf(ctx, card, secondaryArt || primaryArt, true, 660);
    ctx.fillStyle = '#06111a'; ctx.fillRect(636, 0, 48, height);
    ctx.save(); ctx.translate(660, height / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#d7c39b'; ctx.textAlign = 'center'; ctx.font = '900 17px Arial'; ctx.fillText(card.combineEnabled ? 'COMBINE' : 'SPLIT', 0, 6); ctx.restore();
  }

  function drawCompositeArtwork(ctx, card, art, half) {
    const box = half === 'top' ? { x: 102, y: 212, w: 696, h: 448, globalY: 212 } : { x: 102, y: 0, w: 696, h: 250, globalY: 660 };
    const total = { x: 102, y: 212, w: 696, h: 698 };
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    if (art) {
      const ratio = Math.max(total.w / art.width, total.h / art.height) * (Number(card.secondaryArtScale || 100) / 100);
      const aw = art.width * ratio, ah = art.height * ratio;
      const dx = total.x + (total.w - aw) / 2 + Number(card.secondaryArtX || 0) * 1.5;
      const globalDy = total.y + (total.h - ah) / 2 + Number(card.secondaryArtY || 0) * 1.25;
      ctx.drawImage(art, dx, globalDy - (half === 'bottom' ? 660 : 0), aw, ah);
    } else {
      const colors = themeColors[card.theme] || themeColors.titanium;
      const offset = half === 'bottom' ? 660 : 0;
      const gradient = ctx.createLinearGradient(total.x, total.y - offset, total.x + total.w, total.y + total.h - offset);
      gradient.addColorStop(0, colors[1]); gradient.addColorStop(.55, '#102536'); gradient.addColorStop(1, colors[0]);
      ctx.fillStyle = gradient; ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = `${colors[2]}72`; ctx.lineWidth = 2;
      for (let sx = -500; sx < 1200; sx += 54) { ctx.beginPath(); ctx.moveTo(sx, total.y - offset); ctx.lineTo(sx + total.h, total.y + total.h - offset); ctx.stroke(); }
      if (half === 'top') { ctx.fillStyle = '#dcecf3b8'; ctx.textAlign = 'center'; ctx.font = '900 26px Arial'; ctx.fillText('UPLOAD COMPOSITE ARTWORK', 450, 445); }
    }
    ctx.restore();
  }

  function drawCompositeBack(ctx, card, secondaryArt) {
    const top = card.template === 'composite-left';
    const frame = top ? compositeTopFrame : compositeBottomFrame;
    ctx.fillStyle = '#01070b'; ctx.fillRect(0, 0, 900, 660);
    if (frame.complete && frame.naturalWidth) ctx.drawImage(frame, 0, 0, 900, 660);
    drawCompositeArtwork(ctx, card, secondaryArt, top ? 'top' : 'bottom');

    const value = key => splitValue(card, key, true);
    if (top) {
      // Rebuild the live header over the reference card while keeping its exact shell geometry.
      if (horizontalFrame.complete && horizontalFrame.naturalWidth) ctx.drawImage(horizontalFrame, 86, 77, 1305, 130, 86, 86, 724, 72);
      else { ctx.fillStyle = '#f2f1ed'; ctx.fillRect(86, 86, 724, 72); }
      ctx.fillStyle = '#030303'; ctx.fillRect(176, 160, 634, 52);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 25px Arial';
      const metadata = [value('rarity') === 'None' ? '' : value('rarity'), plain(value('traits'))].filter(Boolean).join(' • ');
      ctx.fillText(metadata, 493, 186, 610);
      ctx.fillStyle = '#050505'; ctx.font = '900 48px Arial'; ctx.fillText((plain(value('name')) || 'COMPOSITE').toUpperCase(), 450, 122, 440);

      const costCircle = (x, cost, dark = false) => {
        if (cost === '-' || cost === '') return;
        ctx.fillStyle = dark ? '#111' : '#f4f4ef'; ctx.strokeStyle = '#050505'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, 122, 27, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark ? '#fff' : '#050505'; ctx.font = '900 34px Arial'; ctx.fillText(cost, x, 124);
      };
      costCircle(125, value('construction')); costCircle(178, value('operation'), true); costCircle(774, value('cycle'));

      ctx.fillStyle = '#f2f1ed'; ctx.fillRect(87, 160, 90, 122);
      const assets = ['L','P','S','T','U'].map(key => [key, value(`asset${key}`)]).filter(([, amount]) => amount !== '');
      assets.slice(0, 3).forEach(([key, amount], index) => {
        const y = 181 + index * 39; ctx.fillStyle = '#efeee8'; ctx.strokeStyle = '#050505'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(94, y - 16, 70, 32, 16); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ({ L:'#0b5fae', P:'#9c4dcc', S:'#EDD012', T:'#8b1e2d', U:'#117d45' })[key]; ctx.beginPath(); ctx.roundRect(130, y - 13, 30, 26, 9); ctx.fill();
        ctx.fillStyle = '#050505'; ctx.font = '900 23px Arial'; ctx.fillText(amount, 116, y + 1); ctx.fillStyle = key === 'S' ? '#050505' : '#fff'; ctx.fillText(key, 145, y + 1);
      });
    } else {
      const rulesBox = { x: 91, y: 276, w: 718, h: 285 };
      if (horizontalFrame.complete && horizontalFrame.naturalWidth) ctx.drawImage(horizontalFrame, 86, 77, 1305, 130, rulesBox.x, rulesBox.y, rulesBox.w, rulesBox.h);
      else { ctx.fillStyle = '#f2f1ed'; ctx.fillRect(rulesBox.x, rulesBox.y, rulesBox.w, rulesBox.h); }
      ctx.fillStyle = '#080808'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '500 25px Arial';
      wrap(ctx, value('rules'), 120, 325, 660, 31, 5, card.rulesAlign || 'left');
      ctx.font = 'italic 23px Arial'; wrap(ctx, value('flavor'), 120, 455, 660, 29, 3, card.rulesAlign || 'left');
      const stat = (x, statValue, fill, color) => {
        if (statValue === '-' || statValue === '') return;
        ctx.fillStyle = fill; ctx.strokeStyle = '#050505'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, 570, 34, 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 36px Arial'; ctx.fillText(statValue, x, 573);
      };
      stat(153, value('speed'), '#d7862e', '#050505'); stat(219, value('attack'), '#a30d16', '#fff'); stat(682, value('armor'), '#d7d7d1', '#050505'); stat(749, value('structure'), '#555', '#fff');
      ctx.fillStyle = '#050505'; ctx.textAlign = 'center'; ctx.font = '700 17px Arial'; ctx.fillText(card.artist ? `Illus. ${card.artist}` : 'Artist credit', 450, 570); ctx.font = '500 14px Arial'; ctx.fillText(card.copyright || `${card.setCode} • ${card.collector}`, 450, 591);
    }
  }
  function drawCustom(ctx, card, width, height) {
    ctx.fillStyle = '#0a1017'; ctx.fillRect(0, 0, width, height);
    const layers = safeJson(card.customLayers, []);
    if (!Array.isArray(layers) || !layers.length) { ctx.fillStyle = '#fff'; ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.fillText('Add custom layer JSON in the Style tab', width / 2, height / 2); return; }
    layers.forEach(layer => {
      ctx.save(); const x = Number(layer.x || 0), y = Number(layer.y || 0), w = Number(layer.w || 100), h = Number(layer.h || 40);
      if (layer.type === 'box') { ctx.fillStyle = layer.fill || '#fff'; ctx.fillRect(x, y, w, h); if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = Number(layer.lineWidth || 2); ctx.strokeRect(x, y, w, h); } }
      if (layer.type === 'text') { ctx.fillStyle = layer.color || '#fff'; ctx.font = `${layer.weight || 700} ${Number(layer.size || 24)}px ${layer.font || 'Arial'}`; wrap(ctx, card[layer.field] ?? layer.text ?? '', x, y + Number(layer.size || 24), w, Number(layer.lineHeight || layer.size * 1.2), Number(layer.maxLines || 6), layer.align || 'left'); }
      ctx.restore();
    });
  }
  function drawVariant(ctx, card, scale, guides, art, secondaryArt) {
    if ((!card.template || card.template === 'unit-standard' || card.template === 'unit-tall-text' || card.template === 'unit-extended-art') && card.previewFace !== 'back') return false;
    const { width, height } = dimensions(card); ctx.save(); ctx.scale(scale, scale); ctx.clearRect(0, 0, width, height);
    if ((!card.template || card.template === 'unit-standard') && card.previewFace === 'back') {
      const colors = themeColors[card.theme] || themeColors.titanium; const gradient = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width * .7); gradient.addColorStop(0, colors[1]); gradient.addColorStop(.55, colors[0]); gradient.addColorStop(1, '#010305'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height); framePath(ctx, 18, 18, width - 36, height - 36, 38); ctx.strokeStyle = colors[2]; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#d6c49a'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#e8f7ff'; ctx.textAlign = 'center'; ctx.font = '900 58px Arial'; ctx.fillText('MECHTITAN', width / 2, height / 2); ctx.font = '700 22px Arial'; ctx.fillStyle = colors[2]; ctx.fillText('CARD FORGE', width / 2, height / 2 + 38);
    } else if (card.template === 'custom') drawCustom(ctx, card, width, height);
    else if (card.template === 'horizontal') drawHorizontalCard(ctx, card, art, false);
    else if (card.template === 'horizontal-tall-text') drawHorizontalCard(ctx, card, art, true);
    else if (card.template === 'split-combine') drawSplitCard(ctx, card, art, secondaryArt);
    else if (card.template === 'flip') {
      drawPanel(ctx, card, 8, 8, 644, 438, art, false); ctx.save(); ctx.translate(660, 900); ctx.rotate(Math.PI); drawPanel(ctx, card, 8, 8, 644, 438, art, true); ctx.restore();
    } else if (TWO_SIDED.has(card.template) && card.previewFace === 'back') {
      if (card.template.startsWith('composite')) drawCompositeBack(ctx, card, secondaryArt || art);
      else drawPanel(ctx, card, 8, 8, width - 16, height - 16, art, true, card.template === 'unit-extended-art');
    } else drawPanel(ctx, card, 8, 8, width - 16, height - 16, art, false, card.template === 'unit-extended-art');
    if (guides) { ctx.save(); ctx.setLineDash([8, 7]); ctx.strokeStyle = '#ff3f6d'; ctx.lineWidth = 2; ctx.strokeRect(30, 30, width - 60, height - 60); ctx.restore(); }
    ctx.restore(); return true;
  }

  function onCardDuplicated(source, copy) {
    const project = projects.find(item => item.id === (copy.projectId || source.projectId)) || activeProject();
    const sourceIndex = project.cardIds.indexOf(source.id);
    project.cardIds = project.cardIds.filter(id => id !== copy.id);
    project.cardIds.splice(sourceIndex >= 0 ? sourceIndex + 1 : project.cardIds.length, 0, copy.id);
    project.updatedAt = now();
    persistProjects();
    captureProjectRevision('Card duplicated');
  }

  window.MechTitanStudio = { decorateCard, filterCards, dimensions, drawVariant, saveActiveSet, onCardDuplicated };

  function balance(card) {
    const speed = { XS: -1, S: -.5, M: 0, F: .5, XF: 1 }[card.speed];
    const operation = { 0: 1.35, 1: 1.15, 2: 1, 3: .88, 4: .78, 5: .70 }[card.operation];
    if ([card.attack, card.armor, card.structure, card.construction, card.operation].some(value => value === '-' || value === '') || speed == null || operation == null) return { state: 'incomplete' };
    const staticPower = Number(card.armor) * 1.5 + Number(card.structure) * .4 + Number(card.staticKeywordBP || 0) + Number(card.staticAbilityBP || 0);
    const operational = (Number(card.attack) + speed + Number(card.operationalKeywordBP || 0) + Number(card.operationalAbilityBP || 0)) * operation;
    const assetRequirements = ['L', 'P', 'S', 'T', 'U'].map(key => Number(card[`asset${key}`]) || 0).filter(Boolean);
    const assetTotal = assetRequirements.reduce((sum, value) => sum + value, 0);
    const assetAccessibility = -Math.min(1.5, (assetTotal * .15) + (Math.max(0, assetRequirements.length - 1) * .25));
    const total = staticPower + operational + ({ 1: .5, 2: 1, 3: 1.5 }[card.cycle] || 0) + assetAccessibility;
    const suggested = Math.max(0, Math.ceil((total - 2) / 2)); const delta = Number(card.construction) - suggested;
    return { state: Math.abs(delta) <= 1 ? 'balanced' : delta < -1 ? 'under' : 'over', total, suggested, delta };
  }

  function renderProjects() {
    const project = activeProject();
    $('#projectSelect').innerHTML = projects.map(item => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.type}</option>`).join(''); $('#projectSelect').value = project.id;
    $('#projectName').value = project.name; $('#projectType').value = project.type; $('#projectDescription').value = project.description;
    const cards = activeCards(); $('#projectCover').innerHTML = '<option value="">None</option>' + cards.map(card => `<option value="${card.id}">${escapeHtml(forge.plainTextFromMarkup(card.name) || 'Untitled card')}</option>`).join(''); $('#projectCover').value = project.coverCardId;
    const results = cards.map(balance); const counts = results.reduce((sum, item) => { sum[item.state] = (sum[item.state] || 0) + 1; return sum; }, {});
    const complete = results.filter(item => item.total != null); const average = complete.length ? (complete.reduce((sum, item) => sum + item.total, 0) / complete.length).toFixed(1) : '—';
    $('#projectStats').innerHTML = `<span><b>${cards.length}</b> cards</span><span class="ok"><b>${counts.balanced || 0}</b> balanced</span><span class="warn"><b>${(counts.under || 0) + (counts.over || 0)}</b> review</span><span><b>${counts.incomplete || 0}</b> incomplete</span><span><b>${average}</b> avg BP</span>`;
    forge.renderLibrary();
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

  function scheduleProjectSave() {
    clearTimeout(projectSaveTimer); projectSaveTimer = setTimeout(() => {
      const project = activeProject(); const previous = JSON.stringify(project);
      project.name = $('#projectName').value.trim() || 'Untitled Project'; project.type = $('#projectType').value; project.description = $('#projectDescription').value; project.coverCardId = $('#projectCover').value; project.updatedAt = now();
      persistProjects(); renderProjects(); if (previous !== JSON.stringify(project)) captureProjectRevision('Project details changed');
    }, 250);
  }

  function captureCardRevision(reason = 'Card saved') {
    const card = forge.getCards().find(item => item.id === forge.getCurrentId()); if (!card) return;
    const list = revisions.cards[card.id] ||= []; const snapshot = JSON.stringify(card);
    if (list[0]?.snapshot === snapshot) return;
    list.unshift({ id: crypto.randomUUID?.() || String(Date.now()), at: now(), reason, snapshot }); revisions.cards[card.id] = list.slice(0, 30); persistRevisions();
  }
  function captureProjectRevision(reason = 'Project saved') {
    const project = activeProject(); const list = revisions.projects[project.id] ||= [];
    const snapshot = JSON.stringify({ project, cards: activeCards() }); if (list[0]?.snapshot === snapshot) return;
    list.unshift({ id: crypto.randomUUID?.() || String(Date.now()), at: now(), reason, snapshot }); revisions.projects[project.id] = list.slice(0, 20); persistRevisions();
  }

  function saveActiveSet() {
    const card = forge.saveCurrent(false);
    const project = activeProject();
    project.name = $('#projectName').value.trim() || 'Untitled Project';
    project.type = $('#projectType').value;
    project.description = $('#projectDescription').value;
    project.coverCardId = $('#projectCover').value;
    project.cardIds = forge.getCards().filter(item => item.projectId === project.id).map(item => item.id);
    project.updatedAt = now();
    persistProjects();
    captureCardRevision('Set saved');
    captureProjectRevision('Set saved');
    renderProjects();
    forge.toast(`Saved ${project.name} (${activeCards().length} card${activeCards().length === 1 ? '' : 's'})`);
    return card;
  }
  function compareObjects(before, after) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
    return keys.filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).map(key => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(short(before?.[key]))}</td><td>${escapeHtml(short(after?.[key]))}</td></tr>`).join('') || '<tr><td colspan="3">No field changes.</td></tr>';
  }
  function short(value) { const text = typeof value === 'string' ? value : JSON.stringify(value); return (text || '—').slice(0, 120); }

  function showDialog(title, html) { $('#studioDialogTitle').textContent = title; $('#studioDialogBody').innerHTML = html; $('#studioDialog').showModal(); }
  function showHistory() {
    const card = forge.getCards().find(item => item.id === forge.getCurrentId()); const project = activeProject(); const cardList = revisions.cards[card?.id] || []; const projectList = revisions.projects[project.id] || [];
    showDialog('Version history', `<div class="history-tabs"><button type="button" data-history-tab="card" class="active">Card revisions</button><button type="button" data-history-tab="project">Project revisions</button></div><div id="cardHistory" class="history-list">${historyRows(cardList, 'card')}</div><div id="projectHistory" class="history-list" hidden>${historyRows(projectList, 'project')}</div><div id="revisionCompare"></div>`);
  }
  function historyRows(list, type) { return list.length ? list.map(item => `<article><div><strong>${new Date(item.at).toLocaleString()}</strong><span>${escapeHtml(item.reason)}</span></div><button type="button" data-compare-revision="${item.id}" data-revision-type="${type}">Compare</button><button type="button" data-restore-revision="${item.id}" data-revision-type="${type}">Restore</button></article>`).join('') : '<p class="hint">No saved revisions yet.</p>'; }
  function revisionBy(type, id) { const key = type === 'card' ? forge.getCurrentId() : activeProjectId; return (revisions[`${type}s`][key] || []).find(item => item.id === id); }
  function restoreRevision(type, item) {
    if (!item || !confirm(`Restore this ${type} revision? The current version will be retained in history.`)) return;
    if (type === 'card') { captureCardRevision('Before restore'); const restored = JSON.parse(item.snapshot); const cards = forge.getCards().map(card => card.id === restored.id ? restored : card); forge.setCards(cards); forge.setFormData(restored); captureCardRevision('Restored revision'); }
    else { captureProjectRevision('Before restore'); const data = JSON.parse(item.snapshot); projects = projects.map(project => project.id === data.project.id ? normalizeProject(data.project) : project); const other = forge.getCards().filter(card => card.projectId !== data.project.id); forge.setCards([...other, ...data.cards]); persistProjects(); renderProjects(); captureProjectRevision('Restored revision'); }
    $('#studioDialog').close(); forge.toast('Earlier version restored');
  }

  function insertAtSelection(textarea, before, after = '', placeholder = 'text') {
    const start = textarea.selectionStart, end = textarea.selectionEnd; const chosen = textarea.value.slice(start, end) || placeholder;
    textarea.setRangeText(`${before}${chosen}${after}`, start, end, 'end'); textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.focus();
  }
  function setupToolbar() {
    const textarea = $('#rules');
    document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => insertAtSelection(textarea, button.dataset.format === 'bold' ? '<strong>' : '<em>', button.dataset.format === 'bold' ? '</strong>' : '</em>')));
    document.querySelectorAll('[data-token]').forEach(button => button.addEventListener('click', () => insertAtSelection(textarea, button.dataset.token, '', '')));
    $('#insertAssetBtn').addEventListener('click', () => { const value = $('#toolbarAssetValue').value, type = $('#toolbarAssetType').value; insertAtSelection(textarea, value ? `{${value}, ${type}}` : `{${type}}`, '', ''); });
    $('#toolbarColor').addEventListener('change', event => insertAtSelection(textarea, `<span style="color:${event.target.value}">`, '</span>'));
    $('#toolbarSize').addEventListener('change', event => { if (event.target.value) insertAtSelection(textarea, `<span style="font-size:${event.target.value}">`, '</span>'); event.target.value = ''; });
  }

  function updateTemplateUi() {
    const card = forge.getFormData(); const dual = TWO_SIDED.has(card.template);
    const split = card.template === 'split-combine';
    $('#secondaryFaceFields').hidden = !dual; $('#secondaryArtControls').hidden = !dual; $('#faceControls').hidden = !dual || card.template === 'flip'; $('#customLayerEditor').hidden = card.template !== 'custom';
    $('#frontFaceBtn').textContent = split ? 'Edit left card' : 'Front / top';
    $('#backFaceBtn').textContent = split ? 'Edit right card' : 'Back / bottom';
    $('#secondaryFaceHeading').textContent = split ? 'Right card' : 'Second half / back face';
    $('#secondaryArtControls h3').textContent = split ? 'Right-card artwork' : 'Second-half artwork';
    const flip = card.template === 'flip';
    $('#secondaryConstructionField').hidden = flip;
    $('#secondaryCycleField').hidden = flip;
    $('#secondaryAssetCosts').hidden = flip;
    const splitSide = document.querySelector('#cardForm').dataset.splitEditorSide || 'left';
    $('#frontFaceBtn').classList.toggle('active', split ? splitSide === 'left' : card.previewFace !== 'back'); $('#backFaceBtn').classList.toggle('active', split ? splitSide === 'right' : card.previewFace === 'back');
    document.querySelectorAll('[name="operation"], [name="speed"], [name="attack"], [name="armor"], [name="structure"]').forEach(input => input.closest('.field')?.classList.toggle('conditional-hidden', card.cardKind !== 'Unit'));
    const horizontal = HORIZONTAL.has(card.template); const compositeBack = card.template.startsWith('composite') && card.previewFace === 'back';
    $('#dimensionsLabel').textContent = card.template === 'split-combine' ? '5.5 × 3.75 in split card' : horizontal || compositeBack ? '3.75 × 2.75 in with bleed' : '2.75 × 3.75 in with bleed';
  }

  function presetData() { const card = forge.getFormData(); return Object.fromEntries(['theme','titleSize','nameX','nameY','rulesX','rulesY','flavorX','flavorY','uppercaseTitle','faction','copyright','rulesAlign','template','customLayers'].map(key => [key, card[key]])); }
  function renderPresets() { $('#presetSelect').innerHTML = '<option value="">Choose a preset</option>' + presets.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join(''); }

  async function pack(text) {
    if (typeof CompressionStream === 'function') { const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')); return { codec: 'gz', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) }; }
    return { codec: 'raw', bytes: new TextEncoder().encode(text) };
  }
  async function unpack(codec, bytes) {
    if (codec === 'gz') { if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress the shared project'); const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')); return new Response(stream).text(); }
    return new TextDecoder().decode(bytes);
  }
  function b64(bytes) { let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(text) { const normalized = text.replace(/-/g, '+').replace(/_/g, '/'); const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
  async function keyFromPassphrase(passphrase, salt, usage) { const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, usage); }
  function sharePayload(scope = 'project') {
    if (scope === 'card') { const card = forge.getCards().find(item => item.id === forge.getCurrentId()) || forge.getFormData(); return { app: 'MechTitan Card Forge', version: forge.version, sharedAt: now(), project: normalizeProject({ name: `${forge.plainTextFromMarkup(card.name) || 'Shared card'} link`, cardIds: [card.id], coverCardId: card.id }), cards: [card] }; }
    return { app: 'MechTitan Card Forge', version: forge.version, sharedAt: now(), project: activeProject(), cards: activeCards() };
  }
  async function makeShareLink(privateLink, scope = 'project') {
    const packed = await pack(JSON.stringify(sharePayload(scope))); let fragment;
    if (privateLink) { const pass = prompt('Create a passphrase for this private link. It will not be included in the URL.'); if (!pass) return; const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const key = await keyFromPassphrase(pass, salt, ['encrypt']); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed.bytes)); fragment = `share=private.${packed.codec}.${b64(salt)}.${b64(iv)}.${b64(encrypted)}`; }
    else fragment = `share=public.${packed.codec}.${b64(packed.bytes)}`;
    const link = `${location.origin}${location.pathname}#${fragment}`; await navigator.clipboard.writeText(link).catch(() => {});
    const warning = link.length > 100000 ? '<p class="warning">This link is very large because artwork is embedded. Some messaging services may truncate it; export the project JSON for reliable transfer.</p>' : '';
    showDialog(`${privateLink ? 'Private' : 'Public'} ${scope} link`, `${warning}<p>Anyone with this link${privateLink ? ' and the passphrase' : ''} can import this ${scope}. The link is unlisted; this static app does not publish a searchable cloud directory.</p><textarea class="share-link" readonly>${escapeHtml(link)}</textarea><button type="button" id="copyShareLink">Copy link</button>`);
    $('#copyShareLink').addEventListener('click', () => navigator.clipboard.writeText(link).then(() => forge.toast('Share link copied')));
  }
  async function importShareLink(value, automatic = false) {
    try {
      const hash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : value.replace(/^#/, ''); if (!hash.startsWith('share=')) throw new Error('No MechTitan share data found');
      const parts = hash.slice(6).split('.'); let compressed;
      const codec = parts[1];
      if (parts[0] === 'private') { const pass = prompt('Enter the passphrase for this private project link.'); if (!pass) return; const salt = unb64(parts[2]), iv = unb64(parts[3]), encrypted = unb64(parts[4]); const key = await keyFromPassphrase(pass, salt, ['decrypt']); compressed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)); }
      else compressed = unb64(parts[2]);
      const data = JSON.parse(await unpack(codec, compressed)); if (!data.project || !Array.isArray(data.cards)) throw new Error('Project data is incomplete');
      const importedProject = normalizeProject({ ...data.project, id: projectId(), name: `${data.project.name} (imported)` }); const mapped = data.cards.map(card => ({ ...card, id: forge.createId(), projectId: importedProject.id })); importedProject.cardIds = mapped.map(card => card.id); projects.push(importedProject); activeProjectId = importedProject.id; forge.setCards([...forge.getCards(), ...mapped]); persistProjects(); renderProjects(); if (mapped[0]) forge.setFormData(mapped[0]); history.replaceState(null, '', location.pathname + location.search); captureProjectRevision('Imported shared project'); forge.toast(`Imported ${mapped.length} cards`);
    } catch (error) { if (!automatic || confirm(`Could not import this share link: ${error.message}`)) forge.toast(`Import failed: ${error.message}`); }
  }

  async function cardImage(card, dpi = 144) { const blob = await forge.renderCardBlob(card, 'png', dpi); return createImageBitmap(blob); }
  function projectCardList() { const selected = [...forge.selected]; const cards = activeCards(); return selected.length ? cards.filter(card => selected.includes(card.id)) : cards; }
  async function exportPrintPdf() {
    const paper = $('#printPaper').value, landscape = $('#printOrientation').value === 'landscape', gutter = Number($('#printGutter').value || .125), crop = $('#printCrop').checked, duplex = $('#printDuplex').checked;
    const sizes = { letter: [8.5, 11], a4: [8.2677, 11.6929] }; let [pw, ph] = sizes[paper]; if (landscape) [pw, ph] = [ph, pw];
    const cards = projectCardList(); if (!cards.length) return forge.toast('No cards in this project');
    const margin = .25, cw = 2.75, ch = 3.75, cols = Math.max(1, Math.floor((pw - margin * 2 + gutter) / (cw + gutter))), rows = Math.max(1, Math.floor((ph - margin * 2 + gutter) / (ch + gutter))), perPage = cols * rows;
    const pages = [];
    for (let offset = 0; offset < cards.length; offset += perPage) { const batch = cards.slice(offset, offset + perPage); pages.push({ cards: batch, backs: false }); if (duplex) pages.push({ cards: batch, backs: true }); }
    const pdf = await buildRasterPdf(pages, { pw, ph, margin, cw, ch, cols, gutter, crop }); forge.downloadBlob(pdf, `${forge.slug(activeProject().name)}-print-sheet.pdf`); forge.toast('Print-sheet PDF exported');
  }
  const encode = value => new TextEncoder().encode(value);
  function concatBytes(parts) { const size = parts.reduce((sum, part) => sum + part.length, 0), output = new Uint8Array(size); let offset = 0; parts.forEach(part => { output.set(part, offset); offset += part.length; }); return output; }
  function pdfDocument(configure) {
    const objects = [null]; const add = value => (objects.push(value), objects.length - 1); const catalog = add(''), pages = add(''); configure({ add, catalog, pages, objects });
    const chunks = [encode('%PDF-1.4\n%MTFG\n')], offsets = [0]; let length = chunks[0].length;
    for (let id = 1; id < objects.length; id++) { offsets[id] = length; const value = objects[id]; let body; if (value?.bytes) body = concatBytes([encode(`${id} 0 obj\n${value.dict.replace('{length}', value.bytes.length)}\nstream\n`), value.bytes, encode('\nendstream\nendobj\n')]); else body = encode(`${id} 0 obj\n${value}\nendobj\n`); chunks.push(body); length += body.length; }
    const xrefAt = length; const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`]; for (let id = 1; id < objects.length; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`); xref.push(`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`); chunks.push(encode(xref.join(''))); return new Blob([concatBytes(chunks)], { type: 'application/pdf' });
  }
  async function buildRasterPdf(pageSpecs, options) {
    const { pw, ph, margin, cw, ch, cols, gutter, crop } = options; const prepared = [];
    for (const spec of pageSpecs) { const images = []; for (let index = 0; index < spec.cards.length; index++) { const source = spec.backs ? { ...spec.cards[index], previewFace: 'back' } : spec.cards[index]; const dims = dimensions(source); const blob = await forge.renderCardBlob(source, 'jpeg', 144); const bytes = new Uint8Array(await blob.arrayBuffer()); const col = spec.backs ? cols - 1 - (index % cols) : index % cols, row = Math.floor(index / cols); const cardW = dims.width / 240, cardH = dims.height / 240, fit = Math.min(cw / cardW, ch / cardH); const w = cardW * fit, h = cardH * fit; images.push({ bytes, pxW: Math.round(dims.width * .6), pxH: Math.round(dims.height * .6), x: margin + col * (cw + gutter) + (cw - w) / 2, y: margin + row * (ch + gutter) + (ch - h) / 2, w, h }); } prepared.push(images); }
    return pdfDocument(({ add, catalog, pages, objects }) => { const pageIds = []; prepared.forEach(images => { const names = [], commands = []; images.forEach((image, index) => { const id = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${image.pxW} /Height ${image.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {length} >>`, bytes: image.bytes }); const name = `Im${index + 1}`; names.push(`/${name} ${id} 0 R`); const x = image.x * 72, y = (ph - image.y - image.h) * 72, w = image.w * 72, h = image.h * 72; commands.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`); if (crop) commands.push(cropCommands(x, y, w, h)); }); const content = encode(commands.join('\n')); const contentId = add({ dict: '<< /Length {length} >>', bytes: content }); const pageId = add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${(pw * 72).toFixed(2)} ${(ph * 72).toFixed(2)}] /Resources << /XObject << ${names.join(' ')} >> >> /Contents ${contentId} 0 R >>`); pageIds.push(pageId); }); objects[catalog] = `<< /Type /Catalog /Pages ${pages} 0 R >>`; objects[pages] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`; });
  }
  function cropCommands(x, y, w, h) { const m = 6, s = .5; return `q 0 G 0.4 w ${x-m} ${y} m ${x-s} ${y} l S ${x} ${y-m} m ${x} ${y-s} l S ${x+w+s} ${y} m ${x+w+m} ${y} l S ${x+w} ${y-m} m ${x+w} ${y-s} l S ${x-m} ${y+h} m ${x-s} ${y+h} l S ${x} ${y+h+s} m ${x} ${y+h+m} l S ${x+w+s} ${y+h} m ${x+w+m} ${y+h} l S ${x+w} ${y+h+s} m ${x+w} ${y+h+m} l S Q`; }
  function showPrintDialog() { showDialog('Print & play', `<div class="grid-2"><div class="field"><label>Paper size</label><select id="printPaper"><option value="letter">US Letter</option><option value="a4">A4</option></select></div><div class="field"><label>Orientation</label><select id="printOrientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div><div class="field"><label>Gutter (inches)</label><input id="printGutter" type="number" min="0" max="1" step="0.025" value="0.125"></div></div><label class="toggle-row"><input id="printCrop" type="checkbox" checked><span>Crop marks</span></label><label class="toggle-row"><input id="printDuplex" type="checkbox"><span>Duplex fronts and backs</span></label><button id="createPrintPdf" type="button" class="primary wide">Export multi-card PDF</button>`); $('#createPrintPdf').addEventListener('click', exportPrintPdf); }
  async function exportTts() { const cards = projectCardList(); if (!cards.length) return forge.toast('No cards to export'); const cols = Math.min(10, Math.max(1, cards.length)), rows = Math.ceil(cards.length / cols), cellW = 330, cellH = 450, sheet = document.createElement('canvas'); sheet.width = cols * cellW; sheet.height = rows * cellH; const ctx = sheet.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sheet.width, sheet.height); for (let i = 0; i < cards.length; i++) { const image = await cardImage(cards[i], 120); ctx.drawImage(image, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH); } sheet.toBlob(blob => forge.downloadBlob(blob, `${forge.slug(activeProject().name)}-tts-${cols}x${rows}.png`), 'image/png'); forge.toast('Tabletop Simulator sheet exported'); }
  function exportArena() { const counts = new Map(); activeCards().forEach(card => { const name = forge.plainTextFromMarkup(card.name) || 'Untitled Card'; counts.set(name, (counts.get(name) || 0) + 1); }); const text = [...counts].map(([name,count]) => `${count} ${name}`).join('\n'); forge.downloadBlob(new Blob([text], { type: 'text/plain' }), `${forge.slug(activeProject().name)}-tcg-arena.txt`); }
  function exportNativeDeck() { const project = activeProject(); const payload = { schema: 'mechtitan.deck.v1', exportedAt: now(), project, cards: activeCards(), entries: activeCards().map((card, index) => ({ order: index + 1, cardId: card.id, count: 1 })) }; forge.downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${forge.slug(project.name)}.mechtitan-deck.json`); }
  function pdfEscape(value) { return String(value).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1'); }
  function exportDeckSheet() { const project = activeProject(), cards = activeCards(), textPages = [[]]; cards.forEach((card, index) => { if (textPages.at(-1).length >= 42) textPages.push([]); const result = balance(card); textPages.at(-1).push(`${index + 1}. ${forge.plainTextFromMarkup(card.name) || 'Untitled'} | ${card.cardKind} | C${card.construction}/O${card.operation}/Y${card.cycle} | ${result.total?.toFixed(1) || '-'} BP`); }); const pdf = pdfDocument(({ add, catalog, pages, objects }) => { const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'), pageIds = []; textPages.forEach((lines, pageIndex) => { const commands = [`BT /F1 18 Tf 42 752 Td (${pdfEscape(pageIndex ? `${project.name} - continued` : project.name)}) Tj ET`, 'BT /F1 9 Tf 42 724 Td']; lines.forEach((line, index) => commands.push(`${index ? '0 -16 Td ' : ''}(${pdfEscape(line)}) Tj`)); commands.push('ET'); const content = encode(commands.join('\n')); const contentId = add({ dict: '<< /Length {length} >>', bytes: content }); pageIds.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R >>`)); }); objects[catalog] = `<< /Type /Catalog /Pages ${pages} 0 R >>`; objects[pages] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`; }); forge.downloadBlob(pdf, `${forge.slug(project.name)}-deck-sheet.pdf`); }

  function bindEvents() {
    $('#projectSelect').addEventListener('change', event => { activeProjectId = event.target.value; persistProjects(); const first = activeCards()[0]; if (first) forge.setFormData(first); renderProjects(); });
    ['#projectName','#projectType','#projectDescription','#projectCover'].forEach(selector => $(selector).addEventListener('input', scheduleProjectSave));
    $('#newProjectBtn').addEventListener('click', () => { const name = prompt('Name this set or deck:', 'Untitled Set'); if (!name) return; const type = confirm('Create this as a deck? Choose Cancel for a card set.') ? 'deck' : 'set'; const project = normalizeProject({ name, type }); projects.push(project); activeProjectId = project.id; persistProjects(); renderProjects(); const id = forge.createId(); forge.setFormData({ ...forge.defaults, id, projectId: project.id }); captureProjectRevision('Project created'); });
    $('#newCardBtn').addEventListener('click', () => { const card = forge.getFormData(); if (!card.projectId) forge.setFormData({ ...card, projectId: activeProjectId }, false); });
    $('#deleteBtn').addEventListener('click', () => setTimeout(() => {
      projects.forEach(project => { project.cardIds = project.cardIds.filter(id => forge.getCards().some(card => card.id === id)); });
      let remaining = activeCards();
      if (!remaining.length) {
        const blank = { ...forge.defaults, id: forge.createId(), projectId: activeProjectId };
        activeProject().cardIds.push(blank.id); forge.setCards([...forge.getCards(), blank]); forge.setFormData(blank); remaining = [blank];
      } else if (!remaining.some(card => card.id === forge.getCurrentId())) forge.setFormData(remaining[0]);
      persistProjects(); captureProjectRevision('Cards deleted'); renderProjects();
    }, 0));
    $('#template').addEventListener('change', () => { updateTemplateUi(); forge.render(); }); $('#cardKind').addEventListener('change', updateTemplateUi);
    $('#frontFaceBtn').addEventListener('click', () => {
      if ($('#template').value === 'split-combine') { $('#cardForm').dataset.splitEditorSide = 'left'; updateTemplateUi(); $('#name').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#name').focus(); return; }
      $('#previewFace').value = 'front'; updateTemplateUi(); forge.render();
    });
    $('#backFaceBtn').addEventListener('click', () => {
      if ($('#template').value === 'split-combine') { $('#cardForm').dataset.splitEditorSide = 'right'; updateTemplateUi(); $('#secondaryFaceFields').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#secondaryName').focus(); return; }
      $('#previewFace').value = 'back'; updateTemplateUi(); forge.render();
    });
    $('#cardForm').addEventListener('input', event => { if (event.target.id === 'template' || event.target.id === 'cardKind') updateTemplateUi(); });
    $('#shareProjectBtn').addEventListener('click', () => showDialog('Share card or project', `<p>Public links are unlisted and self-contained. Private links encrypt the contents with a passphrase.</p><div class="share-options"><button id="publicShare" type="button" class="primary">Public project link</button><button id="privateShare" type="button">Private project link</button><button id="publicCardShare" type="button">Public card link</button><button id="privateCardShare" type="button">Private card link</button></div>`));
    $('#studioDialog').addEventListener('click', event => {
      if (event.target.id === 'publicShare') makeShareLink(false); if (event.target.id === 'privateShare') makeShareLink(true);
      if (event.target.id === 'publicCardShare') makeShareLink(false, 'card'); if (event.target.id === 'privateCardShare') makeShareLink(true, 'card');
      if (event.target.matches('[data-history-tab]')) { document.querySelectorAll('[data-history-tab]').forEach(button => button.classList.toggle('active', button === event.target)); $('#cardHistory').hidden = event.target.dataset.historyTab !== 'card'; $('#projectHistory').hidden = event.target.dataset.historyTab !== 'project'; }
      if (event.target.matches('[data-compare-revision]')) { const item = revisionBy(event.target.dataset.revisionType, event.target.dataset.compareRevision); const before = item && JSON.parse(item.snapshot); const current = event.target.dataset.revisionType === 'card' ? forge.getCards().find(card => card.id === forge.getCurrentId()) : { project: activeProject(), cards: activeCards() }; $('#revisionCompare').innerHTML = `<h3>Changes since revision</h3><div class="compare-table-wrap"><table><thead><tr><th>Field</th><th>Earlier</th><th>Current</th></tr></thead><tbody>${compareObjects(before, current)}</tbody></table></div>`; }
      if (event.target.matches('[data-restore-revision]')) restoreRevision(event.target.dataset.revisionType, revisionBy(event.target.dataset.revisionType, event.target.dataset.restoreRevision));
    });
    $('#importLinkBtn').addEventListener('click', () => { const value = prompt('Paste a MechTitan public or private project link:'); if (value) importShareLink(value); });
    $('#projectHistoryBtn').addEventListener('click', showHistory); $('#printPlayBtn').addEventListener('click', showPrintDialog);
    $('#savePresetBtn').addEventListener('click', () => { const name = prompt('Preset name:'); if (!name) return; presets.push({ id: projectId(), name, values: presetData() }); localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); renderPresets(); forge.toast('Style preset saved'); });
    $('#applyPresetBtn').addEventListener('click', () => { const preset = presets.find(item => item.id === $('#presetSelect').value); if (!preset) return forge.toast('Choose a preset first'); forge.setFormData({ ...forge.getFormData(), ...preset.values }); updateTemplateUi(); forge.toast('Preset applied'); });
    $('#deletePresetBtn').addEventListener('click', () => { const id = $('#presetSelect').value; if (!id) return; presets = presets.filter(item => item.id !== id); localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); renderPresets(); });
    $('#exportTtsBtn').addEventListener('click', exportTts); $('#exportArenaBtn').addEventListener('click', exportArena); $('#exportDeckSheetBtn').addEventListener('click', exportDeckSheet); $('#exportNativeDeckBtn').addEventListener('click', exportNativeDeck);
    $('#exportProjectBtn').addEventListener('click', event => { event.stopImmediatePropagation(); const payload = { app: 'MechTitan Card Forge', version: forge.version, exportedAt: now(), projects, activeProjectId, cards: forge.getCards() }; forge.downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${forge.slug(activeProject().name)}-forge-project.json`); forge.toast('All sets and decks exported'); }, true);
    $('#projectFile').addEventListener('change', event => {
      const file = event.target.files?.[0]; if (!file) return; event.stopImmediatePropagation();
      file.text().then(text => {
        const data = JSON.parse(text);
        const incomingCards = Array.isArray(data) ? data : (Array.isArray(data.cards) ? data.cards : []);
        if (!incomingCards.length) throw new Error('No cards found');
        const incomingProjects = Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [normalizeProject({ name: `${file.name.replace(/\.json$/i, '')} (imported)`, cardIds: incomingCards.map(card => card.id) })];
        const projectMap = new Map(incomingProjects.map(project => [project.id, projectId()])); const cardMap = new Map(incomingCards.map(card => [card.id, forge.createId()]));
        incomingProjects.forEach(project => { project.id = projectMap.get(project.id); project.cardIds = project.cardIds.map(id => cardMap.get(id)).filter(Boolean); project.coverCardId = cardMap.get(project.coverCardId) || ''; project.name += ' (imported)'; });
        const cards = incomingCards.map(card => ({ ...card, id: cardMap.get(card.id), projectId: projectMap.get(card.projectId) || incomingProjects[0]?.id }));
        projects.push(...incomingProjects); activeProjectId = incomingProjects[0]?.id || activeProjectId; forge.setCards([...forge.getCards(), ...cards]); persistProjects(); renderProjects(); if (cards[0]) forge.setFormData(cards[0]); forge.toast(`Imported ${incomingProjects.length} projects`);
      }).catch(error => { forge.toast(`Could not import project: ${error.message}`); });
    }, true);
    $('#cardList').addEventListener('dragstart', event => { const card = event.target.closest('.library-card'); if (card) { dragCardId = card.dataset.id; event.dataTransfer.effectAllowed = 'move'; } });
    $('#cardList').addEventListener('dragover', event => { if (event.target.closest('.library-card')) event.preventDefault(); });
    $('#cardList').addEventListener('drop', event => { const target = event.target.closest('.library-card'); if (!target || !dragCardId || target.dataset.id === dragCardId) return; event.preventDefault(); const ids = activeProject().cardIds, from = ids.indexOf(dragCardId), to = ids.indexOf(target.dataset.id); if (from >= 0 && to >= 0) { ids.splice(to, 0, ids.splice(from, 1)[0]); persistProjects(); captureProjectRevision('Card order changed'); renderProjects(); } dragCardId = ''; });
    $('#cardList').addEventListener('click', event => { const button = event.target.closest('[data-move]'); if (!button) return; event.preventDefault(); event.stopImmediatePropagation(); const id = button.closest('.library-card')?.dataset.id, ids = activeProject().cardIds, from = ids.indexOf(id), to = Math.max(0, Math.min(ids.length - 1, from + Number(button.dataset.move))); if (from >= 0 && to !== from) { ids.splice(to, 0, ids.splice(from, 1)[0]); persistProjects(); captureProjectRevision('Card order changed'); renderProjects(); } }, true);
    setupToolbar();
  }

  loadProjects(); bindEvents(); renderPresets(); renderProjects(); updateTemplateUi(); forge.render();
  if (location.hash.startsWith('#share=')) setTimeout(() => { if (confirm('This link contains a shared MechTitan project. Import it into this browser?')) importShareLink(location.hash, true); }, 150);
})();

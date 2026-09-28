// Prototype behaviour for a static Figma snapshot (Moscow and Tyumen, desktop and phone):
// the phone layout's fluid width, card/button hover hooks, carousels, the city switch,
// the burger menu, the paw animation and content try-on from the page's CSV
// (one row per card, columns = card attributes).
// Frame-specific node ids come from window.PROTO, written by _build/post.py from _build/frames.json.
(() => {
  const CFG = window.PROTO || {};
  const node = id => `[data-node-id="${id}"]`;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Asset path -> URL. In the single-file build assets are blob: URLs (window.__RP.url);
  // paths built from parts (paw icons, menu titles) must go through here to be found.
  const asset = p => (window.__RP && window.__RP.url && window.__RP.url[p]) || p;

  // Go to another page. In the single-file build (_build/bundle.mjs) all four pages live in one
  // file and window.__RP swaps them; in the folder they are ordinary links.
  const goTo = (page, replace) => window.__RP ? window.__RP.go(page) : replace ? location.replace(page) : (location.href = page);

  // ---------------------------------------------------------------- desktop ↔ phone
  // A phone opening the desktop page goes to the phone layout (…?desktop keeps the desktop one).
  // The desktop page has no viewport tag, so a phone lays it out 980 px wide and a width media
  // query can't tell it's a phone: look at the screen itself (touch + short side under 768 px).
  const isPhone = () => matchMedia('(max-width: 767px)').matches ||
    (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 768);
  if (CFG.form === 'desktop' && CFG.otherForm && isPhone() && !/[?&]desktop\b/.test(location.search)) {
    goTo(CFG.otherForm, true);
    return;
  }

  // ---------------------------------------------------------------- browser chrome in the frame
  // prototype.css hides the browser chrome drawn into the frame (Desktop/Tablet, Mobile).
  // Blocks placed absolutely from the top of the frame (the banner arrows) move up by its height.
  for (const mock of $$('[data-name="Header group С ГЕО"] > :first-child:not([data-name="Header С ГЕО"])')) {
    mock.style.display = 'block';
    const h = mock.getBoundingClientRect().height;
    mock.style.display = '';
    const frame = $('#root').firstElementChild;
    for (const el of frame.children)
      if (getComputedStyle(el).position === 'absolute') el.style.top = parseFloat(getComputedStyle(el).top) - h + 'px';
  }

  // ---------------------------------------------------------------- desktop: 1240–1440
  // The desktop frame is 1440 wide with a 1224 content column. On narrower screens the side
  // fields shrink (108 px → 8 px at 1240, 0 at 1224): the frame is centred and its edges are cropped.
  // What sits on the edges moves in: the header keeps 16 px to the screen edge, carousel
  // arrows and the chat button keep 8 px. Wider than 1440: white fields on both sides.
  // Below 1224 the page scrolls sideways.
  if (CFG.form === 'desktop') {
    const root = $('#root'), frameW = 1440, content = 1224, minCrop = 0, maxCrop = (frameW - content) / 2;   // at 1240: 8 px fields; down to 1224 the column still fits
    const o = root.getBoundingClientRect().left;   // measured at load, before any crop
    for (const el of $$('#root *')) {
      const r = el.getBoundingClientRect(), L = r.left - o, R = r.right - o;
      if (r.width < 40 || r.width > 100 || r.height < 40 || r.height > 100) continue;
      if (el.closest('[data-name="Header С ГЕО"], [data-name*="Карточка"], [data-name="Топ-10"], .js-edge')) continue;
      if (L < 108 && L > -60) { el.classList.add('js-edge'); el.style.translate = `max(0px, calc(var(--crop) - ${Math.round(L - 8)}px))`; }
      else if (R > frameW - 108 && R < frameW + 60) { el.classList.add('js-edge'); el.style.translate = `min(0px, calc(${Math.round(frameW - R - 8)}px - var(--crop)))`; }
    }
    const fit = () => {
      const W = document.documentElement.clientWidth;
      const crop = Math.min(maxCrop, Math.max(minCrop, (frameW - W) / 2));
      document.documentElement.style.setProperty('--crop', crop + 'px');
      root.style.marginLeft = W >= frameW ? '' : -crop + 'px';
      document.documentElement.classList.toggle('js-cropped', W >= content && W < frameW);
    };
    fit(); addEventListener('resize', fit);
  }

  // ---------------------------------------------------------------- phone: fluid width
  // The phone frame is drawn at 390 px. Here it takes the width of any phone:
  // blocks with a fixed width stretch to the screen, and rows that run past the right
  // edge (cards, Top-10, journal…; clipped by the frame in Figma) become rows you swipe.
  if (CFG.form === 'mobile') {
    document.documentElement.classList.add('js-fluid');
    const frame = $('#root').firstElementChild;
    const inFlow = el => !/absolute|fixed/.test(getComputedStyle(el).position);
    const isRow = el => { const cs = getComputedStyle(el); return cs.display.includes('flex') && !cs.flexDirection.startsWith('column'); };
    const contentBox = el => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return { left: r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), right: r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) };
    };
    const overhang = el => Math.max(el.getBoundingClientRect().right, ...[...el.children].filter(inFlow).map(k => k.getBoundingClientRect().right));
    const swipe = el => {
      const cs = getComputedStyle(el);
      // items sized "fill" in Figma would shrink to the screen once the row is narrowed: keep their design width
      const items = [...el.children].filter(inFlow).map(k => [k, k.getBoundingClientRect().width]);
      items.forEach(([k, w]) => { k.style.flex = `0 0 ${w}px`; k.style.minWidth = '0'; });
      el.classList.add('js-carousel', 'js-swipe');
      Object.assign(el.style, { width: 'auto', maxWidth: 'none', minWidth: '0', alignSelf: 'stretch', flexWrap: 'nowrap', flexShrink: '0',
        paddingRight: parseFloat(cs.paddingRight) ? cs.paddingRight : cs.paddingLeft, scrollPaddingLeft: cs.paddingLeft });
    };
    const walk = parent => {
      const box = contentBox(parent);
      for (const el of parent.children) {
        if (!inFlow(el) || el.classList.contains('js-swipe') || el.dataset.name === 'Header group С ГЕО') continue;   // the header row has its own rules (prototype.css)
        const tooWide = () => { const r = el.getBoundingClientRect(); return r.right > box.right + 1 || r.width > box.right - box.left + 1; };
        if (isRow(el)) {
          // a "wrap" row with hug width in Figma is a single line there (the frame is wide enough)
          // (page blocks only: rows inside cards wrap for real)
          if (el.classList.contains('flex-wrap') && !/(^|\s)w-/.test(el.className) && (parent === frame || parent.parentElement === frame)) el.style.flexWrap = 'nowrap';
          if (tooWide() || overhang(el) > box.right + 1) swipe(el);   // a row that fits keeps its cards as they are
          continue;
        }
        if (tooWide()) {
          // rows of "fill" cards inside it would shrink with it: keep the cards at their design width
          for (const row of [el, ...el.querySelectorAll('*')].filter(r => isRow(r) && r.children.length > 1)) {
            const kids = [...row.children].filter(inFlow);
            if (kids.length > 1 && kids.every(k => parseFloat(getComputedStyle(k).flexGrow) > 0))
              kids.map(k => [k, k.getBoundingClientRect().width]).forEach(([k, w]) => { k.style.flex = `0 0 ${w}px`; k.style.minWidth = '0'; });
          }
          Object.assign(el.style, { width: '100%', maxWidth: '100%', minWidth: '0' });
        }
        walk(el);
      }
    };
    const layout = () => walk(frame);
    layout();
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 150); });
  }

  // ---------------------------------------------------------------- cards
  // Card roots by Figma component / frame. The id column in the CSV is the Figma node id.
  const CARD_TYPES = [
    ['каталог', '[data-name="Карточка каталогов NEW"]'],
    ['жильё', '[data-name="Карточка жилья NEW"]'],
    ['подборка', '[data-name="Вводный блок"]'],
    ['баннер', '[data-name="Баннер внутри каталога"]'],
    ...(CFG.cardTypes || []),   // frame-specific blocks: promo banners, destinations, catalog icons
  ];
  const BADGES = '[data-name="Бейджи NEW"], [data-name="Акции и скидки"]';
  const COLUMNS = ['id', 'раздел', 'тип', 'фото', 'название', 'описание', 'рейтинг', 'бейдж', 'цена', 'старая цена', 'скидка', 'теги', 'кнопка'];
  const MULTI = ['бейдж', 'теги'];   // several values in one cell, separated by " | "
  const SEP = ' | ';

  const visible = el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
  const texts = (root, skip) => $$('p', root).filter(p => !p.querySelector('p') && visible(p) && !(skip && p.closest(skip)));

  function findCards() {
    const cards = [];
    for (const [type, sel] of CARD_TYPES)
      for (const el of $$(sel)) if (!cards.some(c => c.el === el) && el.dataset.nodeId && visible(el)) cards.push({ type, el });
    return cards;
  }

  // Photos repeated across cards (gradient overlays, decorative glows) are not the card's photo.
  let srcCount;
  function photoOf(card) {
    if (!srcCount) {
      srcCount = {};
      $$('img').forEach(i => { const s = i.getAttribute('src'); srcCount[s] = (srcCount[s] || 0) + 1; });
    }
    const imgs = $$('img', card).filter(i => !/\.svg$/.test(i.getAttribute('src')) && !i.closest(BADGES));
    if (!imgs.length) return null;
    const area = i => { const r = i.getBoundingClientRect(); return r.width * r.height; };
    const max = Math.max(...imgs.map(area));
    const big = imgs.filter(i => area(i) >= max * .8);
    const minUse = Math.min(...big.map(i => srcCount[i.getAttribute('src')]));
    return big.filter(i => srcCount[i.getAttribute('src')] === minUse).pop();
  }

  // Map each attribute of a card to its element(s).
  function slotsOf({ type, el }) {
    const s = {};
    const photo = photoOf(el);
    if (photo) s['фото'] = [photo];
    const bottom = $('[data-name="Низ карточки"]', el);
    const priceBtn = $('[data-name="Кнопка"] [data-name="Button v2"]', el) || $('[data-name="Верх карточки"] [data-name="Button v2"], [data-name="Фото+бейджи"] [data-name="Button v2"]', el);
    const info = $('[data-name="Информация"]', el);

    if (type === 'подборка') {
      s['название'] = texts($('[data-name="Заголовок"]', el) || el).slice(0, 1);
      s['описание'] = texts($('[data-name="Текстовый блок"]', el) || el, '[data-name="Заголовок"], [data-name="Кнопка"]').slice(0, 1);
      s['кнопка'] = texts($('[data-name="Кнопка"]', el) || el).slice(0, 1);
    } else if (bottom) {
      s['название'] = texts(bottom, '[data-name="Информация"]').slice(0, 1);
    } else {
      const free = texts(el, BADGES + ', [data-name="Кнопка"], [data-name="Button v2"]');
      s['название'] = free.slice(0, 1);
      if (free[1]) s['описание'] = free.slice(1, 2);
    }
    const badges = $$(BADGES, el).flatMap(b => texts(b)).filter((p, i, a) => a.indexOf(p) === i);
    const rating = badges.filter(p => /^\d+([.,]\d)?$/.test(p.textContent.trim()));
    if (rating.length) s['рейтинг'] = rating.slice(0, 1);
    const other = badges.filter(p => !rating.includes(p));
    if (other.length) s['бейдж'] = other;
    if (priceBtn && type !== 'подборка') {
      const ps = texts(priceBtn);
      s['цена'] = ps.slice(0, 1);
      if (ps[1]) s['старая цена'] = ps.slice(1, 2);
      const disc = $('[data-name="Середина билета"]', el);
      if (disc) s['скидка'] = texts(disc).slice(0, 1);
    }
    if (info) s['теги'] = texts(info);
    for (const k of Object.keys(s)) if (!s[k] || !s[k].length) delete s[k];
    return s;
  }

  function sectionOf(el, headers) {
    let name = 'Шапка';
    for (const h of headers) if (h.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) name = h.text;
    return name;
  }

  const cards = findCards();
  // Section titles: large text outside cards (the journal title is an outlined SVG, so it's added by hand).
  const headers = $$('p').filter(p => parseFloat(getComputedStyle(p).fontSize) >= 24 && visible(p) && !/^\d+$/.test(p.textContent.trim()) && !cards.some(c => c.el.contains(p)))
    .map(p => ({ el: p, text: p.textContent.trim() }));
  const journal = CFG.journalHeader && $(CFG.journalHeader);
  if (journal) headers.push({ el: journal, text: 'RUSSPASS Журнал' });
  headers.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  for (const c of cards) {
    c.slots = slotsOf(c);
    c.section = sectionOf(c.el, headers);
    // hover hooks: photo zoom + title fade is the card spec (component "card", State=Hover),
    // so only catalog and hotel cards get it; icons, banners and promos have their own states
    if (!['каталог', 'жильё'].includes(c.type)) continue;
    c.el.classList.add('js-card');
    const photo = c.slots['фото'] && c.slots['фото'][0];
    if (photo) {
      photo.classList.add('js-photo');
      let box = photo.parentElement;
      while (box && box !== c.el && parseFloat(getComputedStyle(box).borderTopLeftRadius) === 0 && getComputedStyle(box).overflow === 'visible') box = box.parentElement;
      (box || c.el).classList.add('js-photo-box');
    }
    (c.slots['название'] || []).forEach(t => t.classList.add('js-title'));
  }

  // ---------------------------------------------------------------- buttons
  $$('[data-name="Button v2"], [data-name="Button"], [data-name="Кнопка"] > div, [data-name="Chips"]').forEach(b => {
    const cls = b.className;
    if (/bg-\[#(ffcf08|f5f5f5|ebebeb)\]/.test(cls)) b.classList.add('js-btn');
    else if (/border-\[#d9d9d9\]|border-\[#1d1d1d\]/.test(cls) && !/bg-/.test(cls)) b.classList.add('js-btn-outline');
  });
  if (CFG.rubrics) $$(CFG.rubrics).forEach(r => r.classList.add('js-rubric'));
  // Like on a card photo (component «On image red»): a click puts the like on (heart filled #FF3000)
  // and takes it off. Size M has a 20 px heart, L a 24 px one. Likes last until the page reloads.
  $$('[data-name="heart"]').forEach(h => {
    const wrap = h.parentElement;
    if (!wrap || !/rgba\(29, 29, 29/.test(getComputedStyle(wrap).backgroundColor)) return;
    const img = $('img', h);
    wrap.classList.add('js-heart');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button'); wrap.setAttribute('aria-pressed', 'false'); wrap.setAttribute('aria-label', 'В избранное');
    if (img) { img.dataset.off = img.getAttribute('src'); img.dataset.on = asset(`assets/heart-on-${Math.round(h.getBoundingClientRect().width) >= 24 ? 24 : 20}.svg`); }
  });
  // one handler for all hearts, so copies of cards made later (rows with arrows) work too
  const toggleLike = wrap => {
    const liked = wrap.getAttribute('aria-pressed') !== 'true', img = $('[data-name="heart"] img', wrap);
    wrap.setAttribute('aria-pressed', String(liked));
    wrap.setAttribute('aria-label', liked ? 'Убрать из избранного' : 'В избранное');
    if (img) img.src = liked ? img.dataset.on : img.dataset.off;
  };
  document.addEventListener('click', e => { const w = e.target.closest('.js-heart'); if (w) { e.preventDefault(); e.stopPropagation(); toggleLike(w); } });
  document.addEventListener('keydown', e => { const w = e.target.closest && e.target.closest('.js-heart'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleLike(w); } });

  // ---------------------------------------------------------------- carousels
  // Scroll without a scrollbar; arrows bring the first partly hidden item to the start (and loop).
  // A mouse can drag a row sideways (touch and trackpads scroll it natively). A drag longer than a
  // few pixels doesn't count as a click on the card under the pointer.
  function dragToScroll(track) {
    let x0 = 0, s0 = 0, dragging = false, moved = false;
    track.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true; moved = false; x0 = e.clientX; s0 = track.scrollLeft;
    });
    addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - x0;
      if (!moved && Math.abs(dx) > 4) { moved = true; track.classList.add('js-dragging-row'); }
      if (moved) track.scrollLeft = s0 - dx;
    });
    addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        track.classList.remove('js-dragging-row');   // snapping comes back and settles on the nearest card
        track.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
      }
    });
    track.addEventListener('dragstart', e => e.preventDefault());   // images would start a native drag
  }

  function carousel(trackSel, nextSel, prevSel, { autoplay = 0, label = 'элемент', fillRow = false } = {}) {
    const el = x => typeof x === 'string' ? $(x) : x;
    const track = el(trackSel), next = el(nextSel), prev = el(prevSel);
    if (!track || !next || !prev) return;
    track.classList.add('js-carousel');
    // A row with arrows whose cards all fit (Figma draws no cards past the edge): repeat its cards
    // so there is something to scroll. The copies carry no node ids (not in the CSV).
    if (fillRow && track.scrollWidth <= track.clientWidth + 2) {
      const originals = [...track.children];
      for (let k = 0; k < 2; k++) originals.forEach(c => {
        const copy = c.cloneNode(true);
        copy.removeAttribute('data-node-id'); copy.querySelectorAll('[data-node-id]').forEach(e => e.removeAttribute('data-node-id'));
        copy.dataset.copy = ''; copy.setAttribute('aria-hidden', 'true');
        track.appendChild(copy);
      });
    }
    dragToScroll(track);
    [next, prev].forEach(b => {
      const face = b.querySelector('[data-name="Button"]') || b;   // a flipped arrow wraps its button
      face.classList.add('js-btn');
      b.classList.add('js-arrow'); b.setAttribute('role', 'button'); b.tabIndex = 0;
    });
    next.setAttribute('aria-label', `Следующий ${label}`); prev.setAttribute('aria-label', `Предыдущий ${label}`);

    const slides = [...track.children];
    const starts = () => slides.map(s => s.offsetLeft - slides[0].offsetLeft);
    const max = () => track.scrollWidth - track.clientWidth;
    const go = dir => {
      const x = track.scrollLeft, w = track.clientWidth, st = starts();
      let to;
      if (dir > 0) {
        if (x >= max() - 2) to = 0;
        else { const i = slides.findIndex((s, i) => st[i] + s.offsetWidth > x + w + 2); to = i < 0 ? max() : Math.min(st[i], max()); }
      } else {
        if (x <= 2) to = max();
        else to = st.filter(v => v >= x - w - 2)[0] ?? 0;
      }
      track.scrollTo({ left: to, behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    next.addEventListener('click', () => { go(1); restart(); });
    prev.addEventListener('click', () => { go(-1); restart(); });
    [next, prev].forEach(b => b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } }));

    // Optional autoplay; pauses while the pointer is over the track or the arrows, and off-screen.
    let timer = null, hovered = false, onScreen = true;
    function restart() { clearInterval(timer); timer = null; if (autoplay && !hovered && onScreen && !reduceMotion) timer = setInterval(() => go(1), autoplay); }
    if (!autoplay) return;
    [track, next, prev].forEach(el => {
      el.addEventListener('mouseenter', () => { hovered = true; restart(); });
      el.addEventListener('mouseleave', () => { hovered = false; restart(); });
    });
    track.addEventListener('pointerdown', restart);
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; restart(); }).observe(track);
    document.addEventListener('visibilitychange', () => { onScreen = !document.hidden; restart(); });
    restart();
  }
  // frames.json: hero banners (autoplay 5 s)
  for (const c of CFG.carousels || []) carousel(node(c.track), node(c.next), node(c.prev), c);
  // Scroll buttons («Стрелочки»: back, forward) in a section title scroll the card row under it.
  // Any header that gets the buttons in Figma works without extra setup.
  if (CFG.form !== 'mobile') for (const arrows of $$('[data-name="Стрелочки"]')) {
    // the title row holding the arrows: the Header component, or whatever row the arrows sit in
    let header = arrows.closest('[data-name="Header"]') || arrows.parentElement;
    while (header && !header.nextElementSibling) header = header.parentElement;
    const below = header && header.nextElementSibling;
    if (!below || arrows.children.length < 2) continue;
    const isRow = e => { const cs = getComputedStyle(e); return cs.display.includes('flex') && !cs.flexDirection.startsWith('column') && e.children.length > 1; };
    const track = [below, ...below.querySelectorAll('*')].find(isRow);
    if (track) carousel(track, arrows.children[1], arrows.children[0], { label: 'карточки', fillRow: true });
  }

  // Pagination dots under a swipe row: the active one takes the look of the first dot in the design.
  if (CFG.dots) {
    const track = $(node(CFG.dots.track)), dots = CFG.dots.dots && $(node(CFG.dots.dots));
    if (track && dots && dots.children.length) {
      const items = [...dots.children], on = items[0].cloneNode(true), off = (items[1] || items[0]).cloneNode(true);
      const slides = [...track.children];
      const sync = () => {
        const x = track.scrollLeft, i = slides.reduce((b, s, k) => Math.abs(s.offsetLeft - slides[0].offsetLeft - x) < Math.abs(slides[b].offsetLeft - slides[0].offsetLeft - x) ? k : b, 0);
        const active = x >= track.scrollWidth - track.clientWidth - 2 ? items.length - 1 : Math.min(i, items.length - 1);
        dots.replaceChildren(...items.map((_, k) => (k === active ? on : off).cloneNode(true)));
      };
      track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
      sync();
    }
  }

  // ---------------------------------------------------------------- paw («Не знаете, куда поехать?»)
  // The paw holding three cards is a still picture (Figma «Lapka»); only the icons move, in CSS.
  // On each card the icons take turns: slide in along the card, stay, slide out, clipped by
  // the card's outline. Same motion as assets/lapka.riv (the Rive version, kept for reference):
  // in 0.5 s cubic-bezier(.22,1,.36,1), stay 1.5 s, out 0.5 s cubic-bezier(.64,0,.78,0),
  // travel 64 px; a new icon every 2.5 s, 4 icons, a 10 s loop. Each time the block comes into
  // view the loop starts 0.1 s before an icon change, so the motion is seen at once; off-screen
  // it stands still. With «reduce motion» the Figma picture stays as it is.
  (() => {
    const boxes = $$('[data-name="Lapka"]').map(l => l.parentElement);
    if (!boxes.length || reduceMotion) return;
    // Geometry in the 298×200 frame. Card outlines were traced on Lapka.png (298×200), which the
    // frame shows at ×1.075 from (−11.2, −5); icon centres and tilts are the Figma frame's.
    const X = u => -11.2 + 1.075 * u, Y = v => -5 + 1.075 * v;
    const CARDS = [
      { outline: [[47.5, 50], [110, 21], [114.8, 30.2], [114.3, 119.6], [87.5, 132]], centre: [84.19, 66.2], tilt: -21.18, icons: ['museum', 'bed', 'favorite', 'plane'] },
      { outline: [[115, 12], [185, 13.75], [184.8, 37.6], [157.7, 88], [114.3, 88]], centre: [148.9, 49.4], tilt: 0, icons: ['plane', 'museum', 'bed', 'favorite'] },
      { outline: [[192.5, 23.75], [251, 54], [206, 137], [147.5, 106.75]], centre: [202.3, 76.3], tilt: 29.46, icons: ['favorite', 'plane', 'museum', 'bed'] },
    ];
    const SIZE = { museum: [42.5, 42.5], bed: [42.5, 42.5], plane: [39.7, 39.7], favorite: [45.9, 40.9] };   // as drawn in the Figma frame
    const TRAVEL = 64, STEP = 2500, LOOP = 10000, START = 1900;   // ms; the first icons leave their cards at 2.0 s
    const MOVE = [
      { offset: 0, transform: `translateX(${TRAVEL}px)`, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      { offset: .05, transform: 'translateX(0)' },                                                  // in: 0.5 s
      { offset: .2, transform: 'translateX(0)', easing: 'cubic-bezier(.64, 0, .78, 0)' },            // stay: 1.5 s
      { offset: .25, transform: `translateX(${-TRAVEL}px)` },                                         // out: 0.5 s
      { offset: 1, transform: `translateX(${-TRAVEL}px)` },                                           // hidden until its next turn
    ];
    for (const box of boxes) {
      const layer = Object.assign(document.createElement('div'), { className: 'js-paw' });
      const anims = [];
      for (const card of CARDS) {
        const clip = document.createElement('div');
        clip.className = 'js-paw-card';
        clip.style.clipPath = `polygon(${card.outline.map(([u, v]) => `${X(u).toFixed(1)}px ${Y(v).toFixed(1)}px`).join(', ')})`;
        const holder = document.createElement('div');
        holder.className = 'js-paw-holder';
        Object.assign(holder.style, { left: card.centre[0] - 24 + 'px', top: card.centre[1] - 24 + 'px', transform: `rotate(${card.tilt}deg)` });
        card.icons.forEach((name, i) => {
          const [w, h] = SIZE[name];
          const icon = Object.assign(document.createElement('img'), { src: asset(`assets/paw-${name}.svg`), alt: '' });
          Object.assign(icon.style, { width: w + 'px', height: h + 'px', left: (48 - w) / 2 + 'px', top: (48 - h) / 2 + 'px' });
          holder.appendChild(icon);
          const a = icon.animate(MOVE, { duration: LOOP, iterations: Infinity });
          a.pause();
          anims.push([a, i * STEP]);
        });
        clip.appendChild(holder);
        layer.appendChild(clip);
      }
      box.appendChild(layer);
      const at = t => anims.forEach(([a, shift]) => { a.currentTime = ((t - shift) % LOOP + LOOP) % LOOP; });
      at(START);   // before the block is seen: the first icons in place, as in the Figma picture
      box.classList.add('js-paw-on');
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { at(START); anims.forEach(([a]) => a.play()); }
        else anims.forEach(([a]) => a.pause());
      }, { threshold: .6 }).observe(box);
    }
  })();

  // ---------------------------------------------------------------- shared: popups
  // One popup open at a time; a click outside or Esc closes it.
  let openPopup = null;
  function popup(trigger, panel, { onOpen, onClose, place } = {}) {
    const api = {
      open() {
        if (openPopup && openPopup !== api) openPopup.close();
        document.body.appendChild(panel); place && place(); panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true'); openPopup = api; onOpen && onOpen();
      },
      close() {
        if (panel.hidden) return;
        panel.hidden = true; trigger.setAttribute('aria-expanded', 'false');
        if (openPopup === api) openPopup = null; onClose && onClose();
      },
      toggle() { panel.hidden ? api.open() : api.close(); }
    };
    panel.hidden = true;
    Object.assign(trigger, { tabIndex: 0 }); trigger.setAttribute('role', 'button'); trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', e => { e.stopPropagation(); api.toggle(); });
    trigger.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.toggle(); } });
    panel.addEventListener('click', e => e.stopPropagation());
    addEventListener('resize', () => !panel.hidden && place && place());
    return api;
  }
  document.addEventListener('click', () => openPopup && openPopup.close());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPopup) openPopup.close(); });
  const pageX = el => el.getBoundingClientRect().left + scrollX, pageY = el => el.getBoundingClientRect().bottom + scrollY;

  // ---------------------------------------------------------------- city switch (dropdown-city, 147:89769)
  // For now every city leads to the other page: Moscow → Tyumen, Tyumen → Moscow.
  (() => {
    const pin = $('[data-name="marker-pin-01"]');
    const region = pin && pin.parentElement.parentElement;
    if (!region || !CFG.otherCity) return;
    region.classList.add('js-region');
    region.setAttribute('aria-label', `Город: ${CFG.city}. Сменить город`);
    const CITIES = ['Москва', 'Санкт-Петербург', 'Нижний Новгород', 'Казань', 'Тюмень'];
    const panel = document.createElement('div');
    panel.className = 'js-city'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Выбор города');
    panel.innerHTML = `<label class="js-city-search"><img src="${asset('assets/city-search.svg')}" alt="" width="24" height="24">
        <input type="search" placeholder="Другие города и регионы" aria-label="Другие города и регионы"></label>
      <p class="js-city-label">Популярные направления</p>
      <ul>${CITIES.map(c => `<li><a href="${CFG.otherCity}">${c}</a></li>`).join('')}</ul>`;
    const input = $('input', panel), items = $$('li', panel);
    input.addEventListener('input', () => { const q = input.value.trim().toLowerCase(); items.forEach(li => li.hidden = q && !li.textContent.toLowerCase().includes(q)); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') goTo(CFG.otherCity); });
    $$('a', panel).forEach(a => a.addEventListener('click', e => { e.preventDefault(); goTo(CFG.otherCity); }));
    popup(region, panel, {
      place: () => {
        const w = Math.min(320, document.documentElement.clientWidth - 32);
        const left = Math.min(pageX(region), scrollX + document.documentElement.clientWidth - 16 - w);
        Object.assign(panel.style, { width: w + 'px', left: left + 'px', top: pageY(region) + 8 + 'px' });
      },
      onClose: () => { input.value = ''; items.forEach(li => li.hidden = false); }
    });
  })();

  // ---------------------------------------------------------------- burger menu (147:88739 desktop, 147:88832 phone)
  // The burger turns into a cross while the menu is open. Desktop: a card under the header
  // with its own cross; phone: a sheet over the page from under the header, the page stays put.
  (() => {
    const burger = $('[data-name="Burger"]');
    if (!burger) return;
    const icon = $('img', burger), burgerSrc = icon && icon.getAttribute('src');
    const header = burger.closest('[data-name="Header С ГЕО"]') || burger.parentElement;
    const phone = CFG.form === 'mobile';
    burger.setAttribute('aria-label', 'Меню');
    burger.classList.add('js-btn');

    const COLS = [
      ['Что посмотреть', ['Музеи и события', 'Экскурсии', 'Маршруты', 'Речные прогулки', 'Рестораны и кафе', 'Видеоматериалы']],
      ['Куда поехать', ['Жилье', 'Направления', 'Туры']],
      ['Как добраться', ['Авиабилеты', 'Ж/Д билеты', 'Мультимаршруты', 'Аэроэкспресс', 'Карта Тройка', 'Видеоматериалы']],
      ['Может пригодиться', ['Карта', 'Камеры хранения', 'Подарочные сертификаты', 'Конструктор маршрутов', 'Поддержка']],
    ];
    const PROJECTS = [   // outlined titles: Bebas Neue Cyrillic isn't installed
      ['journal', 'RUSSPASS.Журнал', 'Все о событиях Москвы<br>и путешествиях по России', ['Москва', 'Россия', 'Бизнес'], 281],
      ['business', 'RUSSPASS.Бизнес', 'Портал о развитии индустрии<br>туризма и отдыха', ['Mice', 'Проекты', 'Партнеры', 'Календарь'], 270],
      ['expo', 'RUSSPASS.Экспо', 'Открывает мир туристических событий и проектов', [], 250],
    ];
    const title = (file, alt, w, h) => `<span class="js-menu-logo" style="width:${w}px"><img src="${asset(`assets/${file}`)}" alt="${alt}" width="${w}" height="${h}"></span>`;
    const panel = document.createElement('nav');
    panel.className = 'js-menu ' + (phone ? 'js-menu-phone' : 'js-menu-desktop');
    panel.setAttribute('aria-label', 'Меню RUSSPASS');
    panel.innerHTML = `
      <div class="js-menu-top">
        <div class="js-menu-brand">${phone ? title('menu-m-service.svg', 'RUSSPASS.Сервис', 266, 35) : title('menu-service.svg', 'RUSSPASS.Сервис', 355, 46)}
          <p>Ваше идеальное путешествие по России начинается здесь</p></div>
        <div class="js-menu-cols">${COLS.map(([h, items], i) => `<div class="js-menu-col${i === 3 ? ' js-menu-useful' : ''}">
          <p class="js-menu-h">${phone ? h : h.replace(' ', '<br>')}</p>
          <ul>${items.map(t => `<li><a href="#">${t}</a></li>`).join('')}</ul></div>`).join('')}</div>
      </div>
      <div class="js-menu-projects">${PROJECTS.map(([file, alt, text, chips, w]) => `<div class="js-menu-project">
        <div class="js-menu-brand">${title(`menu-${file}.svg`, alt, w, 35)}<p>${text}</p></div>
        ${chips.length ? `<div class="js-menu-chips">${chips.map(c => `<a href="#">${c}</a>`).join('')}</div>` : ''}</div>`).join('')}</div>
      ${phone ? '' : '<button class="js-menu-close" type="button" aria-label="Закрыть меню"><img src="' + asset('assets/menu-close.svg') + '" alt="" width="48" height="48"></button>'}`;
    $$('a[href="#"]', panel).forEach(a => a.addEventListener('click', e => e.preventDefault()));

    const menu = popup(burger, panel, {
      place: () => {
        if (phone) panel.style.top = Math.max(0, header.getBoundingClientRect().bottom) + 'px';
        else {
          const box = $('#root').firstElementChild.getBoundingClientRect();
          Object.assign(panel.style, { left: box.left + scrollX + (box.width - 1224) / 2 + 'px', top: pageY(header) + 8 + 'px' });
        }
      },
      onOpen: () => { if (icon) icon.src = asset('assets/burger-close.svg'); burger.setAttribute('aria-label', 'Закрыть меню'); if (phone) document.documentElement.classList.add('js-lock'); },
      onClose: () => { if (icon) icon.src = burgerSrc; burger.setAttribute('aria-label', 'Меню'); document.documentElement.classList.remove('js-lock'); }
    });
    const close = $('.js-menu-close', panel);
    if (close) close.addEventListener('click', () => menu.close());
  })();

  // ---------------------------------------------------------------- content: CSV export / apply
  // In the single-file build images are inlined; data-asset keeps the original path the CSV uses.
  const assetOf = img => img.dataset.asset || img.getAttribute('src');
  const resolveAsset = v => { const same = $$('img').find(i => i.dataset.asset === v); return same ? same.getAttribute('src') : v; };
  function csvCell(v) { v = String(v ?? ''); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCSV() {
    const rows = [COLUMNS];
    for (const c of cards) {
      const row = { id: c.el.dataset.nodeId, 'раздел': c.section, 'тип': c.type };
      for (const [k, els] of Object.entries(c.slots))
        row[k] = k === 'фото' ? assetOf(els[0]) : els.map(e => e.textContent.trim()).join(MULTI.includes(k) ? SEP : ' ');
      rows.push(COLUMNS.map(k => row[k] ?? ''));
    }
    return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
  }

  function parseCSV(text) {
    text = text.replace(/^[\s\ufeff]+/, '');   // BOM, and the line break after <script> in the embedded copy
    const first = text.split('\n')[0];
    const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map(h => h.trim().toLowerCase());
    return rows.filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }

  // The element to hide when a value is empty: its own item in the tag row / its chip.
  const itemOf = (el, card) => {
    const info = el.closest('[data-name="Информация"]');
    if (info) { let x = el; while (x.parentElement !== info) x = x.parentElement; return x; }
    return el.closest('[data-name="Скидка"]') || el;
  };
  const isSeparator = el => el && !el.textContent.trim() && el.querySelector('img');
  function setHidden(el, hidden) {
    el.style.display = hidden ? 'none' : '';
    const sep = el.previousElementSibling;
    if (isSeparator(sep)) sep.style.display = hidden ? 'none' : '';
  }

  function applyRow(card, row) {
    for (const k of COLUMNS.slice(3)) {
      if (!(k in row)) continue;
      const v = row[k];
      let els = card.slots[k];
      if (!els) continue;
      if (k === 'фото') {
        const img = els[0];
        if (v && assetOf(img) !== v) {
          img.src = resolveAsset(v);
          img.dataset.asset = v;
          Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', left: '0', top: '0', objectFit: 'cover' });
        }
        continue;
      }
      const vals = MULTI.includes(k) ? (v ? v.split('|').map(s => s.trim()) : []) : [v];
      if (k === 'теги' && vals.length > els.length && els.length) {
        // more tags than the design has slots: clone the last item (with its separator)
        const lastItem = itemOf(els[els.length - 1], card);
        const sep = isSeparator(lastItem.previousElementSibling) ? lastItem.previousElementSibling : null;
        while (els.length < vals.length) {
          if (sep) lastItem.parentElement.appendChild(sep.cloneNode(true));
          const clone = itemOf(els[els.length - 1], card).cloneNode(true);
          lastItem.parentElement.appendChild(clone);
          els = [...els, $$('p', clone).pop()];
        }
        card.slots[k] = els;
      }
      els.forEach((el, i) => {
        const val = vals[i] ?? '';
        // untouched values keep Figma's markup (line breaks inside titles are lost in the CSV)
        if (el.textContent.trim() !== val) el.textContent = val;
        setHidden(itemOf(el, card), !val);
        if (k === 'старая цена') {
          // the strike-through is a separate line drawn over the price chip
          const strike = el.parentElement.nextElementSibling;
          if (strike && !strike.textContent.trim() && strike.querySelector('img')) strike.style.display = val ? '' : 'none';
        }
      });
    }
  }

  function applyCSV(text) {
    const rows = parseCSV(text);
    const byId = Object.fromEntries(cards.map(c => [c.el.dataset.nodeId, c]));
    let n = 0, unknown = 0;
    for (const r of rows) { const c = byId[r.id]; if (c) { applyRow(c, r); n++; } else unknown++; }
    return { n, unknown };
  }

  function toast(msg) {
    const t = Object.assign(document.createElement('div'), { className: 'js-toast', textContent: msg });
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  window.RUSSPASS = { exportCSV, applyCSV, cards };

  const embedded = $('#content-csv');
  if (embedded && embedded.textContent.trim()) applyCSV(embedded.textContent);

  // Drop a CSV onto the page to try content without rebuilding. Lasts until reload.
  const hint = Object.assign(document.createElement('div'), { className: 'js-drop-hint', textContent: 'Отпустите CSV — контент подставится в карточки' });
  document.body.appendChild(hint);
  let depth = 0;
  addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { depth++; document.body.classList.add('js-dragging'); } });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('js-dragging'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', async e => {
    e.preventDefault(); depth = 0; document.body.classList.remove('js-dragging');
    const f = [...e.dataTransfer.files].find(f => /\.(csv|txt)$/i.test(f.name));
    if (!f) return toast('Нужен файл .csv');
    const { n, unknown } = applyCSV(await f.text());
    toast(`Подставлено карточек: ${n}` + (unknown ? `, не найдено по id: ${unknown}` : '') + '. Перезагрузка вернёт исходный контент.');
  });
})();

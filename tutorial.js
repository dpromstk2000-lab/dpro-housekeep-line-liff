(() => {
  'use strict';

  const VERSION = 'HOUSEKEEP-TUTORIAL-R3-20260829';
  const STORE_KEY = 'dpro_tutorial_housekeep_v1';
  const SAFE_FILES = new Set(['demo-guide.html', 'index.html', 'member.html', 'staff.html', 'owner.html']);
  const STEPS = Object.freeze([
    { id: 'HK-01', title: 'Guide入口を確認', url: 'demo-guide.html', primary: '#primaryDemoLink', fallbacks: ['#screenGrid', 'main', 'body'], text: '操作ガイドの「まず体験する」入口を確認します。ここではリンクを自動クリックしません。' },
    { id: 'HK-02', title: '依頼カテゴリを確認', url: 'index.html?demo=1', primary: '.type-card[data-type="house_cleaning"]', fallbacks: ['#typeGrid .type-card:first-of-type', '#typeGrid', 'main'], text: '家事代行の依頼カテゴリ選択エリアを確認します。' },
    { id: 'HK-03', title: 'サービス選択を確認', url: 'index.html?demo=1', primary: '#services .service:first-of-type', fallbacks: ['#services', '#serviceGrid', 'main'], text: 'サービス項目の選択エリアを確認します。チェック状態は変更しません。' },
    { id: 'HK-04', title: '希望日を確認', url: 'index.html?demo=1', primary: '#date', fallbacks: ['label[for="date"]', '#time', 'main'], text: '希望日入力の位置を確認します。値は自動変更しません。' },
    { id: 'HK-05', title: '予約内容サマリーを確認', url: 'index.html?demo=1', primary: '#summary', fallbacks: ['.summary', 'main', 'body'], text: '予約前の内容確認エリアを確認します。予約確定は行いません。' },
    { id: 'HK-06', title: '会員の予約状況を確認', url: 'member.html?phone=090-1111-2401', primary: '#member:not(.hidden) .tab[data-filter="active"]', fallbacks: ['#lookup', '#phone', 'main'], text: '会員画面で予約中タブの位置を確認します。検索結果がない場合は検索欄を案内します。', wait: 4000 },
    { id: 'HK-07', title: '進行状況を確認', url: 'member.html?phone=090-1111-2401', primary: '#bookings .booking:first-of-type .progress', fallbacks: ['#bookings', '#lookup', 'main'], text: '予約カードの進行状況エリアを確認します。変更・キャンセル操作は行いません。', wait: 4000 },
    { id: 'HK-08', title: 'スタッフ入口を確認', url: 'staff.html', primary: '#login .login-card', fallbacks: ['#adminCode', 'main', 'body'], text: 'スタッフ画面のログイン入口を確認します。デモモードやログイン送信は実行しません。' },
    { id: 'HK-09', title: '管理者入口を確認', url: 'owner.html', primary: '#login .login-card', fallbacks: ['#adminCode', 'main', 'body'], text: '管理者画面のログイン入口を確認します。デモ自動ログインは使いません。' },
    { id: 'HK-10', title: 'おすすめ導線を振り返る', url: 'demo-guide.html', primary: '#flowGrid', fallbacks: ['#screenGrid', 'main', 'body'], text: '最後におすすめ利用順を確認します。完了後はReplayで最初から再開できます。' }
  ]);

  const $ = (sel, root = document) => root.querySelector(sel);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));
  const fileName = () => location.pathname.split('/').pop() || 'index.html';

  function safeParse(raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  function readState() {
    const raw = safeParse(localStorage.getItem(STORE_KEY));
    const step = Number.isInteger(raw?.step) ? clamp(raw.step, 0, STEPS.length - 1) : 0;
    return {
      step,
      active: Boolean(raw?.active),
      completed: Boolean(raw?.completed),
      skipped: Boolean(raw?.skipped),
      x: Number.isFinite(raw?.x) ? raw.x : null,
      y: Number.isFinite(raw?.y) ? raw.y : null,
      version: VERSION
    };
  }

  function writeState(patch) {
    const next = { ...readState(), ...patch, version: VERSION };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    refreshTrigger();
    return next;
  }

  function routeMatches(step) {
    const u = new URL(step.url, location.href);
    if (fileName() !== (u.pathname.split('/').pop() || 'index.html')) return false;
    const current = new URL(location.href);
    if (fileName() === 'staff.html' || fileName() === 'owner.html') {
      if (current.searchParams.has('demo')) return false;
    }
    for (const [key, value] of u.searchParams.entries()) {
      if (current.searchParams.get(key) !== value) return false;
    }
    return true;
  }

  function navigateTo(step) {
    location.assign(step.url);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity || '1') === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function intersectsViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  async function resolveTarget(step) {
    const selectors = [step.primary, ...step.fallbacks];
    const deadline = Date.now() + (step.wait || 1800);
    while (Date.now() <= deadline) {
      for (const selector of selectors) {
        let el = null;
        try { el = document.querySelector(selector); } catch { el = null; }
        if (!isVisible(el)) continue;
        if (!intersectsViewport(el)) {
          try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); } catch { /* no-op */ }
          await sleep(70);
        }
        if (isVisible(el) && intersectsViewport(el)) return { el, selector };
      }
      await sleep(120);
    }
    return { el: null, selector: null };
  }

  let overlay = null;
  let halo = null;
  let trigger = null;
  let titleNode = null;
  let statusNode = null;
  let bodyNode = null;
  let backBtn = null;
  let nextBtn = null;
  let currentTarget = null;
  let drag = null;

  function addStyles() {
    if ($('#dpro-housekeep-tutorial-style')) return;
    const style = document.createElement('style');
    style.id = 'dpro-housekeep-tutorial-style';
    style.textContent = `
      #dpro-tutorial-trigger{position:fixed;right:12px;bottom:12px;z-index:2147483600;min-height:44px;padding:9px 14px;border:0;border-radius:999px;background:#17635c;color:#fff;font:800 13px/1.2 system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif;box-shadow:0 10px 28px rgba(16,61,57,.26);cursor:pointer}
      #dpro-tutorial-trigger[hidden]{display:none!important}
      #dpro-tutorial-trigger:focus-visible,.dpro-tutorial button:focus-visible,.dpro-tutorial__drag:focus-visible{outline:3px solid #ffbf47;outline-offset:3px}
      .dpro-tutorial{position:fixed;z-index:2147483640;width:min(360px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow:auto;border:1px solid #b8d6d0;border-radius:18px;background:#fff;color:#263c3b;box-shadow:0 22px 60px rgba(10,47,43,.28);font:500 14px/1.55 system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif}
      .dpro-tutorial[hidden]{display:none!important}
      .dpro-tutorial__drag{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #d8e7e3;border-radius:18px 18px 0 0;background:#17635c;color:#fff;cursor:grab;touch-action:none;user-select:none;font-weight:900}
      .dpro-tutorial__drag:active{cursor:grabbing}
      .dpro-tutorial__drag small{opacity:.82;font-size:10px;letter-spacing:.08em}
      .dpro-tutorial__content{padding:15px}
      .dpro-tutorial__status{margin:0 0 5px;color:#247d73;font-weight:900;font-size:11px;letter-spacing:.06em}
      .dpro-tutorial h2{margin:0;color:#173b3a;font-size:19px;line-height:1.35}
      .dpro-tutorial__text{margin:9px 0 0;color:#566c69;font-size:13px}
      .dpro-tutorial__unresolved{margin:10px 0 0;padding:9px 10px;border-radius:10px;background:#fff5e5;color:#725013;font-size:11px;font-weight:750}
      .dpro-tutorial__actions{display:grid;grid-template-columns:auto 1fr 1fr;gap:7px;margin-top:14px}
      .dpro-tutorial__actions button,.dpro-tutorial__minor button{min-height:42px;border-radius:11px;border:1px solid #c9ddd9;background:#fff;color:#17635c;font-weight:900;cursor:pointer}
      .dpro-tutorial__actions .dpro-next{border-color:#17635c;background:#17635c;color:#fff}
      .dpro-tutorial__actions button:disabled{opacity:.45;cursor:not-allowed}
      .dpro-tutorial__minor{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
      .dpro-tutorial__minor button{min-height:34px;padding:5px 9px;font-size:11px}
      .dpro-tutorial-halo{position:fixed;z-index:2147483620;border:3px solid #ffbf47;border-radius:12px;box-shadow:0 0 0 4px rgba(255,191,71,.24),0 0 0 9999px rgba(8,37,34,.13);pointer-events:none;transition:top .12s,left .12s,width .12s,height .12s}
      .dpro-tutorial-halo[hidden]{display:none!important}
      @media(max-width:420px){#dpro-tutorial-trigger{right:8px;bottom:8px}.dpro-tutorial{border-radius:15px}.dpro-tutorial__drag{border-radius:15px 15px 0 0}.dpro-tutorial__actions{grid-template-columns:1fr 1fr}.dpro-tutorial__actions .dpro-close{grid-column:1/-1;order:3}}
      @media(prefers-reduced-motion:reduce){.dpro-tutorial-halo{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function clampOverlay(x, y) {
    if (!overlay) return { x: 8, y: 8 };
    const margin = 8;
    const r = overlay.getBoundingClientRect();
    return {
      x: clamp(x, margin, innerWidth - r.width - margin),
      y: clamp(y, margin, innerHeight - r.height - margin)
    };
  }

  function setOverlayPosition(x, y, persist = false) {
    if (!overlay) return;
    const p = clampOverlay(x, y);
    overlay.style.left = `${Math.round(p.x)}px`;
    overlay.style.top = `${Math.round(p.y)}px`;
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
    if (persist) writeState({ x: p.x, y: p.y });
  }

  function defaultOverlayPosition() {
    if (!overlay) return;
    const state = readState();
    overlay.hidden = false;
    const r = overlay.getBoundingClientRect();
    const x = state.x == null ? Math.max(8, innerWidth - r.width - 16) : state.x;
    const y = state.y == null ? Math.max(8, innerHeight - r.height - 16) : state.y;
    setOverlayPosition(x, y, false);
  }

  function updateHalo() {
    if (!halo || !currentTarget || !isVisible(currentTarget) || !intersectsViewport(currentTarget)) {
      if (halo) halo.hidden = true;
      return;
    }
    const r = currentTarget.getBoundingClientRect();
    const pad = 5;
    const left = clamp(r.left - pad, 0, innerWidth);
    const top = clamp(r.top - pad, 0, innerHeight);
    const right = clamp(r.right + pad, 0, innerWidth);
    const bottom = clamp(r.bottom + pad, 0, innerHeight);
    halo.style.left = `${left}px`;
    halo.style.top = `${top}px`;
    halo.style.width = `${Math.max(0, right - left)}px`;
    halo.style.height = `${Math.max(0, bottom - top)}px`;
    halo.hidden = right <= left || bottom <= top;
  }

  function refreshTrigger() {
    if (!trigger) return;
    const f = fileName();
    const state = readState();
    const shouldShow = f === 'demo-guide.html' || state.completed || state.active || state.step > 0 || !state.completed && localStorage.getItem(STORE_KEY) !== null;
    trigger.hidden = !shouldShow;
    if (state.completed) trigger.textContent = 'チュートリアル Replay';
    else if (localStorage.getItem(STORE_KEY) !== null) trigger.textContent = 'チュートリアル Resume';
    else trigger.textContent = '操作チュートリアル';
  }

  function ensureUi() {
    if (overlay) return;
    addStyles();
    halo = document.createElement('div');
    halo.className = 'dpro-tutorial-halo';
    halo.hidden = true;
    halo.setAttribute('aria-hidden', 'true');
    document.body.appendChild(halo);

    trigger = document.createElement('button');
    trigger.id = 'dpro-tutorial-trigger';
    trigger.type = 'button';
    trigger.addEventListener('click', () => {
      const state = readState();
      if (state.completed) replay();
      else if (localStorage.getItem(STORE_KEY) !== null) resume();
      else start();
    });
    document.body.appendChild(trigger);

    overlay = document.createElement('section');
    overlay.className = 'dpro-tutorial';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'false');
    overlay.setAttribute('aria-labelledby', 'dpro-tutorial-title');
    overlay.innerHTML = `
      <div class="dpro-tutorial__drag" data-dpro-drag-handle tabindex="0" aria-label="チュートリアルカードを移動">
        <span>操作チュートリアル</span><small>DRAG</small>
      </div>
      <div class="dpro-tutorial__content">
        <p class="dpro-tutorial__status"></p>
        <h2 id="dpro-tutorial-title" tabindex="-1"></h2>
        <p class="dpro-tutorial__text"></p>
        <div class="dpro-tutorial__unresolved" hidden>対象が現在表示されていないため、安全なページ上の代替位置を案内しています。ページ操作は自動実行しません。</div>
        <div class="dpro-tutorial__actions">
          <button type="button" class="dpro-back">戻る</button>
          <button type="button" class="dpro-next">次へ</button>
          <button type="button" class="dpro-close">閉じる</button>
        </div>
        <div class="dpro-tutorial__minor">
          <button type="button" class="dpro-replay">Replay</button>
          <button type="button" class="dpro-skip">Skip</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    titleNode = $('#dpro-tutorial-title', overlay);
    statusNode = $('.dpro-tutorial__status', overlay);
    bodyNode = $('.dpro-tutorial__text', overlay);
    backBtn = $('.dpro-back', overlay);
    nextBtn = $('.dpro-next', overlay);

    backBtn.addEventListener('click', () => go(readState().step - 1));
    nextBtn.addEventListener('click', () => {
      const i = readState().step;
      if (i >= STEPS.length - 1) finish(); else go(i + 1);
    });
    $('.dpro-close', overlay).addEventListener('click', close);
    $('.dpro-skip', overlay).addEventListener('click', skip);
    $('.dpro-replay', overlay).addEventListener('click', replay);

    const handle = $('[data-dpro-drag-handle]', overlay);
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const r = overlay.getBoundingClientRect();
      drag = { id: event.pointerId, dx: event.clientX - r.left, dy: event.clientY - r.top };
      try { handle.setPointerCapture(event.pointerId); } catch { /* no-op */ }
      event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      setOverlayPosition(event.clientX - drag.dx, event.clientY - drag.dy, false);
      updateHalo();
      event.preventDefault();
    });
    const endDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const r = overlay.getBoundingClientRect();
      drag = null;
      writeState({ x: r.left, y: r.top });
      try { handle.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    addEventListener('resize', () => {
      if (!overlay.hidden) {
        const r = overlay.getBoundingClientRect();
        setOverlayPosition(r.left, r.top, false);
        updateHalo();
      }
    }, { passive: true });
    addEventListener('orientationchange', () => setTimeout(() => {
      if (!overlay.hidden) {
        const r = overlay.getBoundingClientRect();
        setOverlayPosition(r.left, r.top, false);
        updateHalo();
      }
    }, 80), { passive: true });
    addEventListener('scroll', updateHalo, { passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) {
        event.preventDefault();
        close();
      }
    });
    refreshTrigger();
  }

  async function renderStep(i) {
    const step = STEPS[i];
    if (!routeMatches(step)) {
      navigateTo(step);
      return;
    }
    ensureUi();
    overlay.hidden = false;
    statusNode.textContent = `STEP ${i + 1} / ${STEPS.length} · ${step.id}`;
    titleNode.textContent = step.title;
    bodyNode.textContent = step.text;
    backBtn.disabled = i === 0;
    nextBtn.textContent = i === STEPS.length - 1 ? '完了' : '次へ';
    currentTarget = null;
    if (halo) halo.hidden = true;
    const result = await resolveTarget(step);
    if (readState().step !== i || overlay.hidden) return;
    currentTarget = result.el;
    $('.dpro-tutorial__unresolved', overlay).hidden = Boolean(result.el);
    defaultOverlayPosition();
    updateHalo();
    try { titleNode.focus({ preventScroll: true }); } catch { titleNode.focus(); }
    writeState({ step: i, active: true, completed: false, skipped: false });
  }

  function go(i) {
    const index = clamp(i, 0, STEPS.length - 1);
    writeState({ step: index, active: true, completed: false, skipped: false });
    renderStep(index);
  }

  function start() {
    writeState({ step: 0, active: true, completed: false, skipped: false, x: null, y: null });
    renderStep(0);
  }

  function resume() {
    const state = readState();
    writeState({ active: true, completed: false });
    renderStep(state.step);
  }

  function replay() {
    localStorage.removeItem(STORE_KEY);
    writeState({ step: 0, active: true, completed: false, skipped: false, x: null, y: null });
    renderStep(0);
  }

  function close() {
    if (!overlay) return;
    writeState({ active: false });
    overlay.hidden = true;
    currentTarget = null;
    if (halo) halo.hidden = true;
    refreshTrigger();
    try { trigger.focus({ preventScroll: true }); } catch { /* no-op */ }
  }

  function skip() {
    writeState({ active: false, completed: true, skipped: true });
    if (overlay) overlay.hidden = true;
    currentTarget = null;
    if (halo) halo.hidden = true;
    refreshTrigger();
    try { trigger.focus({ preventScroll: true }); } catch { /* no-op */ }
  }

  function finish() {
    writeState({ active: false, completed: true, skipped: false, step: STEPS.length - 1 });
    if (overlay) overlay.hidden = true;
    currentTarget = null;
    if (halo) halo.hidden = true;
    refreshTrigger();
    try { trigger.focus({ preventScroll: true }); } catch { /* no-op */ }
  }

  function boot() {
    if (!SAFE_FILES.has(fileName())) return;
    if ((fileName() === 'owner.html' || fileName() === 'staff.html') && new URL(location.href).searchParams.has('demo')) return;
    ensureUi();
    const state = readState();
    if (state.active && !state.completed) renderStep(state.step);
  }

  window.DPROHousekeepTutorial = Object.freeze({
    version: VERSION,
    storeKey: STORE_KEY,
    steps: STEPS,
    start,
    resume,
    replay,
    close,
    skip,
    go,
    state: readState
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

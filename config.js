window.DPRO_HOUSEKEEP_CONFIG = Object.freeze({
  API_BASE: 'https://cbknucemarcpbscirzyv.supabase.co/functions/v1/dpro-housekeep-product-ready-v2',
  LEGACY_API_BASE: 'https://dpro-housekeep-line-api.dpromstk2000.workers.dev',
  COMPANY_CODE: 'dpro_housekeep_demo',
  LIFF_ID: '',
  VERSION: 'HOUSEKEEP-8-PR2-FRONTEND-20260824',
  DB_VERSION: 'HOUSEKEEP-DB-PR2-20260824',
  ADAPTER_VERSION: 'HOUSEKEEP-PR2-GATEWAY-20260824',
  WORKER_VERSION: 'HOUSEKEEP-8-PR2-GATEWAY-20260824'
});

(() => {
  'use strict';
  const C = window.DPRO_HOUSEKEEP_CONFIG;
  const nativeFetch = window.fetch.bind(window);
  const API = new URL(C.API_BASE);
  const company = C.COMPANY_CODE;
  const staffKey = 'dpro_housekeep_staff_session_pr2';
  const staffIdKey = 'dpro_housekeep_staff_session_staff_pr2';
  let liffReadyPromise = null;
  let staffIssuePromise = null;

  function jsonError(message, status = 503) {
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }));
  }

  function endpointOf(url) {
    if (url.origin !== API.origin || !url.pathname.startsWith(API.pathname)) return null;
    return url.pathname.slice(API.pathname.length) || '/';
  }

  function bodyStaffId(body) {
    if (!body) return '';
    if (body instanceof FormData) return String(body.get('staff_id') || '');
    if (typeof body === 'string') {
      try { return String(JSON.parse(body)?.staff_id || ''); } catch { return ''; }
    }
    return '';
  }

  async function getLineIdToken() {
    if (!C.LIFF_ID) return null;
    if (!liffReadyPromise) {
      liffReadyPromise = (async () => {
        if (!window.liff) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
            s.async = true;
            s.onload = resolve;
            s.onerror = () => reject(new Error('LIFF SDKを読み込めませんでした'));
            document.head.appendChild(s);
          });
        }
        await window.liff.init({ liffId: C.LIFF_ID });
        return true;
      })();
    }
    await liffReadyPromise;
    return window.liff?.getIDToken?.() || null;
  }

  function requestHasRawLineIdentity(endpoint, url, body) {
    if ((endpoint === '/api/customer/lookup' || endpoint === '/api/booking/lookup') &&
        (url.searchParams.has('line_user_id') || url.searchParams.has('uid'))) return true;
    if (endpoint === '/api/booking/create' && typeof body === 'string') {
      try { return Boolean(JSON.parse(body)?.customer?.line_user_id); } catch { return false; }
    }
    return false;
  }

  async function issueStaffSession(staffId, headers) {
    if (!staffId) throw new Error('スタッフを選択してください。');
    const current = sessionStorage.getItem(staffKey);
    const currentStaff = sessionStorage.getItem(staffIdKey);
    if (current && currentStaff === staffId) return current;
    if (current && currentStaff !== staffId) {
      sessionStorage.removeItem(staffKey);
      sessionStorage.removeItem(staffIdKey);
    }
    if (!staffIssuePromise) {
      staffIssuePromise = (async () => {
        const u = new URL(C.API_BASE + '/api/staff/session');
        u.searchParams.set('company_code', company);
        const auth = headers.get('X-Admin-Key') || headers.get('x-admin-key') || '';
        if (auth) u.searchParams.set('admin_key', auth);
        const h = new Headers({ 'Content-Type': 'application/json' });
        if (auth) h.set('X-Admin-Key', auth);
        const r = await nativeFetch(u, {
          method: 'POST',
          cache: 'no-store',
          headers: h,
          body: JSON.stringify({ staff_id: staffId })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false || !d.session_token) throw new Error(d.error || 'スタッフ認証に失敗しました');
        sessionStorage.setItem(staffKey, d.session_token);
        sessionStorage.setItem(staffIdKey, staffId);
        return d.session_token;
      })().finally(() => { staffIssuePromise = null; });
    }
    return staffIssuePromise;
  }

  window.fetch = async function dproHousekeepSafeFetch(input, init = {}) {
    const sourceUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(sourceUrl, location.href);
    const endpoint = endpointOf(url);
    if (!endpoint) return nativeFetch(input, init);

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined) || {});
    const body = init.body;

    if (requestHasRawLineIdentity(endpoint, url, body)) {
      try {
        const token = await getLineIdToken();
        if (!token) return jsonError('LINE本人確認は契約時のLIFF設定後に利用できます。', 503);
        headers.set('X-Line-ID-Token', token);
      } catch (e) {
        return jsonError(e.message || 'LINE本人確認に失敗しました。', 503);
      }
    }

    if (endpoint.startsWith('/api/staff/') &&
        endpoint !== '/api/staff/session' &&
        endpoint !== '/api/staff/session/revoke' &&
        endpoint !== '/api/staff/capability') {
      const staffId = url.searchParams.get('staff_id') || bodyStaffId(body);
      try {
        const token = await issueStaffSession(staffId, headers);
        headers.set('X-Staff-Session', token);
      } catch (e) {
        return jsonError(e.message || 'スタッフ認証に失敗しました。', 401);
      }
    }

    const next = { ...init, headers };
    let response = await nativeFetch(url, next);

    if (response.status === 401 && endpoint.startsWith('/api/staff/') &&
        endpoint !== '/api/staff/session' && endpoint !== '/api/staff/session/revoke') {
      sessionStorage.removeItem(staffKey);
      sessionStorage.removeItem(staffIdKey);
      const staffId = url.searchParams.get('staff_id') || bodyStaffId(body);
      if (staffId) {
        try {
          const token = await issueStaffSession(staffId, headers);
          const retryHeaders = new Headers(headers);
          retryHeaders.set('X-Staff-Session', token);
          response = await nativeFetch(url, { ...init, headers: retryHeaders });
        } catch { /* original 401 is returned below */ }
      }
    }
    return response;
  };
})();

(() => {
  'use strict';
  const file = location.pathname.split('/').pop() || 'index.html';
  const safePages = new Set(['index.html', 'member.html', 'staff.html', 'owner.html']);
  if (!safePages.has(file)) return;
  if ((file === 'staff.html' || file === 'owner.html') && new URL(location.href).searchParams.has('demo')) return;
  if (document.querySelector('script[data-dpro-housekeep-tutorial]')) return;
  const s = document.createElement('script');
  s.src = 'tutorial.js?v=R3-20260829';
  s.async = false;
  s.dataset.dproHousekeepTutorial = 'R3';
  document.head.appendChild(s);
})();

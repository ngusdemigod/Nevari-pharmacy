const fs = require('fs');

function updateFile(path, transform) {
  const raw = fs.readFileSync(path, 'utf8');
  const normalized = raw.replace(/\r\n/g, '\n');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = transform(normalized);
  if (typeof next !== 'string') throw new Error('Invalid update result for ' + path);
  if (next === normalized) throw new Error('No changes made for ' + path);
  fs.writeFileSync(path, next.replace(/\n/g, eol));
}

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(oldValue)) return text.replace(oldValue, newValue);
  if (text.includes(newValue)) return text;
  throw new Error('Missing target: ' + label);
}

updateFile('NevariAdmin Storefront/app/api/nevari-proxy/route.js', function (text) {
  text = replaceOnce(
    text,
    'function withSoftFailStatus(status, softFail) {\n  return softFail && softFailStatus(status) ? 200 : status;\n}\n',
    'function withSoftFailStatus(status, softFail) {\n  return softFail && softFailStatus(status) ? 200 : status;\n}\n\nfunction effectiveAuthorization(headers) {\n  if (!headers || typeof headers.get !== "function") {\n    return "";\n  }\n  return String(headers.get("authorization") || "").trim();\n}\n',
    'insert effectiveAuthorization'
  );
  text = replaceOnce(
    text,
    '    response = await fetchWithDedupe(targetUrl, init, request.method, request.headers.get("authorization"), softFail);',
    '    response = await fetchWithDedupe(targetUrl, init, request.method, effectiveAuthorization(headers), softFail);',
    'replace dedupe auth source'
  );
  return text;
});

updateFile('NevariAdmin Storefront/lib/swrKeys.js', function (text) {
  return replaceOnce(
    text,
    'export function withBaseUrl(session, params = {}) {\n  return {\n    baseUrl: normalizeBaseUrl(session?.baseUrl),\n    ...params\n  };\n}\n',
    'export function withBaseUrl(session, params = {}) {\n  return {\n    baseUrl: normalizeBaseUrl(session?.baseUrl),\n    ...params\n  };\n}\n\nexport function withSessionCacheScope(session, params = {}) {\n  const scopedParams = { ...params };\n  const userId = String(session?.user?.id || "").trim();\n  if (userId) {\n    scopedParams._viewer = userId;\n  }\n  return withBaseUrl(session, scopedParams);\n}\n',
    'insert withSessionCacheScope'
  );
});

updateFile('NevariAdmin Storefront/app/_customer-dashboard.js', function (text) {
  text = replaceOnce(
    text,
    'import { isProxyAppointmentsKey, isProxyDoctorsKey, isProxyOrdersKey, swrKeys, withBaseUrl } from "../lib/swrKeys";',
    'import { isProxyAppointmentsKey, isProxyDoctorsKey, isProxyOrdersKey, swrKeys, withBaseUrl, withSessionCacheScope } from "../lib/swrKeys";',
    'import withSessionCacheScope'
  );
  text = replaceOnce(
    text,
    '    ? swrKeys.proxy.path("/customer-dashboard/summary", withBaseUrl(session))',
    '    ? swrKeys.proxy.path("/customer-dashboard/summary", withSessionCacheScope(session))',
    'summary key scope'
  );
  text = replaceOnce(
    text,
    "      void globalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withBaseUrl(session)));",
    "      void globalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)));",
    'desktop summary mutate'
  );
  text = replaceOnce(
    text,
    "          swrKeys.proxy.path('/customer-dashboard/summary', withBaseUrl(session)),",
    "          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),",
    'mobile summary mutate key'
  );
  text = replaceOnce(
    text,
    "      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withBaseUrl(session)));",
    "      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)));",
    'mobile summary mutate'
  );
  return text;
});

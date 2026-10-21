/* Guarda la app para que abra rápido y funcione sin internet. Tus datos viven en este navegador (localStorage), no aquí. */
const VERSION = 'diary-v4';
const ARCHIVOS = ['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== RECORDATORIOS).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

/* Alertas de pago: la app guarda en la caché 'fd-reminders' las tarjetas con su día de pago; aquí se avisa
   X días antes, un día antes y el mismo día, una sola vez por aviso. */
const RECORDATORIOS = 'fd-reminders';
async function leer(c, k, def) { const r = await c.match(k); return r ? r.json() : def; }
async function revisarPagos() {
  const c = await caches.open(RECORDATORIOS);
  const { alertDays = 5, cards = [] } = await leer(c, 'reminders.json', {});
  const vistos = await leer(c, 'shown.json', {});
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const avisos = [...new Set([alertDays, 1, 0])].filter(n => n >= 0);
  for (const t of cards) {
    const dia = Number(t.payDay); if (!dia) continue;
    let pago = null;
    for (let i = 0; i < 2 && !pago; i++) {
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() + i + 1, 0).getDate();
      const f = new Date(hoy.getFullYear(), hoy.getMonth() + i, Math.min(dia, fin));
      if (f >= hoy) pago = f;
    }
    const faltan = Math.round((pago - hoy) / 864e5);
    if (!avisos.includes(faltan)) continue;
    const fecha = `${pago.getFullYear()}-${pago.getMonth() + 1}-${pago.getDate()}`, clave = `${t.id}|${fecha}|${faltan}`;
    if (vistos[clave]) continue;
    const nombre = `${t.alias || 'tu tarjeta'}${t.last4 ? ' ·' + t.last4 : ''}`;
    const cuando = faltan === 0 ? 'Hoy' : faltan === 1 ? 'Mañana' : `En ${faltan} días`;
    await self.registration.showNotification(`${cuando} pagas ${nombre}`, {
      body: `Día límite de pago: ${pago.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.`,
      icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: clave, data: { url: './' }
    });
    vistos[clave] = Date.now();
  }
  const limite = Date.now() - 90 * 864e5;
  for (const k of Object.keys(vistos)) if (vistos[k] < limite) delete vistos[k];
  await c.put('shown.json', new Response(JSON.stringify(vistos)));
}
self.addEventListener('message', e => { if (e.data && e.data.type === 'check-reminders') e.waitUntil(revisarPagos()); });
self.addEventListener('periodicsync', e => { if (e.tag === 'fd-pay-reminders') e.waitUntil(revisarPagos()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => 'focus' in x);
    return w ? w.focus() : self.clients.openWindow(new URL('./', self.registration.scope).href);
  }));
});

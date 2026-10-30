// Serves the API handlers from the Vite dev and preview servers, so `npm run dev` runs the whole site.
import { routes } from './handlers.js';

async function handle(req, res, next) {
  const path = req.url.split('?')[0];
  if (!path.startsWith('/api/')) return next();
  const handler = routes[`${req.method} ${path}`];
  if (!handler) { res.statusCode = 404; res.end(); return; }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? '');
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
  });

  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function api() {
  return {
    name: 'markflow-api',
    configureServer(server) { server.middlewares.use(handle); },
    configurePreviewServer(server) { server.middlewares.use(handle); },
  };
}

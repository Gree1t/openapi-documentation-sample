// Synthetic in-memory API fixture for demonstrating source-backed documentation.
// demo-token is a deliberately public fixture value, never a real credential.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const routes = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url)));
export const sampleTask = {
  id: '751e3e2a-d601-487c-b761-0bead19be760',
  title: 'Review API documentation',
  status: 'todo',
  createdAt: '2026-10-21T10:00:00.000Z',
};

export function makeServer() {
  const tasks = new Map([[sampleTask.id, { ...sampleTask }]]);
  return createServer(async (req, res) => {
    const requestId = randomUUID();
    const respond = (status, body, headers = {}) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': requestId,
        ...headers,
      });
      res.end(JSON.stringify(body));
    };
    const fail = (status, code, message, details) => respond(status, {
      error: { code, message, requestId, ...(details ? { details } : {}) },
    });
    const url = new URL(req.url, 'http://localhost');
    const route = routes.find(({ method, path }) =>
      method === req.method && new RegExp(`^${path.replace('{taskId}', '([^/]+)')}$`).test(url.pathname));
    if (!route) return fail(404, 'NOT_FOUND', 'Route not found.');
    if (req.headers.authorization !== 'Bearer demo-token') {
      res.setHeader('www-authenticate', 'Bearer');
      return fail(401, 'UNAUTHORIZED', 'A valid bearer token is required.');
    }
    if (route.operationId === 'listTasks') {
      const limitText = url.searchParams.get('limit') ?? '20';
      const status = url.searchParams.get('status');
      if (!/^\d+$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100) {
        return fail(400, 'INVALID_QUERY', 'limit must be an integer between 1 and 100.');
      }
      if (status !== null && !['todo', 'done'].includes(status)) {
        return fail(400, 'INVALID_QUERY', 'status must be todo or done.');
      }
      const all = [...tasks.values()].filter(task => !status || task.status === status);
      return respond(200, { data: all.slice(0, Number(limitText)), total: all.length });
    }
    if (route.operationId === 'getTask') {
      const id = url.pathname.split('/')[2].toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return fail(400, 'INVALID_ID', 'taskId must be a UUID.');
      }
      const task = tasks.get(id);
      return task ? respond(200, task) : fail(404, 'TASK_NOT_FOUND', 'Task not found.');
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) return fail(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 16384 bytes.');
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { return fail(400, 'INVALID_JSON', 'Request body must contain valid JSON.'); }
    const details = [];
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      details.push({ field: 'body', message: 'Must be an object.' });
    } else {
      if (typeof body.title !== 'string' || !body.title.trim() || Array.from(body.title).length > 120) {
        details.push({ field: 'title', message: 'Use 1–120 characters with at least one non-whitespace character.' });
      }
      if (body.status !== undefined && !['todo', 'done'].includes(body.status)) {
        details.push({ field: 'status', message: 'Must be todo or done.' });
      }
      for (const field of Object.keys(body)) {
        if (!['title', 'status'].includes(field)) details.push({ field, message: 'Unknown field.' });
      }
    }
    if (details.length) return fail(422, 'VALIDATION_FAILED', 'Request body failed validation.', details);
    const task = { id: randomUUID(), title: body.title, status: body.status ?? 'todo', createdAt: new Date().toISOString() };
    tasks.set(task.id, task);
    return respond(201, task, { location: `/tasks/${task.id}` });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = makeServer();
  server.listen(4010, '127.0.0.1', () => {
    console.log('Synthetic demo API: http://127.0.0.1:4010 (in-memory data, resets on restart)');
  });
}

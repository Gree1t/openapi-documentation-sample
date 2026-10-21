import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { makeServer, routes, sampleTask } from '../src/server.mjs';

const spec = YAML.parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
// This sample uses JSON Schema-compatible OAS 3.0 keywords. Preserve the root
// components context when validating an individual response or example schema.
const compile = schema => ajv.compile({ ...schema, components: spec.components });
const resolve = object => object.$ref
  ? object.$ref.slice(2).split('/').reduce((value, key) => value[key.replaceAll('~1', '/').replaceAll('~0', '~')], spec)
  : object;

function checkBody(path, method, status, value) {
  const response = resolve(spec.paths[path][method].responses[String(status)]);
  assert.ok(response, `Documented ${method} ${path} -> ${status}`);
  const validate = compile(response.content['application/json'].schema);
  assert.ok(validate(value), JSON.stringify(validate.errors));
}

test('every implemented route has the same documented operationId, with no invented routes', () => {
  const documented = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).filter(([method]) => ['get', 'post', 'patch', 'delete', 'put'].includes(method))
      .map(([method, operation]) => ({ method: method.toUpperCase(), path, operationId: operation.operationId })));
  assert.deepEqual(documented, routes);
});

test('all references resolve locally and all media examples satisfy their schemas', () => {
  let references = 0;
  let examples = 0;
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'), 'Sample must be self-contained');
      assert.ok(resolve(value), `Resolved ${value.$ref}`);
      references++;
    }
    if (value.schema && Object.hasOwn(value, 'example')) {
      const validate = compile(value.schema);
      assert.ok(validate(value.example), JSON.stringify(validate.errors));
      examples++;
    }
    Object.values(value).forEach(walk);
  };
  walk(spec);
  assert.ok(references >= 10);
  assert.ok(examples >= 10);
});

test('actual local HTTP behavior matches documented success and error contracts', async t => {
  const server = makeServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: 'Bearer demo-token', 'content-type': 'application/json' };
  const request = async (path, method, suffix, expected, options = {}) => {
    const response = await fetch(base + suffix, { method: method.toUpperCase(), headers, ...options });
    const body = await response.json();
    assert.equal(response.status, expected);
    checkBody(path, method, expected, body);
    if (body.error) assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    return { response, body };
  };

  await t.test('lists the documented seed task', async () => {
    const { body } = await request('/tasks', 'get', '/tasks?limit=20&status=todo', 200);
    assert.deepEqual(body, { data: [sampleTask], total: 1 });
  });
  await t.test('creates a task with a default status and retrievable Location', async () => {
    const { body, response } = await request('/tasks', 'post', '/tasks', 201, { body: JSON.stringify({ title: 'New task' }) });
    assert.equal(body.status, 'todo');
    assert.equal(response.headers.get('location'), `/tasks/${body.id}`);
    const fetched = await request('/tasks/{taskId}', 'get', response.headers.get('location'), 200);
    assert.deepEqual(fetched.body, body);
  });
  await t.test('filter and limit retain the pre-limit total', async () => {
    const { body } = await request('/tasks', 'get', '/tasks?limit=1&status=todo', 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.total, 2);
    const empty = await request('/tasks', 'get', '/tasks?status=done', 200);
    assert.deepEqual(empty.body, { data: [], total: 0 });
  });
  await t.test('401 includes an authentication challenge', async () => {
    const { response, body } = await request('/tasks', 'get', '/tasks', 401, { headers: {} });
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  });
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'status=unknown']) {
    await t.test(`rejects invalid query ${query}`, async () => {
      const { body } = await request('/tasks', 'get', `/tasks?${query}`, 400);
      assert.equal(body.error.code, 'INVALID_QUERY');
    });
  }
  await t.test('malformed UUID and missing task have different errors', async () => {
    const bad = await request('/tasks/{taskId}', 'get', '/tasks/not-a-uuid', 400);
    assert.equal(bad.body.error.code, 'INVALID_ID');
    const missing = await request('/tasks/{taskId}', 'get', '/tasks/00000000-0000-4000-8000-000000000001', 404);
    assert.equal(missing.body.error.code, 'TASK_NOT_FOUND');
  });
  await t.test('invalid JSON, media type and oversized body have documented statuses', async () => {
    const bad = await request('/tasks', 'post', '/tasks', 400, { body: '{' });
    assert.equal(bad.body.error.code, 'INVALID_JSON');
    await request('/tasks', 'post', '/tasks', 415, { body: '{}', headers: { authorization: 'Bearer demo-token', 'content-type': 'text/plain' } });
    await request('/tasks', 'post', '/tasks', 413, { body: JSON.stringify({ title: 'x'.repeat(17000) }) });
  });
  for (const body of [{ title: '' }, { title: '   ' }, { title: null }, { title: 'x', unexpected: true }, { title: 'x', status: 'pending' }]) {
    await t.test(`rejects invalid body ${JSON.stringify(body)}`, async () => {
      const result = await request('/tasks', 'post', '/tasks', 422, { body: JSON.stringify(body) });
      assert.equal(result.body.error.code, 'VALIDATION_FAILED');
      assert.ok(result.body.error.details.length);
    });
  }
  await t.test('title length counts Unicode code points consistently with the schema', async () => {
    await request('/tasks', 'post', '/tasks', 201, { body: JSON.stringify({ title: '😀'.repeat(120) }) });
    await request('/tasks', 'post', '/tasks', 422, { body: JSON.stringify({ title: '😀'.repeat(121) }) });
  });
});

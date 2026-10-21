TASK DESK — SYNTHETIC OPENAPI DOCUMENTATION SAMPLE

This fictional API demonstrates a documentation method. It is not a customer's
API, paid delivery, production deployment, or record of prior client work.

Scope: 3 operations, bearer authentication, request/response examples, 6 error
statuses, schema references, route inventory and executable contract checks.

FILES
  openapi.yaml             Complete self-contained OpenAPI 3.0.3 contract
  src/routes.json          Route inventory consumed by the runnable fixture
  src/server.mjs           Actual synthetic endpoint behavior (no runtime deps)
  test/contract.test.mjs    Route parity, references, examples, actual HTTP tests
  redocly.yaml             Recommended lint rules; example/ref errors fail lint
  guide.html               Readable usage guide with curl examples and errors
  validation.txt           Actual validation commands and results
  package-lock.json        Reproducible development dependencies

RUN AND VERIFY (Node.js 22.12+)
  npm ci
  npm run check
  npm start

The local API listens on 127.0.0.1:4010. Data is in memory and resets on restart.
Bearer demo-token is intentionally public and has no access outside this fixture.
Open guide.html in a browser, or run npm run build:docs for generated reference.html.
The generated reference may load renderer assets from Redocly's CDN.

TWO EXAMPLES (while npm start is running)
  curl -i 'http://127.0.0.1:4010/tasks?limit=20&status=todo' \
    -H 'Authorization: Bearer demo-token'

  curl -i -X POST 'http://127.0.0.1:4010/tasks' \
    -H 'Authorization: Bearer demo-token' \
    -H 'Content-Type: application/json' \
    --data '{"title":"Review API documentation","status":"todo"}'

DOCUMENTATION METHOD
1. Inspect source route declarations and handlers; inventory methods and paths.
2. Record actual auth, defaults, bounds, response shapes and error behavior.
3. Write reusable schemas and concrete examples; flag anything unverified.
4. Run Redocly lint and contract checks against the local fixture; retain results.

For a real project, source access, current docs, endpoint count and a safe test
environment must be agreed first. This sample proves only its own 3 operations.
No claim is made about the prospective buyer's routes, access, budget funding,
award, production behavior, or acceptance. No paid service was used.

TOOLS AND REFERENCES
OpenAPI 3.0.3: https://spec.openapis.org/oas/v3.0.3.html
Redocly CLI: https://github.com/Redocly/redocly-cli
AJV: https://ajv.js.org/

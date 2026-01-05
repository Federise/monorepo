We will build a self hosted version of the gateway.

Uses as much as possible from the gateway. Still node, all the same dependencies except cloudflare. Still Exposes the same API (OpenAPI). The same E2E tests should pass. Uses adapter pattern to abstract away actual use of KV/B2. Think about how to facilitate storage. It should look exactly the same as with S3/R2, presigned urls, public and private buckets. Except self hosted (spin up a local S3? https://github.com/Stratoscale/S3?) Public and private buckets. We cannot put too much logic into the frame, though we can put a bit of work in the SDK.

Get it to where we can test this E2E, and integrated. Full browser tests? (Playright, puppeteer, test framework?)

Things to think about: CORS, Authentication, Permissions.
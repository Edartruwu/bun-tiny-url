# bun-tiny-url

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.5. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Examples of how to use the API:

- To create a short link:

```json
curl -X POST http://localhost:1337/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/url/that/needs/shortening"}'
```

- To create a custom short link:

```json
  curl -X POST http://localhost:1337/api/shorten \
   -H "Content-Type: application/json" \
   -d '{"url":"https://example.com/very/long/url/that/needs/shortening", "customCode":"example"}'
```

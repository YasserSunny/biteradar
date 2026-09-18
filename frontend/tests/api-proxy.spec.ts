import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";

let backend: Server;
test.beforeAll(async () => {
  backend = createServer(async (req, res) => {
    if (req.url === "/api/places/photo/test-photo") {
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=2592000, immutable",
      });
      res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      return;
    }
    if (req.url === "/api/search?fail=true") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Search is temporarily unavailable." }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (req.url === "/api/search?slow=true")
      await new Promise((resolve) => setTimeout(resolve, 31_000));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        path: req.url,
        method: req.method,
        body: chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString())
          : null,
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    backend.once("error", reject);
    backend.listen(8100, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  backend?.closeAllConnections();
  await new Promise<void>((resolve) => backend?.close(() => resolve()));
});

test("mobile browser reaches the backend through the frontend origin", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const payload = { dish_name: "Ramen", location: "Marietta" };
  const result = await page.evaluate(async (body) => {
    const response = await fetch("/api/search?source=mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { url: response.url, data: await response.json() };
  }, payload);
  expect(new URL(result.url).origin).toBe(new URL(page.url()).origin);
  expect(result.data).toEqual({
    path: "/api/search?source=mobile",
    method: "POST",
    body: payload,
  });
});

test("proxy preserves backend errors and photo bytes and caching headers", async ({
  request,
}) => {
  const error = await request.post("/api/search?fail=true", { data: {} });
  expect(error.status()).toBe(503);
  expect(await error.json()).toEqual({
    detail: "Search is temporarily unavailable.",
  });
  const photo = await request.get("/api/places/photo/test-photo");
  expect(photo.headers()["content-type"]).toBe("image/jpeg");
  expect(photo.headers()["cache-control"]).toContain("max-age=2592000");
  expect(await photo.body()).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});

test("uncached searches can exceed the default 30-second proxy timeout", async ({
  request,
}) => {
  test.setTimeout(45_000);
  const response = await request.post("/api/search?slow=true", {
    data: { dish_name: "Ramen" },
    timeout: 40_000,
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).body).toEqual({ dish_name: "Ramen" });
});

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const browserPath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9337;
const profile = join("D:\\tmp", `gargantua-edge-${Date.now()}`);
const outputDir = join("D:\\tmp", "gargantua-shots");
mkdirSync(outputDir, { recursive: true });

const browser = spawn(browserPath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--disable-background-networking",
  "--no-first-run",
  "--no-default-browser-check",
  "--use-angle=swiftshader",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function waitForBrowser() {
  for (let i = 0; i < 80; i += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(150);
    }
  }
  throw new Error("Timed out waiting for browser");
}

function createClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const callbacks = new Map();
  const listeners = new Map();
  let id = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && callbacks.has(message.id)) {
      const { resolve, reject } = callbacks.get(message.id);
      callbacks.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result ?? {});
      return;
    }

    for (const handler of listeners.get(message.method) ?? []) handler(message.params ?? {});
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    send(method, params = {}) {
      id += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => callbacks.set(id, { resolve, reject }));
    },
    once(method) {
      return new Promise((resolve) => {
        const handler = (params) => {
          listeners.set(method, (listeners.get(method) ?? []).filter((item) => item !== handler));
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), handler]);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function runViewport(name, viewport) {
  const target = await fetchJson(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent("http://127.0.0.1:5173/")}`,
    { method: "PUT" }
  );
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", viewport);

  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: "http://127.0.0.1:5173/" });
  await loaded;
  await sleep(5000);

  const metrics = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const canvas = document.querySelector("#scene");
        if (!canvas) return resolve({ ok: false, reason: "missing canvas" });
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (!gl) return resolve({ ok: false, reason: "missing webgl context" });
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let active = 0;
        let bright = 0;
        const stride = Math.max(4, Math.floor(pixels.length / 260000) * 4);
        for (let i = 0; i < pixels.length; i += stride) {
          const total = pixels[i] + pixels[i + 1] + pixels[i + 2];
          if (total > 8 || pixels[i + 3] > 8) active += 1;
          if (total > 80) bright += 1;
        }
        resolve({
          ok: width >= ${viewport.width} && height >= ${viewport.height} && active > 1200 && bright > 120,
          width,
          height,
          active,
          bright
        });
      })
    `,
  });

  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = join(outputDir, `${name}.png`);
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  client.close();

  return { name, screenshotPath, metrics: metrics.result.value };
}

try {
  await waitForBrowser();
  const results = [
    await runViewport("desktop", { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false }),
    await runViewport("mobile", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }),
  ];
  console.log(JSON.stringify(results, null, 2));
  if (!results.every((result) => result.metrics?.ok)) process.exitCode = 1;
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}

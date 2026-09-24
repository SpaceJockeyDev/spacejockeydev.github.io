import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT) || 4000;
const pages = new Map([
  ["/", "index.html"],
  ["/bands", "bands.html"],
  ["/bands/", "bands.html"],
  ["/releases", "releases.html"],
  ["/releases/", "releases.html"],
  ["/faq", "faq.html"],
  ["/faq/", "faq.html"],
  ["/tour-dates", "tour-dates.html"],
  ["/tour-dates/", "tour-dates.html"],
]);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const requestedFile = pages.get(pathname) || pathname.replace(/^\/+/, "");
  const filePath = normalize(join(projectRoot, requestedFile));

  if (!filePath.startsWith(projectRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Local site: http://localhost:${port}`);
});
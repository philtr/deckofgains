const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 8000;

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
};

function resolveFilePath(requestUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.endsWith("/")) {
    pathname = `${pathname}index.html`;
  }
  if (pathname === "/") {
    pathname = "/index.html";
  }
  return path.resolve(rootDir, `.${path.normalize(pathname)}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = resolveFilePath(req.url);
    if (!filePath.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
    res.end(data);
  } catch (error) {
    res.statusCode = 404;
    res.end("Not Found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Deck of Gains running at http://127.0.0.1:${port}/index.html`);
});

/**
 * Simple static file server for the browser test page.
 * Run with: deno run --allow-net --allow-read serve.ts
 */

const port = 8080;

// Get the directory where this script is located
const scriptDir = new URL(".", import.meta.url).pathname;

Deno.serve({ port }, async (request: Request) => {
  const url = new URL(request.url);
  let path = url.pathname;

  // Default to index.html
  if (path === "/" || path === "") {
    path = "/index.html";
  }

  // Security: only serve files from the script directory
  const filePath = `${scriptDir}${path.slice(1)}`;

  try {
    const file = await Deno.readFile(filePath);

    // Determine content type
    let contentType = "text/plain";
    if (path.endsWith(".html")) contentType = "text/html";
    else if (path.endsWith(".js")) contentType = "application/javascript";
    else if (path.endsWith(".css")) contentType = "text/css";
    else if (path.endsWith(".json")) contentType = "application/json";

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        // Allow cross-origin for testing
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
});

console.log(`Browser test server running at http://localhost:${port}`);
console.log(`Open http://localhost:${port} in your browser to run tests.`);

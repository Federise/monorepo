// Quick script to dump all KV contents
// Usage: deno run --allow-read --allow-write --unstable-kv kv-dump.ts

const kvPath = Deno.env.get("KV_PATH") || undefined;
const kv = await Deno.openKv(kvPath);

console.log("KV Database Contents:");
console.log("=".repeat(60));

let count = 0;
for await (const entry of kv.list({ prefix: [] })) {
  count++;
  console.log(`\nKey: ${JSON.stringify(entry.key)}`);
  console.log(`Value: ${JSON.stringify(entry.value, null, 2)}`);
}

if (count === 0) {
  console.log("\n(empty - no entries found)");
} else {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total entries: ${count}`);
}

kv.close();

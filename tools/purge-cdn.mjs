// Purges jsDelivr's cache for the branch URL Roam loads in development.
// jsDelivr caches branch references for up to 12 hours; without a purge a
// push would not reach Roam until then.
const branch = process.argv[2] ?? "main";
const base = `gh/bwydoogh/roam-better-excalidraw@${branch}`;
for (const file of ["extension.js", "extension.css"]) {
  const response = await fetch(`https://purge.jsdelivr.net/${base}/${file}`);
  const body = await response.json();
  const ok = response.ok && body.status === "finished";
  console.log(`${ok ? "purged" : "FAILED"} https://cdn.jsdelivr.net/${base}/${file}`);
  if (!ok) process.exitCode = 1;
}

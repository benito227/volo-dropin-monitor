import { readFile, writeFile } from "node:fs/promises";

// Speed-up: skip re-opening a game page when the listing is already saved in
// state.json with the exact same link and card text (including spot count).
// Those listings were already verified and alerted on, so re-checking them
// cannot produce a new alert. New or changed listings still get the full check.
//
// This patch is fail-soft: if it cannot find where to plug in, it logs a
// warning and leaves monitor.mjs unchanged, so the monitor still runs normally.

const path = "monitor.mjs";
const functionMarker = 'async function hasMensAvailability(browser, rawUrl, listingText = "") {\n';
const bodyMarker = "  const url = cleanUrl(rawUrl);\n";

const loader = `// Listings saved by the previous run (already verified and alerted), keyed by game URL.
const KNOWN_VERIFIED_LISTINGS = await (async () => {
  try {
    const saved = JSON.parse(await readFile(STATE_PATH, "utf8"));
    const known = new Map();
    for (const item of Array.isArray(saved.current) ? saved.current : []) {
      if (item?.url && item?.title) known.set(cleanUrl(item.url), item.title);
    }
    return known;
  } catch (error) {
    console.log("Known-listing shortcut disabled for this run: " + (error?.message ?? error));
    return new Map();
  }
})();

`;

const shortcut = `  if (listingText && KNOWN_VERIFIED_LISTINGS.get(url) === listingText) {
    console.log("Reusing earlier verification for unchanged listing: " + url);
    return true;
  }
`;

try {
  let source = await readFile(path, "utf8");

  if (source.includes("KNOWN_VERIFIED_LISTINGS")) {
    console.log("Known-listing shortcut already applied.");
  } else {
    const start = source.indexOf(functionMarker);
    const bodyStart = start >= 0 ? source.indexOf(bodyMarker, start) : -1;
    const nextFunction =
      start >= 0 ? source.indexOf("\nasync function ", start + functionMarker.length) : -1;

    if (start < 0 || bodyStart < 0 || (nextFunction >= 0 && bodyStart > nextFunction)) {
      console.warn(
        "WARNING: Could not locate hasMensAvailability(); running without the known-listing shortcut."
      );
    } else {
      const insertAt = bodyStart + bodyMarker.length;
      source =
        source.slice(0, start) +
        loader +
        source.slice(start, insertAt) +
        shortcut +
        source.slice(insertAt);
      await writeFile(path, source, "utf8");
      console.log("Applied known-listing shortcut (skips re-checking unchanged saved listings).");
    }
  }
} catch (error) {
  console.warn(
    "WARNING: Known-listing shortcut patch failed; running without it: " +
      (error?.message ?? error)
  );
}

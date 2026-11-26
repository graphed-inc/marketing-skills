// Builds public/index.html from ui/: the clay-tables stylesheet + icons (same design system) and this app's CSS, markup and script.
import { readFileSync, writeFileSync } from "node:fs";
const r = (f) => readFileSync(new URL(`./ui/${f}`, import.meta.url), "utf8");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>AI SEO Tool</title>
<style>
${r("clay.css")}
${r("extra.css")}
</style>
</head>
<body>
${r("body.html")}
<script>
${r("icons.js")}
${r("app.js")}
</script>
</body>
</html>
`;
writeFileSync(new URL("./public/index.html", import.meta.url), page);
console.log("public/index.html", page.length, "bytes");

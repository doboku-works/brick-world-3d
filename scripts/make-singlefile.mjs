import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const shareDir = path.join(root, 'share');
const outFile = path.join(shareDir, 'block-world-3d.html');

let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

// Inline CSS links
html = html.replace(
  /<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_, href) => {
    const filePath = path.join(distDir, href.replace(/^\.\//, ''));
    const css = fs.readFileSync(filePath, 'utf8');
    return `<style>\n${css}\n</style>`;
  }
);

// Inline module JS bundle (safe for direct file:// double-click!)
html = html.replace(
  /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_, src) => {
    const filePath = path.join(distDir, src.replace(/^\.\//, ''));
    // Escape closing script tag sequence safely inside JS string literals if any
    const js = fs.readFileSync(filePath, 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script type="module">\n${js}\n</script>`;
  }
);

fs.mkdirSync(shareDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`Built single-file share HTML: ${outFile} (${kb} KB)`);

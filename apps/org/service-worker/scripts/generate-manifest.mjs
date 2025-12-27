import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../../dist');
const OUTPUT_FILE = path.resolve(__dirname, '../src/sw-manifest.json');

/**
 * Generate MD5 hash from file content for cache busting
 */
function generateHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}

/**
 * Convert file path to URL path
 */
function filePathToUrl(filePath, distDir) {
  const relativePath = path.relative(distDir, filePath);
  const urlPath = '/' + relativePath.replace(/\\/g, '/');

  // Convert /index.html to /
  if (urlPath.endsWith('/index.html')) {
    return urlPath.replace('/index.html', '') || '/';
  }

  return urlPath;
}

/**
 * Recursively find all files matching pattern
 */
function findFiles(dir, pattern, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip worker directory and hidden directories
      if (!file.startsWith('_worker') && !file.startsWith('.')) {
        findFiles(filePath, pattern, fileList);
      }
    } else if (pattern.test(file)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Generate the precache manifest
 */
function generateManifest() {
  console.log('Generating service worker manifest...');

  if (!fs.existsSync(DIST_DIR)) {
    console.error('Error: dist directory not found. Run "astro build" first.');
    process.exit(1);
  }

  const manifest = [];

  // 1. Find all HTML pages
  console.log('Scanning HTML pages...');
  const htmlFiles = findFiles(DIST_DIR, /\.html$/);
  htmlFiles.forEach(file => {
    const url = filePathToUrl(file, DIST_DIR);
    const revision = generateHash(file);
    manifest.push({ url, revision });
    console.log(`  - ${url}`);
  });

  // 2. Find all _astro assets (JS and CSS with content hashes)
  console.log('Scanning _astro assets...');
  const astroDir = path.join(DIST_DIR, '_astro');
  if (fs.existsSync(astroDir)) {
    const assetFiles = findFiles(astroDir, /\.(js|css)$/);
    assetFiles.forEach(file => {
      const url = filePathToUrl(file, DIST_DIR);
      const revision = generateHash(file);
      manifest.push({ url, revision });
      console.log(`  - ${url}`);
    });
  }

  // 3. Include service worker itself
  const swPath = path.join(DIST_DIR, 'sw.js');
  if (fs.existsSync(swPath)) {
    manifest.push({
      url: '/sw.js',
      revision: generateHash(swPath)
    });
    console.log('  - /sw.js');
  }

  // 4. Include manifest.json
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    manifest.push({
      url: '/manifest.json',
      revision: generateHash(manifestPath)
    });
    console.log('  - /manifest.json');
  }

  // 5. Include icons and favicon if they exist
  const staticAssets = ['icon-192.png', 'icon-512.png', 'favicon.svg'];
  staticAssets.forEach(assetFile => {
    const assetPath = path.join(DIST_DIR, assetFile);
    if (fs.existsSync(assetPath)) {
      manifest.push({
        url: `/${assetFile}`,
        revision: generateHash(assetPath)
      });
      console.log(`  - /${assetFile}`);
    }
  });

  // Write manifest
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest generated: ${manifest.length} entries`);
  console.log(`Output: ${OUTPUT_FILE}`);
}

// Run
try {
  generateManifest();
} catch (error) {
  console.error('Failed to generate manifest:', error);
  process.exit(1);
}

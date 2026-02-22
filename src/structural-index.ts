/**
 * Structural Index Module
 * Caches file metadata, builds dependency graphs, and clusters related files
 * for more efficient and accurate code analysis.
 *
 * Key features:
 * - File hashing for change detection
 * - Import/export extraction for dependency tracking
 * - Dependency graph construction
 * - File clustering for grouped analysis
 * - Persistent caching to ~/.rlm-analyzer/cache/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import type {
  StructuralIndex,
  StructuralIndexOptions,
  FileIndexEntry,
  DependencyEdge,
  FileCluster,
  FileChunk,
} from './types.js';
import { CODE_EXTENSIONS, INCLUDE_FILENAMES, IGNORE_DIRS, isFlutterGeneratedFile } from './types.js';

/** Current index format version */
const INDEX_VERSION = '1.0.0';

/** Default max file size before chunking (100KB) */
const DEFAULT_MAX_FILE_SIZE = 100_000;

/** Default chunk size (50KB) */
const DEFAULT_CHUNK_SIZE = 50_000;

/** Cache directory */
const CACHE_DIR = path.join(os.homedir(), '.rlm-analyzer', 'cache');

// ============================================================================
// File Hashing
// ============================================================================

/**
 * Calculate SHA-256 hash of file content
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Calculate hash for a project directory (based on file paths and mtimes)
 */
export function hashProject(directory: string): string {
  const absPath = path.resolve(directory);
  return crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 12);
}

// ============================================================================
// Import/Export Extraction
// ============================================================================

/** Import patterns by language */
const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  javascript: [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    /^import\s+(\S+)/gm,
    /^from\s+(\S+)\s+import/gm,
  ],
  go: [
    /import\s+["']([^"']+)["']/g,
    /import\s+\(\s*\n([^)]+)\)/gs,
  ],
  rust: [
    /use\s+([a-zA-Z_][a-zA-Z0-9_:]*)/g,
    /mod\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ],
  java: [
    /import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g,
  ],
  kotlin: [
    /import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g,
  ],
  csharp: [
    /using\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g,
  ],
  ruby: [
    /require\s+['"]([^'"]+)['"]/g,
    /require_relative\s+['"]([^'"]+)['"]/g,
  ],
  php: [
    /use\s+([a-zA-Z_\\][a-zA-Z0-9_\\]*)/g,
    /require(?:_once)?\s+['"]([^'"]+)['"]/g,
    /include(?:_once)?\s+['"]([^'"]+)['"]/g,
  ],
  dart: [
    /import\s+['"]([^'"]+)['"]/g,
    /export\s+['"]([^'"]+)['"]/g,
    /part\s+['"]([^'"]+)['"]/g,
    /part\s+of\s+['"]([^'"]+)['"]/g,
  ],
};

/** Export patterns by language */
const EXPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    /export\s+\{\s*([^}]+)\s*\}/g,
  ],
  javascript: [
    /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    /module\.exports\s*=\s*\{([^}]+)\}/g,
    /exports\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ],
  python: [
    /^(?:class|def)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
    /__all__\s*=\s*\[([^\]]+)\]/g,
  ],
  go: [
    /^func\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^type\s+([A-Z][a-zA-Z0-9_]*)/gm,
  ],
  rust: [
    /pub\s+(?:fn|struct|enum|trait|type|const|static)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ],
  java: [
    /public\s+(?:class|interface|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ],
  kotlin: [
    /^(?:class|interface|object|enum\s+class|sealed\s+class|data\s+class)\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^fun\s+(?:<[^>]+>\s+)?(?:[\w.]+\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gm,
  ],
  dart: [
    /^(?:abstract\s+|sealed\s+|base\s+|final\s+)?class\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^mixin\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^enum\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^extension\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^typedef\s+([A-Z][a-zA-Z0-9_]*)/gm,
    /^(?:void|int|double|String|bool|Future|Stream|List|Map|Set|dynamic|Widget|\w+(?:<[^>]*>)?\??)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[(<]/gm,
  ],
};

/**
 * Get language from file extension
 */
function getLanguage(ext: string): string {
  const langMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.pyw': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.dart': 'dart',
    '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'java',
    '.cs': 'csharp', '.fs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
  };
  return langMap[ext] || 'unknown';
}

/**
 * Extract imports from file content
 */
export function extractImports(content: string, ext: string): string[] {
  const lang = getLanguage(ext);
  const patterns = IMPORT_PATTERNS[lang] || IMPORT_PATTERNS.typescript;
  const imports: Set<string> = new Set();

  for (const pattern of patterns) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const imported = match[1]?.trim();
      if (imported) {
        // Handle multiple imports in one statement
        if (imported.includes(',')) {
          imported.split(',').forEach(i => imports.add(i.trim()));
        } else {
          imports.add(imported);
        }
      }
    }
  }

  return Array.from(imports);
}

/**
 * Extract exports from file content
 */
export function extractExports(content: string, ext: string): string[] {
  const lang = getLanguage(ext);
  const patterns = EXPORT_PATTERNS[lang] || EXPORT_PATTERNS.typescript;
  const exports: Set<string> = new Set();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const exported = match[1]?.trim();
      if (exported) {
        if (exported.includes(',')) {
          exported.split(',').forEach(e => {
            const name = e.trim().split(/\s+as\s+/)[0].trim();
            if (name) exports.add(name);
          });
        } else {
          exports.add(exported);
        }
      }
    }
  }

  return Array.from(exports);
}

// ============================================================================
// Large File Chunking
// ============================================================================

/**
 * Check if a file needs chunking
 */
export function needsChunking(size: number, maxSize: number = DEFAULT_MAX_FILE_SIZE): boolean {
  return size > maxSize;
}

/**
 * Chunk a large file by lines
 */
export function chunkFile(
  content: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): FileChunk[] {
  const lines = content.split('\n');
  const chunks: FileChunk[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineSize = line.length + 1; // +1 for newline

    if (currentSize + lineSize > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        index: chunks.length,
        total: 0, // Will be updated
        startLine,
        endLine: i - 1,
        content: currentChunk.join('\n'),
      });
      currentChunk = [];
      currentSize = 0;
      startLine = i;
    }

    currentChunk.push(line);
    currentSize += lineSize;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunks.length,
      total: 0,
      startLine,
      endLine: lines.length - 1,
      content: currentChunk.join('\n'),
    });
  }

  // Update total count
  const total = chunks.length;
  chunks.forEach(chunk => { chunk.total = total; });

  return chunks;
}

// ============================================================================
// Dependency Graph
// ============================================================================

/**
 * Resolve an import path to a file path
 */
function resolveImportPath(
  importPath: string,
  sourceFile: string,
  fileIndex: Record<string, FileIndexEntry>
): string | null {
  // Skip external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const sourceDir = path.dirname(sourceFile);
  let resolved = path.join(sourceDir, importPath);

  // Try common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.dart', '', '/index.ts', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (fileIndex[candidate]) {
      return candidate;
    }
  }

  return null;
}

/**
 * Build dependency graph from file index
 */
export function buildDependencyGraph(
  fileIndex: Record<string, FileIndexEntry>
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (const [filePath, entry] of Object.entries(fileIndex)) {
    for (const imp of entry.imports) {
      const resolved = resolveImportPath(imp, filePath, fileIndex);
      if (resolved) {
        edges.push({
          from: filePath,
          to: resolved,
          type: 'import',
        });
      }
    }
  }

  return edges;
}

// ============================================================================
// File Clustering
// ============================================================================

/**
 * Find connected components in the dependency graph
 */
function findConnectedComponents(
  files: string[],
  edges: DependencyEdge[]
): string[][] {
  const adjacency: Map<string, Set<string>> = new Map();

  // Build undirected adjacency list
  for (const file of files) {
    adjacency.set(file, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  function dfs(node: string, component: string[]): void {
    if (visited.has(node)) return;
    visited.add(node);
    component.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      dfs(neighbor, component);
    }
  }

  for (const file of files) {
    if (!visited.has(file)) {
      const component: string[] = [];
      dfs(file, component);
      if (component.length > 0) {
        components.push(component);
      }
    }
  }

  return components;
}

/**
 * Detect cluster type based on file paths and content
 */
function detectClusterType(files: string[]): FileCluster['type'] {
  const patterns = {
    test: [/test/, /spec/, /__tests__/],
    config: [/config/, /\.config\./, /settings/],
    utility: [/util/, /helper/, /lib/, /common/],
  };

  for (const file of files) {
    const lower = file.toLowerCase();
    if (patterns.test.some(p => p.test(lower))) return 'test';
    if (patterns.config.some(p => p.test(lower))) return 'config';
    if (patterns.utility.some(p => p.test(lower))) return 'utility';
  }

  return files.length > 5 ? 'feature' : 'module';
}

/**
 * Find entry points in a cluster (files that are imported but don't import much)
 */
function findEntryPoints(
  clusterFiles: string[],
  edges: DependencyEdge[]
): string[] {
  const clusterSet = new Set(clusterFiles);
  const importedBy: Map<string, number> = new Map();
  const imports: Map<string, number> = new Map();

  for (const file of clusterFiles) {
    importedBy.set(file, 0);
    imports.set(file, 0);
  }

  for (const edge of edges) {
    if (clusterSet.has(edge.from) && clusterSet.has(edge.to)) {
      importedBy.set(edge.to, (importedBy.get(edge.to) || 0) + 1);
      imports.set(edge.from, (imports.get(edge.from) || 0) + 1);
    }
  }

  // Entry points: high imports count, low imported-by count
  return clusterFiles
    .filter(f => (importedBy.get(f) || 0) > 0 || clusterFiles.length === 1)
    .sort((a, b) => {
      const scoreA = (importedBy.get(a) || 0) - (imports.get(a) || 0);
      const scoreB = (importedBy.get(b) || 0) - (imports.get(b) || 0);
      return scoreB - scoreA;
    })
    .slice(0, 3);
}

/**
 * Build file clusters from dependency graph
 */
export function buildClusters(
  fileIndex: Record<string, FileIndexEntry>,
  edges: DependencyEdge[]
): FileCluster[] {
  const files = Object.keys(fileIndex);
  const components = findConnectedComponents(files, edges);

  return components.map((component, i) => {
    const totalSize = component.reduce(
      (sum, f) => sum + (fileIndex[f]?.size || 0),
      0
    );

    return {
      id: `cluster-${i}`,
      files: component,
      entryPoints: findEntryPoints(component, edges),
      totalSize,
      type: detectClusterType(component),
    };
  });
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Get cache path for a project
 */
export function getCachePath(directory: string): string {
  const projectHash = hashProject(directory);
  return path.join(CACHE_DIR, projectHash, 'index.json');
}

/**
 * Load cached index if valid
 */
export function loadCachedIndex(directory: string): StructuralIndex | null {
  const cachePath = getCachePath(directory);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(cachePath, 'utf-8');
    const index = JSON.parse(data) as StructuralIndex;

    // Validate version
    if (index.version !== INDEX_VERSION) {
      return null;
    }

    // Check if project root matches
    if (path.resolve(index.projectRoot) !== path.resolve(directory)) {
      return null;
    }

    return index;
  } catch {
    return null;
  }
}

/**
 * Save index to cache
 */
export function saveIndexToCache(index: StructuralIndex): void {
  const cachePath = getCachePath(index.projectRoot);
  const cacheDir = path.dirname(cachePath);

  // Ensure cache directory exists
  fs.mkdirSync(cacheDir, { recursive: true });

  fs.writeFileSync(cachePath, JSON.stringify(index, null, 2));
}

/**
 * Clear cache for a project
 */
export function clearCache(directory: string): void {
  const cachePath = getCachePath(directory);
  const cacheDir = path.dirname(cachePath);

  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true });
  }
}

// ============================================================================
// Main Indexing Function
// ============================================================================

/**
 * Check if a file should be included
 */
function shouldIncludeFile(filePath: string, fileName: string): boolean {
  // Skip Flutter/Dart generated files (noisy, auto-generated code)
  if (isFlutterGeneratedFile(fileName)) {
    return false;
  }

  // Check by filename first
  if (INCLUDE_FILENAMES.includes(fileName)) {
    return true;
  }

  // Check by extension
  const ext = path.extname(filePath);
  return CODE_EXTENSIONS.some(e => ext === e || filePath.endsWith(e));
}

/**
 * Build or update structural index for a directory
 */
export async function buildStructuralIndex(
  directory: string,
  options: StructuralIndexOptions = {}
): Promise<StructuralIndex> {
  const {
    force = false,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    chunkSize = DEFAULT_CHUNK_SIZE,
    buildDependencyGraph: buildDeps = true,
    enableClustering = true,
    verbose = false,
  } = options;

  const absDir = path.resolve(directory);

  // Try to load cached index
  if (!force) {
    const cached = loadCachedIndex(absDir);
    if (cached) {
      // Validate cache by checking a sample of files
      const sampleFiles = Object.keys(cached.files).slice(0, 10);
      let cacheValid = true;

      for (const file of sampleFiles) {
        const fullPath = path.join(absDir, file);
        if (!fs.existsSync(fullPath)) {
          cacheValid = false;
          break;
        }
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs > cached.files[file].mtime) {
          cacheValid = false;
          break;
        }
      }

      if (cacheValid) {
        if (verbose) {
          console.log('[Index] Using cached structural index');
        }
        return cached;
      }
    }
  }

  if (verbose) {
    console.log('[Index] Building structural index...');
  }

  const fileIndex: Record<string, FileIndexEntry> = {};
  const languages: Set<string> = new Set();
  let totalSize = 0;

  // Walk directory
  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(absDir, fullPath);

        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile() && shouldIncludeFile(relativePath, entry.name)) {
          try {
            const stats = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const ext = path.extname(entry.name);
            const lang = getLanguage(ext);

            if (lang !== 'unknown') {
              languages.add(lang);
            }

            const isLarge = needsChunking(stats.size, maxFileSize);

            fileIndex[relativePath] = {
              path: relativePath,
              hash: hashContent(content),
              size: stats.size,
              mtime: stats.mtimeMs,
              imports: extractImports(content, ext),
              exports: extractExports(content, ext),
              extension: ext,
              chunked: isLarge,
              chunkCount: isLarge ? chunkFile(content, chunkSize).length : undefined,
            };

            totalSize += stats.size;
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(absDir);

  // Build dependency graph
  const dependencies = buildDeps ? buildDependencyGraph(fileIndex) : [];

  // Build clusters
  const clusters = enableClustering ? buildClusters(fileIndex, dependencies) : [];

  // Detect frameworks and package manager
  const metadata = {
    fileCount: Object.keys(fileIndex).length,
    totalSize,
    languages: Array.from(languages),
    frameworks: detectFrameworks(fileIndex),
    packageManager: detectPackageManager(absDir),
  };

  const index: StructuralIndex = {
    version: INDEX_VERSION,
    projectRoot: absDir,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: fileIndex,
    dependencies,
    clusters,
    metadata,
  };

  // Save to cache
  saveIndexToCache(index);

  if (verbose) {
    console.log(`[Index] Indexed ${metadata.fileCount} files, ${clusters.length} clusters`);
  }

  return index;
}

/**
 * Detect frameworks from file index
 */
function detectFrameworks(fileIndex: Record<string, FileIndexEntry>): string[] {
  const frameworks: Set<string> = new Set();
  const files = Object.keys(fileIndex);

  const patterns: [RegExp, string][] = [
    [/next\.config/, 'Next.js'],
    [/nuxt\.config/, 'Nuxt'],
    [/angular\.json/, 'Angular'],
    [/vue\.config|\.vue$/, 'Vue'],
    [/svelte\.config|\.svelte$/, 'Svelte'],
    [/astro\.config|\.astro$/, 'Astro'],
    [/remix\.config/, 'Remix'],
    [/express/, 'Express'],
    [/fastify/, 'Fastify'],
    [/nest-cli\.json/, 'NestJS'],
    [/django|wsgi\.py/, 'Django'],
    [/flask/, 'Flask'],
    [/fastapi/, 'FastAPI'],
    [/rails/, 'Rails'],
    [/spring/, 'Spring'],
    [/\.prisma$/, 'Prisma'],
    [/pubspec\.yaml/, 'Flutter'],
    [/\.dart$/, 'Dart'],
  ];

  for (const file of files) {
    for (const [pattern, name] of patterns) {
      if (pattern.test(file)) {
        frameworks.add(name);
      }
    }
  }

  return Array.from(frameworks);
}

/**
 * Detect package manager
 */
function detectPackageManager(dir: string): StructuralIndex['metadata']['packageManager'] {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return 'cargo';
  if (fs.existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'pip';
  if (fs.existsSync(path.join(dir, 'pom.xml'))) return 'maven';
  if (fs.existsSync(path.join(dir, 'build.gradle')) || fs.existsSync(path.join(dir, 'build.gradle.kts'))) return 'gradle';
  if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) return 'pub';
  return undefined;
}

// ============================================================================
// Incremental Update
// ============================================================================

/**
 * Update index with changed files only
 */
export async function updateStructuralIndex(
  directory: string,
  options: StructuralIndexOptions = {}
): Promise<{ index: StructuralIndex; changedFiles: string[] }> {
  const absDir = path.resolve(directory);
  const cached = loadCachedIndex(absDir);

  if (!cached) {
    const index = await buildStructuralIndex(directory, options);
    return { index, changedFiles: Object.keys(index.files) };
  }

  const changedFiles: string[] = [];
  const { maxFileSize = DEFAULT_MAX_FILE_SIZE, chunkSize = DEFAULT_CHUNK_SIZE } = options;

  // Check each cached file for changes
  for (const [relativePath, entry] of Object.entries(cached.files)) {
    const fullPath = path.join(absDir, relativePath);

    if (!fs.existsSync(fullPath)) {
      // File deleted
      delete cached.files[relativePath];
      changedFiles.push(relativePath);
    } else {
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs > entry.mtime) {
        // File modified
        const content = fs.readFileSync(fullPath, 'utf-8');
        const ext = path.extname(relativePath);
        const isLarge = needsChunking(stats.size, maxFileSize);

        cached.files[relativePath] = {
          ...entry,
          hash: hashContent(content),
          size: stats.size,
          mtime: stats.mtimeMs,
          imports: extractImports(content, ext),
          exports: extractExports(content, ext),
          chunked: isLarge,
          chunkCount: isLarge ? chunkFile(content, chunkSize).length : undefined,
        };
        changedFiles.push(relativePath);
      }
    }
  }

  // Rebuild dependency graph if files changed
  if (changedFiles.length > 0) {
    cached.dependencies = buildDependencyGraph(cached.files);
    cached.clusters = buildClusters(cached.files, cached.dependencies);
    cached.updatedAt = Date.now();
    cached.metadata.fileCount = Object.keys(cached.files).length;

    saveIndexToCache(cached);
  }

  return { index: cached, changedFiles };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get files that depend on a given file
 */
export function getDependents(
  index: StructuralIndex,
  filePath: string
): string[] {
  return index.dependencies
    .filter(e => e.to === filePath)
    .map(e => e.from);
}

/**
 * Get files that a given file depends on
 */
export function getDependencies(
  index: StructuralIndex,
  filePath: string
): string[] {
  return index.dependencies
    .filter(e => e.from === filePath)
    .map(e => e.to);
}

/**
 * Get the cluster containing a file
 */
export function getFileCluster(
  index: StructuralIndex,
  filePath: string
): FileCluster | undefined {
  return index.clusters.find(c => c.files.includes(filePath));
}

/**
 * Get files ordered by analysis priority (entry points first)
 */
export function getAnalysisPriority(index: StructuralIndex): string[] {
  const priority: string[] = [];
  const added = new Set<string>();

  // Add cluster entry points first
  for (const cluster of index.clusters) {
    for (const entry of cluster.entryPoints) {
      if (!added.has(entry)) {
        priority.push(entry);
        added.add(entry);
      }
    }
  }

  // Add remaining files
  for (const file of Object.keys(index.files)) {
    if (!added.has(file)) {
      priority.push(file);
      added.add(file);
    }
  }

  return priority;
}

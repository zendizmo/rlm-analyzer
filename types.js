/**
 * RLM Analyzer Type Definitions
 * Based on MIT CSAIL Recursive Language Models research (arXiv:2512.24601v1)
 */
import { getDefaultModel } from './models.js';
/** Markers for extracting final answers */
export const FINAL_MARKERS = {
    FINAL: 'FINAL(',
    FINAL_VAR: 'FINAL_VAR(',
};
/**
 * Get default RLM configuration with dynamically resolved models
 * This function respects the model priority chain:
 * 1. Environment variables (RLM_DEFAULT_MODEL)
 * 2. Config file (~/.rlm-analyzer/config.json)
 * 3. Built-in defaults
 *
 * @param modelOverride - Optional model to use instead of resolved default
 * @returns RLMConfig with resolved model settings
 */
export function getDefaultRLMConfig(modelOverride) {
    const model = modelOverride || getDefaultModel();
    return {
        rootModel: model,
        subModel: model,
        maxRecursionDepth: 3,
        maxTurns: 10,
        timeoutMs: 300000, // 5 minutes
        maxSubCalls: 15,
        mode: 'code-analysis',
    };
}
/**
 * @deprecated Use `getDefaultRLMConfig()` instead for dynamic model resolution.
 * This static constant uses hardcoded model IDs and won't respect
 * environment variables or config file settings.
 */
export const DEFAULT_CONFIG = {
    rootModel: 'gemini-3-flash-preview',
    subModel: 'gemini-3-flash-preview',
    maxRecursionDepth: 3,
    maxTurns: 10,
    timeoutMs: 300000, // 5 minutes
    maxSubCalls: 15,
    mode: 'code-analysis',
};
/** File extensions to analyze by default */
export const CODE_EXTENSIONS = [
    // JavaScript/TypeScript
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    // Python
    '.py', '.pyw',
    // JVM
    '.java', '.kt', '.scala', '.groovy',
    // Systems
    '.go', '.rs', '.c', '.cpp', '.cc', '.h', '.hpp',
    // .NET
    '.cs', '.fs', '.vb',
    // Scripting
    '.rb', '.php', '.lua', '.pl', '.pm',
    // Mobile / Flutter
    '.dart', '.swift', '.m', '.mm',
    // Android (Kotlin DSL)
    '.kts',
    // Frontend frameworks
    '.vue', '.svelte', '.astro',
    // Data/Config/i18n
    '.json', '.yaml', '.yml', '.toml', '.xml', '.arb',
    // Documentation
    '.md', '.mdx', '.rst',
    // Database
    '.sql', '.prisma',
    // API/Schema definitions
    '.graphql', '.gql', '.proto',
    // Infrastructure as Code
    '.tf', '.tfvars', '.hcl',
    // Shell/Scripts
    '.sh', '.bash', '.zsh', '.ps1',
    // Container/DevOps
    '.dockerfile',
    // Environment templates (not .env itself for security)
    '.env.example', '.env.sample', '.env.template',
];
/** File names to include regardless of extension */
export const INCLUDE_FILENAMES = [
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    'Makefile',
    'Jenkinsfile',
    'Vagrantfile',
    '.gitignore',
    '.dockerignore',
    '.eslintrc',
    '.prettierrc',
    'tsconfig.json',
    'package.json',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'CMakeLists.txt',
    // Flutter / Dart
    'pubspec.yaml',
    'analysis_options.yaml',
    'l10n.yaml',
    // Android
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
    'gradle.properties',
    'AndroidManifest.xml',
    // iOS
    'Podfile',
    'Info.plist',
    'Gemfile',
];
/** Directories to ignore by default */
export const IGNORE_DIRS = [
    'node_modules',
    'dist',
    'build',
    '.git',
    '.svn',
    'coverage',
    '__pycache__',
    '.pytest_cache',
    'venv',
    '.venv',
    'env',
    '.env',
    'vendor',
    'target',
    '.next',
    '.nuxt',
    '.output',
    '.cache',
    // Flutter / Dart
    '.dart_tool',
    '.symlinks',
    'ephemeral',
    '.pub-cache',
    '.fvm',
    'flutter_gen',
    // iOS
    'Pods',
    'DerivedData',
    'xcuserdata',
    // Android
    '.gradle',
];
/** Check if a file is an auto-generated Flutter/Dart file that should be ignored */
export function isFlutterGeneratedFile(fileName) {
    return fileName.endsWith('.g.dart') ||
        fileName.endsWith('.freezed.dart') ||
        fileName.endsWith('.mocks.dart') ||
        fileName.endsWith('.config.dart') ||
        fileName.endsWith('.inject.dart') ||
        fileName.endsWith('.gr.dart');
}

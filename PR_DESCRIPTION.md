## Overview
This PR adds full support for analyzing Flutter and Dart codebases using RLM Analyzer, and includes several critical bug fixes for the local execution engine.

## Features
- **Flutter & Dart Support:** The structural indexer now correctly parses `.dart` files, computing dependency graphs, discovering imports/exports, and categorizing class structures (abstract classes, mixins, enums, etc.).
- **Flutter Detection:** Added heuristics to auto-detect `Pub` as the package manager and `Flutter` as the primary framework via `pubspec.yaml`.
- **Ignore Auto-Generated Code:** The indexer will now explicitly ignore noisy, auto-generated code like `.g.dart`, `.freezed.dart`, `.mocks.dart`, and other builder outputs to keep the context clean.
- **Improved Prompts:** Updated `PERFORMANCE_PROMPT`, `SECURITY_PROMPT`, and `SUMMARY_PROMPT` to ask specific Flutter/Dart questions, such as identifying expensive `build()` methods, platform channel security issues, and navigation approaches.
- **Config & iOS/Android awareness:** Expanded `INCLUDE_FILENAMES` and `CODE_EXTENSIONS` to support core native configuration files like `build.gradle.kts`, `Podfile`, `Info.plist`, and `ruby` or `kotlin` DSLs so agents can analyze the entire stack.

## Bug Fixes
- **Orchestrator Fallback Regex:** Fixed a bug where `ReferenceError`s from sandboxed Javascript were silently swallowed and ignored by a fallback regex if a variable was missing, outputting an un-interpolated template string instead of feeding the error back to the LLM to learn from. 
- **Markdown Transpiler Mangling:** Fixed a serious transpiler bug where Python-to-Javascript syntax rules (such as `#` to `//`, or `not` to `!`) were blindly mutating the text contents of multi-line markdown template strings (such as `## Header`). Strings are now fully masked and protected before running regex rules.

## Local Versioning
- Version bumped from `1.6.0-local` to `1.6.1`. Hardcoded version strings inside CLI outputs have been synchronized to correctly print the new version number.

#!/usr/bin/env node
/**
 * Copy report assets to netlify/functions/
 * 
 * This script ensures critical report assets are copied before build.
 * Missing files will cause the build to fail (no fallback).
 * 
 * Required files:
 * - DEFAULT_TERMS.md
 * - responses.yml
 * - finding_profiles.yml
 * - report-template-md.docx
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const targetDir = path.join(projectRoot, "netlify", "functions");

// Required files: [sourcePath, targetFileName]
const requiredFiles = [
  ["DEFAULT_TERMS.md", "DEFAULT_TERMS.md"],
  ["responses.yml", "responses.yml"],
  ["finding_profiles.yml", "finding_profiles.yml"],
  ["report-template-md.docx", "report-template-md.docx"],
];

// Alternative paths when primary is missing (first match wins)
const alternativePaths = {
  "finding_profiles.yml": [
    path.join(projectRoot, "finding_profiles.yml"),
    path.join(projectRoot, "profiles", "finding_profiles.yml"),
  ],
  "report-template-md.docx": [
    path.join(projectRoot, "report-template-md.docx"),
    path.join(projectRoot, "netlify", "functions", "lib", "report-template-md.docx"),
    path.join(projectRoot, "report-template.docx"),
  ],
};

// If source is missing but target already exists in netlify/functions/, accept it (e.g. file committed there)
const allowExistingTarget = new Set(["report-template-md.docx"]);

let hasErrors = false;

console.log("📦 Copying report assets to netlify/functions/...\n");

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  console.error(`❌ Target directory does not exist: ${targetDir}`);
  process.exit(1);
}

// Copy each required file
for (const [sourceFile, targetFile] of requiredFiles) {
  const sourcePath = path.join(projectRoot, sourceFile);
  const targetPath = path.join(targetDir, targetFile);
  
  // Check if source file exists
  if (!fs.existsSync(sourcePath)) {
    // If target already exists in netlify/functions/ (e.g. committed there), accept it
    if (allowExistingTarget.has(sourceFile) && fs.existsSync(targetPath)) {
      console.log(`✅ ${sourceFile} already present in netlify/functions/ (skipping copy)`);
    } else if (alternativePaths[sourceFile]) {
      let found = false;
      for (const altPath of alternativePaths[sourceFile]) {
        if (fs.existsSync(altPath)) {
          const isFallback = path.basename(altPath) !== sourceFile;
          console.log(isFallback
            ? `✅ Using fallback for ${sourceFile}: ${path.basename(altPath)} → ${targetFile}`
            : `✅ Found ${sourceFile} at alternative path: ${altPath}`);
          try {
            fs.copyFileSync(altPath, targetPath);
            console.log(`   ✓ Copied to ${targetPath}`);
          } catch (error) {
            console.error(`   ❌ Failed to copy: ${error.message}`);
            hasErrors = true;
          }
          found = true;
          break;
        }
      }
      if (!found) {
        console.error(`❌ Required file not found: ${sourceFile}`);
        console.error(`   Searched in:`);
        console.error(`     - ${sourcePath}`);
        for (const altPath of alternativePaths[sourceFile]) {
          console.error(`     - ${altPath}`);
        }
        hasErrors = true;
      }
    } else {
      console.error(`❌ Required file not found: ${sourceFile}`);
      console.error(`   Expected at: ${sourcePath}`);
      hasErrors = true;
    }
  } else {
    // File exists, copy it
    try {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Copied ${sourceFile} → ${targetPath}`);
    } catch (error) {
      console.error(`❌ Failed to copy ${sourceFile}: ${error.message}`);
      hasErrors = true;
    }
  }
}

console.log("");

if (hasErrors) {
  console.error("❌ Build failed: One or more required files are missing or could not be copied.");
  console.error("   Please ensure all required files exist before building.");
  process.exit(1);
} else {
  console.log("✅ All report assets copied successfully!");
}

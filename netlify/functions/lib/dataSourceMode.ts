/**
 * Global data source mode configuration for finding messages and effective finding data.
 * 
 * Modes:
 * - "db_only"     => Never read YAML; if DB missing return clear error
 * - "db_prefer"   => DB first, YAML fallback (current behavior)
 * - "yml_only"    => Ignore DB even if configured
 * 
 * Default behavior:
 * - Production (CONTEXT === 'production' OR NODE_ENV === 'production'): default to "db_only"
 * - Dev/local: default to "db_prefer"
 */

export type DataSourceMode = "db_only" | "db_prefer" | "yml_only";

/**
 * Get the current data source mode from environment variable or default.
 */
export function getDataSourceMode(): DataSourceMode {
  const envMode = process.env.DATA_SOURCE_MODE?.toLowerCase().trim();
  
  // Validate explicit mode
  if (envMode === "db_only" || envMode === "db_prefer" || envMode === "yml_only") {
    return envMode;
  }
  
  // Default based on environment
  const isProduction = 
    process.env.CONTEXT === "production" || 
    process.env.NODE_ENV === "production";
  
  return isProduction ? "db_only" : "db_prefer";
}

/**
 * Check if mode is db_only (never use YAML fallback).
 */
export function isDbOnly(): boolean {
  return getDataSourceMode() === "db_only";
}

/**
 * Check if mode is yml_only (never query DB).
 */
export function isYmlOnly(): boolean {
  return getDataSourceMode() === "yml_only";
}

/**
 * Check if mode allows DB queries.
 */
export function allowsDb(): boolean {
  const mode = getDataSourceMode();
  return mode === "db_only" || mode === "db_prefer";
}

/**
 * Check if mode allows YAML fallback.
 */
export function allowsYaml(): boolean {
  const mode = getDataSourceMode();
  return mode === "db_prefer" || mode === "yml_only";
}

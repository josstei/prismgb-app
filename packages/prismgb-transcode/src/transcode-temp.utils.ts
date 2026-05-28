/**
 * Transcode Temp File Utilities
 *
 * Manages temporary files and directories for transcode operations.
 * Handles creation, writing, and cleanup of temp sessions.
 */

import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { TRANSCODE_CONFIG } from './transcode.config.js';

/**
 * Session information for a transcode operation
 */
export interface SessionInfo {
  sessionId: string;
  sessionDir: string;
}

/**
 * Logger interface for cleanup operations
 */
interface Logger {
  error: (message: string) => void;
}

// Track active sessions for cleanup
const activeSessions = new Set<string>();

/**
 * Generate a unique session ID
 * @returns Unique session identifier
 */
function generateSessionId(): string {
  return `${TRANSCODE_CONFIG.tempPrefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Get the base temp directory for transcode operations
 * @returns Path to temp directory
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function getTempBaseDir(): string {
  let tempDir: string;
  try {
    const { app } = require('electron');
    tempDir = app.getPath('temp');
  } catch {
    const os = require('node:os');
    tempDir = os.tmpdir();
  }
  return path.join(tempDir, 'prismgb-transcode');
}

/**
 * Create a new temp session directory
 * @returns Session info
 */
export function createTempSession(): SessionInfo {
  const sessionId = generateSessionId();
  const baseDir = getTempBaseDir();
  const sessionDir = path.join(baseDir, sessionId);

  // Ensure base directory exists
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // Create session directory
  fs.mkdirSync(sessionDir, { recursive: true });

  // Track the session
  activeSessions.add(sessionId);

  return { sessionId, sessionDir };
}

/**
 * Write a buffer to a temp file within a session (async to avoid blocking event loop)
 * @param sessionDir - Session directory path
 * @param filename - Name of the file to write
 * @param buffer - Data to write
 * @returns Path to the written file
 */
export async function writeTempFile(sessionDir: string, filename: string, buffer: Buffer): Promise<string> {
  const filePath = path.join(sessionDir, filename);
  await fsPromises.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Clean up a specific session directory
 * @param sessionId - Session ID to clean up
 * @param sessionDir - Session directory path
 * @param logger - Optional logger for structured logging
 */
export function cleanupSession(sessionId: string, sessionDir: string, logger: Logger | null = null): void {
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    activeSessions.delete(sessionId);
  } catch (error) {
    // Log but don't throw - cleanup should be best-effort
    const message = `Failed to cleanup session ${sessionId}: ${(error as Error).message}`;
    if (logger?.error) {
      logger.error(message);
    } else {
      console.error(message);
    }
  }
}

/**
 * Clean up all active sessions
 * Call this on app quit to ensure no temp files are left behind
 * @param logger - Optional logger for structured logging
 */
export function cleanupAllSessions(logger: Logger | null = null): void {
  const baseDir = getTempBaseDir();

  // Clean up tracked sessions
  for (const sessionId of activeSessions) {
    const sessionDir = path.join(baseDir, sessionId);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (error) {
      const message = `Failed to cleanup session ${sessionId}: ${(error as Error).message}`;
      if (logger?.error) {
        logger.error(message);
      } else {
        console.error(message);
      }
    }
  }
  activeSessions.clear();

  // Also clean up any orphaned session directories (from crashes, etc.)
  try {
    if (fs.existsSync(baseDir)) {
      const entries = fs.readdirSync(baseDir);
      for (const entry of entries) {
        if (entry.startsWith(TRANSCODE_CONFIG.tempPrefix)) {
          const entryPath = path.join(baseDir, entry);
          try {
            fs.rmSync(entryPath, { recursive: true, force: true });
          } catch {
            // Ignore individual cleanup errors
          }
        }
      }

      // Try to remove base dir if empty
      const remaining = fs.readdirSync(baseDir);
      if (remaining.length === 0) {
        fs.rmdirSync(baseDir);
      }
    }
  } catch {
    // Ignore errors during orphan cleanup
  }
}

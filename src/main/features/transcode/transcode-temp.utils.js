/**
 * Transcode Temp File Utilities
 *
 * Manages temporary files and directories for transcode operations.
 * Handles creation, writing, and cleanup of temp sessions.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';

// Track active sessions for cleanup
const activeSessions = new Set();

/**
 * Generate a unique session ID
 * @returns {string} Unique session identifier
 */
function generateSessionId() {
  return `${TRANSCODE_CONFIG.tempPrefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Get the base temp directory for transcode operations
 * @returns {string} Path to temp directory
 */
function getTempBaseDir() {
  return path.join(app.getPath('temp'), 'prismgb-transcode');
}

/**
 * Create a new temp session directory
 * @returns {{ sessionId: string, sessionDir: string }} Session info
 */
export function createTempSession() {
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
 * @param {string} sessionDir - Session directory path
 * @param {string} filename - Name of the file to write
 * @param {Buffer} buffer - Data to write
 * @returns {Promise<string>} Path to the written file
 */
export async function writeTempFile(sessionDir, filename, buffer) {
  const filePath = path.join(sessionDir, filename);
  await fsPromises.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Clean up a specific session directory
 * @param {string} sessionId - Session ID to clean up
 * @param {string} sessionDir - Session directory path
 */
export function cleanupSession(sessionId, sessionDir) {
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    activeSessions.delete(sessionId);
  } catch (error) {
    // Log but don't throw - cleanup should be best-effort
    console.error(`Failed to cleanup session ${sessionId}:`, error.message);
  }
}

/**
 * Clean up all active sessions
 * Call this on app quit to ensure no temp files are left behind
 */
export function cleanupAllSessions() {
  const baseDir = getTempBaseDir();

  // Clean up tracked sessions
  for (const sessionId of activeSessions) {
    const sessionDir = path.join(baseDir, sessionId);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Failed to cleanup session ${sessionId}:`, error.message);
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


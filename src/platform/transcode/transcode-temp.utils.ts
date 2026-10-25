import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { TRANSCODE_CONFIG } from './transcode.config.js';
import type { LoggerLike } from '@platform/core';

export interface SessionInfo { sessionId: string; sessionDir: string }
const baseDirectory = (tempDir: string) => path.join(tempDir, 'prismgb-transcode');

export function createTempSession(tempDir: string): SessionInfo {
  const sessionId = `${TRANSCODE_CONFIG.tempPrefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sessionDir = path.join(baseDirectory(tempDir), sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  return { sessionId, sessionDir };
}

export async function writeTempFile(sessionDir: string, filename: string, buffer: Buffer): Promise<string> {
  const filePath = path.join(sessionDir, filename);
  await fsPromises.writeFile(filePath, buffer);
  return filePath;
}

export function cleanupSession(sessionDir: string, logger: Pick<LoggerLike, 'warn'>): void {
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to clean up transcode session', { sessionDir, error });
  }
}

/** On shutdown, also remove abandoned sessions left by previous application crashes. */
export function cleanupAllSessions(tempDir: string, logger: Pick<LoggerLike, 'warn'>): void {
  const baseDir = baseDirectory(tempDir);
  if (!fs.existsSync(baseDir)) return;
  try {
    for (const entry of fs.readdirSync(baseDir)) {
      if (entry.startsWith(TRANSCODE_CONFIG.tempPrefix)) cleanupSession(path.join(baseDir, entry), logger);
    }
    if (fs.readdirSync(baseDir).length === 0) fs.rmdirSync(baseDir);
  } catch (error) {
    logger.warn('Failed to clean up transcode directory', { baseDir, error });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';
import archiver from 'archiver';
import { ServersService } from '../servers/servers.service';

@Injectable()
export class FilesService {
  constructor(private serversService: ServersService) {}

  /** Resolves a user-supplied relative path safely within the server's root, blocking traversal. */
  private async resolvePath(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const server = await this.serversService.findOwned(serverId, userId, isAdmin);
    const root = this.serversService.hostPathFor(server);
    const normalized = path.normalize(path.join(root, relativePath || '.'));

    if (!normalized.startsWith(path.resolve(root))) {
      throw new BadRequestException('Invalid path');
    }
    return { root, absolute: normalized };
  }

  async list(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('Path not found');

    const entries = await fs.readdir(absolute, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(absolute, entry.name);
        const stat = await fs.stat(full);
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          sizeBytes: entry.isDirectory() ? 0 : stat.size,
          modifiedAt: stat.mtime,
        };
      }),
    );

    // directories first, then alphabetical
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
    return items;
  }

  async readFile(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('File not found');
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) throw new BadRequestException('Cannot read a directory as a file');
    if (stat.size > 5 * 1024 * 1024) throw new BadRequestException('File too large to edit in-browser (5MB max)');
    return fs.readFile(absolute, 'utf-8');
  }

  async writeFile(serverId: string, userId: string, relativePath: string, content: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf-8');
    return { success: true };
  }

  async createEntry(serverId: string, userId: string, relativePath: string, type: 'file' | 'directory', isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (fsSync.existsSync(absolute)) throw new BadRequestException('Already exists');
    if (type === 'directory') {
      await fs.mkdir(absolute, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, '');
    }
    return { success: true };
  }

  async rename(serverId: string, userId: string, relativePath: string, newName: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('Path not found');
    const dest = path.join(path.dirname(absolute), newName);
    await fs.rename(absolute, dest);
    return { success: true };
  }

  async remove(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute, root } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (absolute === path.resolve(root)) throw new BadRequestException('Cannot delete server root');
    await fs.rm(absolute, { recursive: true, force: true });
    return { success: true };
  }

  /** Moves a file or folder to a new location within the same server. */
  async move(serverId: string, userId: string, fromPath: string, toPath: string, isAdmin = false) {
    const { absolute: from, root } = await this.resolvePath(serverId, userId, fromPath, isAdmin);
    const { absolute: to } = await this.resolvePath(serverId, userId, toPath, isAdmin);
    if (!fsSync.existsSync(from)) throw new NotFoundException('Source not found');
    if (from === path.resolve(root)) throw new BadRequestException('Cannot move server root');
    if (fsSync.existsSync(to)) throw new BadRequestException('A file or folder already exists at the destination');
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    return { success: true };
  }

  /** Copies a file or folder to a new location within the same server. */
  async copy(serverId: string, userId: string, fromPath: string, toPath: string, isAdmin = false) {
    const { absolute: from } = await this.resolvePath(serverId, userId, fromPath, isAdmin);
    const { absolute: to } = await this.resolvePath(serverId, userId, toPath, isAdmin);
    if (!fsSync.existsSync(from)) throw new NotFoundException('Source not found');
    if (fsSync.existsSync(to)) throw new BadRequestException('A file or folder already exists at the destination');
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true });
    return { success: true };
  }

  /** Returns filesystem metadata for a single entry (used by the "Properties" menu item). */
  async properties(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('Path not found');
    const stat = await fs.stat(absolute);
    let sizeBytes = stat.size;
    if (stat.isDirectory()) {
      sizeBytes = await this.dirSizeBytes(absolute);
    }
    return {
      name: path.basename(absolute),
      path: relativePath,
      type: stat.isDirectory() ? 'directory' : 'file',
      sizeBytes,
      createdAt: stat.birthtime,
      modifiedAt: stat.mtime,
      permissions: (stat.mode & 0o777).toString(8),
    };
  }

  private async dirSizeBytes(dir: string): Promise<number> {
    let total = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += await this.dirSizeBytes(full);
      else total += (await fs.stat(full).catch(() => ({ size: 0 } as fsSync.Stats))).size;
    }
    return total;
  }

  /**
   * Extracts a ZIP that is already on disk (e.g. one the user uploaded via the
   * normal upload button) into its current folder. The original ZIP is kept.
   */
  async extractExisting(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('File not found');
    if (path.extname(absolute).toLowerCase() !== '.zip') {
      throw new BadRequestException('Only .zip files can be extracted');
    }
    const destDir = path.dirname(absolute);
    const directory = await unzipper.Open.file(absolute);
    for (const file of directory.files) {
      const target = path.join(destDir, file.path);
      if (!target.startsWith(path.resolve(destDir))) continue; // zip-slip protection
      if (file.type === 'Directory') {
        await fs.mkdir(target, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(target), { recursive: true });
        const content = await file.buffer();
        await fs.writeFile(target, content);
      }
    }
    // Original ZIP is intentionally left in place.
    return { success: true, filesExtracted: directory.files.length };
  }

  /** Compresses a file or folder into a sibling `<name>.zip`, without touching the source. */
  async compress(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('Path not found');

    const stat = await fs.stat(absolute);
    const base = path.basename(absolute).replace(/\.[^/.]+$/, '') || path.basename(absolute);
    let zipName = `${base}.zip`;
    let destAbsolute = path.join(path.dirname(absolute), zipName);
    let n = 1;
    while (fsSync.existsSync(destAbsolute)) {
      zipName = `${base} (${n}).zip`;
      destAbsolute = path.join(path.dirname(absolute), zipName);
      n++;
    }

    await new Promise<void>((resolve, reject) => {
      const output = fsSync.createWriteStream(destAbsolute);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      if (stat.isDirectory()) {
        archive.directory(absolute, false);
      } else {
        archive.file(absolute, { name: path.basename(absolute) });
      }
      archive.finalize();
    });

    return { success: true, name: zipName };
  }

  /**
   * Resolves a download target: a single file is returned as-is, a directory
   * is streamed back as an on-the-fly ZIP archive.
   */
  async resolveDownload(serverId: string, userId: string, relativePath: string, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, relativePath, isAdmin);
    if (!fsSync.existsSync(absolute)) throw new NotFoundException('Path not found');
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.directory(absolute, false);
      archive.finalize();
      return { kind: 'zip' as const, stream: archive, fileName: `${path.basename(absolute) || 'download'}.zip` };
    }
    return { kind: 'file' as const, stream: fsSync.createReadStream(absolute), fileName: path.basename(absolute) };
  }

  async extractZip(serverId: string, userId: string, zipBuffer: Buffer, destRelativePath = '.', isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, destRelativePath, isAdmin);
    await fs.mkdir(absolute, { recursive: true });

    const directory = await unzipper.Open.buffer(zipBuffer);
    for (const file of directory.files) {
      const target = path.join(absolute, file.path);
      if (!target.startsWith(path.resolve(absolute))) continue; // zip-slip protection
      if (file.type === 'Directory') {
        await fs.mkdir(target, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(target), { recursive: true });
        const content = await file.buffer();
        await fs.writeFile(target, content);
      }
    }
    return { success: true, filesExtracted: directory.files.length };
  }

  async saveUpload(serverId: string, userId: string, destRelativePath: string, fileName: string, buffer: Buffer, isAdmin = false) {
    const { absolute } = await this.resolvePath(serverId, userId, path.join(destRelativePath, fileName), isAdmin);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return { success: true };
  }

  /** Streams the whole server directory as a zip archive (used by backups + manual "download all"). */
  archiveDirectory(rootDir: string) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(rootDir, false);
    archive.finalize();
    return archive;
  }
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { RowSkeletonList } from './Skeleton';
import ErrorState from './ErrorState';
import {
  Folder,
  File as FileIcon,
  FileCode2,
  FileJson,
  FileImage,
  FileText,
  FileArchive,
  Upload,
  FolderPlus,
  FilePlus,
  Trash2,
  Edit3,
  ArrowLeft,
  Save,
  Archive,
  Check,
  X,
  UploadCloud,
  Download,
  MoreVertical,
  PackageOpen,
  Info,
  Move,
  Copy,
} from 'lucide-react';

interface Entry {
  name: string;
  type: 'file' | 'directory';
  sizeBytes: number;
  modifiedAt: string;
}

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
}

const CODE_EXT = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'yml', 'yaml', 'env', 'sh', 'css', 'html'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const ARCHIVE_EXT = ['zip', 'tar', 'gz', 'rar', '7z'];

function iconFor(entry: Entry) {
  if (entry.type === 'directory') return <Folder size={15} className="text-signal-500" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'json') return <FileJson size={15} className="text-amber-500" />;
  if (ARCHIVE_EXT.includes(ext)) return <FileArchive size={15} className="text-[#8ea095]" />;
  if (IMAGE_EXT.includes(ext)) return <FileImage size={15} className="text-purple-400" />;
  if (CODE_EXT.includes(ext)) return <FileCode2 size={15} className="text-sky-400" />;
  if (['md', 'txt'].includes(ext)) return <FileText size={15} className="text-[#8ea095]" />;
  return <FileIcon size={15} className="text-[#8ea095]" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileManager({ serverId }: { serverId: string }) {
  const [cwd, setCwd] = useState('.');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null);

  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [properties, setProperties] = useState<{
    name: string;
    path: string;
    type: string;
    sizeBytes: number;
    createdAt: string;
    modifiedAt: string;
    permissions: string;
  } | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);

  async function load(path: string) {
    setLoading(true);
    try {
      const res = await api.get(`/servers/${serverId}/files`, { params: { path } });
      setEntries(res.data);
      setCwd(path);
      setLoadError(false);
      setSelected(null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load('.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  function joinPath(name: string) {
    return cwd === '.' ? name : `${cwd}/${name}`;
  }

  async function openEntry(entry: Entry) {
    const full = joinPath(entry.name);
    if (entry.type === 'directory') {
      load(full);
    } else {
      try {
        const res = await api.get(`/servers/${serverId}/files/content`, { params: { path: full } });
        setEditorContent(res.data.content);
        setEditingPath(full);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Could not open file');
      }
    }
  }

  async function saveFile() {
    if (!editingPath) return;
    setSaving(true);
    try {
      await api.post(`/servers/${serverId}/files/content`, { path: editingPath, content: editorContent });
      toast.success('File saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }

  async function createEntry(type: 'file' | 'directory') {
    const name = prompt(`New ${type} name`);
    if (!name) return;
    try {
      await api.post(`/servers/${serverId}/files/create`, { path: joinPath(name), type });
      toast.success(`${type === 'file' ? 'File' : 'Folder'} created`);
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to create ${type}`);
    }
  }

  function startRename(entry: Entry) {
    setContextMenu(null);
    setRenaming(entry.name);
    setRenameValue(entry.name);
  }

  async function commitRename(entry: Entry) {
    const newName = renameValue.trim();
    setRenaming(null);
    if (!newName || newName === entry.name) return;
    try {
      await api.post(`/servers/${serverId}/files/rename`, { path: joinPath(entry.name), newName });
      toast.success('Renamed');
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Rename failed');
    }
  }

  async function confirmDelete(entry: Entry) {
    setConfirmingDelete(null);
    setContextMenu(null);
    try {
      await api.delete(`/servers/${serverId}/files`, { params: { path: joinPath(entry.name) } });
      toast.success('Deleted');
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Delete failed');
    }
  }

  function isZip(entry: Entry) {
    return entry.type === 'file' && entry.name.toLowerCase().endsWith('.zip');
  }

  async function downloadEntry(entry: Entry) {
    setContextMenu(null);
    try {
      const res = await api.get(`/servers/${serverId}/files/download`, {
        params: { path: joinPath(entry.name) },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.type === 'directory' ? `${entry.name}.zip` : entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Download failed');
    }
  }

  /** Extracts a ZIP already on disk into the current folder. Keeps the original ZIP. */
  async function extractEntry(entry: Entry) {
    setContextMenu(null);
    setExtracting(entry.name);
    try {
      const res = await api.post(`/servers/${serverId}/files/extract`, { path: joinPath(entry.name) });
      toast.success(`Extracted ${res.data.filesExtracted} item${res.data.filesExtracted === 1 ? '' : 's'}`);
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Extraction failed');
    } finally {
      setExtracting(null);
    }
  }

  async function compressEntry(entry: Entry) {
    setContextMenu(null);
    try {
      const res = await api.post(`/servers/${serverId}/files/compress`, { path: joinPath(entry.name) });
      toast.success(`Created ${res.data.name}`);
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Compression failed');
    }
  }

  async function moveEntry(entry: Entry) {
    setContextMenu(null);
    const dest = prompt('Move to (path relative to server root):', joinPath(entry.name));
    if (!dest || dest === joinPath(entry.name)) return;
    try {
      await api.post(`/servers/${serverId}/files/move`, { path: joinPath(entry.name), destPath: dest });
      toast.success('Moved');
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Move failed');
    }
  }

  async function copyEntry(entry: Entry) {
    setContextMenu(null);
    const dest = prompt('Copy to (path relative to server root):', `${joinPath(entry.name)}-copy`);
    if (!dest) return;
    try {
      await api.post(`/servers/${serverId}/files/copy`, { path: joinPath(entry.name), destPath: dest });
      toast.success('Copied');
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Copy failed');
    }
  }

  async function showProperties(entry: Entry) {
    setContextMenu(null);
    try {
      const res = await api.get(`/servers/${serverId}/files/properties`, { params: { path: joinPath(entry.name) } });
      setProperties(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not read properties');
    }
  }

  // --- Uploads (drag & drop + multi-file + progress) ---
  const uploadOne = useCallback(
    (file: File) => {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploads((prev) => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }]);
      const form = new FormData();
      form.append('file', file);
      api
        .post(`/servers/${serverId}/files/upload`, form, {
          params: { path: cwd },
          onUploadProgress: (evt) => {
            const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
            setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: pct } : u)));
          },
        })
        .then(() => {
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: 'done', progress: 100 } : u)));
          setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id)), 2500);
          load(cwd);
        })
        .catch((err) => {
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: 'error' } : u)));
          toast.error(err?.response?.data?.message || `Failed to upload ${file.name}`);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverId, cwd],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      acceptedFiles.forEach(uploadOne);
      toast.success(`Uploading ${acceptedFiles.length} file${acceptedFiles.length > 1 ? 's' : ''}…`);
    },
    [uploadOne],
  );

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  async function onUploadZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post(`/servers/${serverId}/files/upload-zip`, form, { params: { path: cwd } });
      toast.success('Archive extracted');
      load(cwd);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to extract archive');
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  }

  // --- Keyboard shortcuts ---
  const selectedEntry = useMemo(() => entries.find((e) => e.name === selected) || null, [entries, selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (editingPath || renaming) return; // let inputs handle their own keys
    if (contextMenu) {
      if (e.key === 'Escape') setContextMenu(null);
      return;
    }
    if (!entries.length) return;

    const idx = entries.findIndex((en) => en.name === selected);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(entries[Math.min(idx + 1, entries.length - 1)]?.name ?? entries[0].name);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(entries[Math.max(idx - 1, 0)]?.name ?? entries[0].name);
    } else if (e.key === 'Enter' && selectedEntry) {
      openEntry(selectedEntry);
    } else if ((e.key === 'F2' || e.key === 'r') && selectedEntry) {
      startRename(selectedEntry);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEntry) {
      e.preventDefault();
      setConfirmingDelete(selectedEntry.name);
    } else if (e.key === 'Escape') {
      setConfirmingDelete(null);
    } else if (e.key === 'Backspace' && !selectedEntry && cwd !== '.') {
      load(cwd.split('/').slice(0, -1).join('/') || '.');
    }
  }

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  if (editingPath) {
    return (
      <div className="rounded-lg border border-base-700 bg-base-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-base-700 gap-2 flex-wrap">
          <button
            onClick={() => setEditingPath(null)}
            className="flex items-center gap-1 text-sm text-[#8ea095] hover:text-white"
          >
            <ArrowLeft size={14} /> back
          </button>
          <span className="font-mono text-sm break-all">{editingPath}</span>
          <button
            onClick={saveFile}
            disabled={saving}
            className="flex items-center gap-1 text-sm bg-signal-500 text-base-950 px-3 py-1.5 rounded-md font-medium hover:bg-signal-400 disabled:opacity-60"
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <textarea
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          spellCheck={false}
          className="w-full h-[28rem] bg-black/40 font-mono text-sm p-4 outline-none resize-none"
        />
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative rounded-lg border border-base-700 bg-base-900/60 overflow-hidden outline-none"
    >
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-20 bg-signal-500/10 border-2 border-dashed border-signal-500 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-signal-500">
            <UploadCloud size={32} />
            <p className="text-sm font-medium">Drop files to upload</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 border-b border-base-700 flex-wrap gap-2">
        <span className="font-mono text-sm text-[#8ea095] break-all">/{cwd === '.' ? '' : cwd}</span>
        <div className="flex items-center gap-1 flex-wrap">
          {cwd !== '.' && (
            <IconButton onClick={() => load(cwd.split('/').slice(0, -1).join('/') || '.')} icon={<ArrowLeft size={14} />} label="Up" />
          )}
          <IconButton onClick={() => createEntry('directory')} icon={<FolderPlus size={14} />} label="Folder" />
          <IconButton onClick={() => createEntry('file')} icon={<FilePlus size={14} />} label="File" />
          <IconButton onClick={openFilePicker} icon={<Upload size={14} />} label="Upload" />
          <IconButton onClick={() => zipInputRef.current?.click()} icon={<Archive size={14} />} label="Upload ZIP" />
          <input ref={zipInputRef} type="file" accept=".zip" hidden onChange={onUploadZip} />
        </div>
      </div>

      {/* Upload progress panel */}
      {uploads.length > 0 && (
        <div className="px-4 py-2 border-b border-base-700 space-y-1.5 bg-base-950/40">
          {uploads.map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-[#a9bdb2] truncate max-w-[40%]">{u.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-base-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${u.status === 'error' ? 'bg-red-500' : 'bg-signal-500'}`}
                  style={{ width: `${u.progress}%` }}
                />
              </div>
              <span className="text-[#8ea095] w-10 text-right">
                {u.status === 'error' ? 'failed' : u.status === 'done' ? <Check size={12} className="inline text-signal-500" /> : `${u.progress}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {loadError ? (
        <div className="p-4">
          <ErrorState message="Couldn't load files." onRetry={() => load(cwd)} />
        </div>
      ) : loading ? (
        <div className="p-3">
          <RowSkeletonList />
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-sm text-[#8ea095] text-center space-y-2">
          <p>Empty directory.</p>
          <p className="text-xs">Drag & drop files here, or use the Upload button.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.name}
                  onClick={() => setSelected(entry.name)}
                  onDoubleClick={() => openEntry(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelected(entry.name);
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  className={`border-b border-base-800 last:border-0 group cursor-pointer transition-colors ${
                    selected === entry.name ? 'bg-signal-500/10' : 'hover:bg-base-800/40'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    {renaming === entry.name ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {iconFor(entry)}
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(entry);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          className="bg-base-950 border border-signal-500/50 rounded px-2 py-0.5 text-sm font-mono outline-none flex-1"
                        />
                        <button onClick={() => commitRename(entry)} className="text-signal-500">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setRenaming(null)} className="text-[#8ea095]">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-2">
                        {iconFor(entry)}
                        {entry.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#8ea095] font-mono text-xs w-24 hidden sm:table-cell">
                    {entry.type === 'file' ? formatBytes(entry.sizeBytes) : ''}
                  </td>
                  <td className="px-4 py-2.5 w-24">
                    {confirmingDelete === entry.name ? (
                      <div className="flex items-center gap-1 justify-end text-xs" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[#8ea095]">Delete?</span>
                        <button onClick={() => confirmDelete(entry)} className="text-red-400 font-medium">
                          Yes
                        </button>
                        <button onClick={() => setConfirmingDelete(null)} className="text-[#8ea095]">
                          No
                        </button>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button onClick={() => startRename(entry)} className="text-[#8ea095] hover:text-white" title="Rename (F2)">
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmingDelete(entry.name)}
                          className="text-[#8ea095] hover:text-red-400"
                          title="Delete (Del)"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setSelected(entry.name);
                            setContextMenu({ x: rect.right, y: rect.bottom, entry });
                          }}
                          className="text-[#8ea095] hover:text-white"
                          title="More options"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 w-40 rounded-md border border-base-700 bg-base-900 shadow-xl py-1 text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              openEntry(contextMenu.entry);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white"
          >
            Open
          </button>
          {isZip(contextMenu.entry) && (
            <button
              onClick={() => extractEntry(contextMenu.entry)}
              disabled={extracting === contextMenu.entry.name}
              className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white flex items-center gap-2 disabled:opacity-50"
            >
              <PackageOpen size={13} /> {extracting === contextMenu.entry.name ? 'Extracting…' : 'Extract'}
            </button>
          )}
          <button
            onClick={() => startRename(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white"
          >
            Rename
          </button>
          <button
            onClick={() => downloadEntry(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white flex items-center gap-2"
          >
            <Download size={13} /> Download
          </button>
          <button
            onClick={() => moveEntry(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white flex items-center gap-2"
          >
            <Move size={13} /> Move
          </button>
          <button
            onClick={() => copyEntry(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white flex items-center gap-2"
          >
            <Copy size={13} /> Copy
          </button>
          <button
            onClick={() => compressEntry(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white flex items-center gap-2"
          >
            <Archive size={13} /> Compress
          </button>
          <button
            onClick={() => showProperties(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-[#a9bdb2] hover:text-white flex items-center gap-2"
          >
            <Info size={13} /> Properties
          </button>
          <button
            onClick={() => {
              setConfirmingDelete(contextMenu.entry.name);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-base-800 text-red-400"
          >
            Delete
          </button>
        </div>
      )}

      {/* Properties modal */}
      {properties && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setProperties(null)}
        >
          <div
            className="bg-base-900 border border-base-700 rounded-lg p-5 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Info size={14} /> Properties
              </h3>
              <button onClick={() => setProperties(null)} className="text-[#8ea095] hover:text-white">
                <X size={16} />
              </button>
            </div>
            <dl className="text-xs space-y-1.5 font-mono">
              <Row label="Name" value={properties.name} />
              <Row label="Path" value={`/${properties.path}`} />
              <Row label="Type" value={properties.type} />
              <Row label="Size" value={formatBytes(properties.sizeBytes)} />
              <Row label="Permissions" value={properties.permissions} />
              <Row label="Created" value={new Date(properties.createdAt).toLocaleString()} />
              <Row label="Modified" value={new Date(properties.modifiedAt).toLocaleString()} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#8ea095]">{label}</dt>
      <dd className="text-[#a9bdb2] truncate text-right">{value}</dd>
    </div>
  );
}

function IconButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-[#a9bdb2] hover:text-signal-500 border border-base-700 hover:border-signal-500/50 rounded-md px-2.5 py-1.5 transition-colors"
    >
      {icon} {label}
    </button>
  );
}

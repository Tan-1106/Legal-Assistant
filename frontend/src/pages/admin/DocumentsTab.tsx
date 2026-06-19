import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, UploadCloud, Trash2, AlertTriangle, 
  RefreshCw, Eye, Edit3, ChevronLeft, ChevronRight
} from 'lucide-react';
import { API_BASE_URL, UPLOAD_MAX_FILES, UPLOAD_MAX_TOTAL_BYTES, UPLOAD_TIMEOUT_MS } from '../../config';
import { useAuth } from '../../context/auth';
import { useTranslation } from 'react-i18next';

interface Task {
  task_id: string; type: string; status: 'queued' | 'processing' | 'completed' | 'failed';
  meta: { files?: string[]; count?: number }; error?: string; updated_at: number;
}
interface DocumentInfo { filename: string; size_bytes: number; }
interface ChunkInfo { id: string; text: string; metadata: any; }

const TASK_STORAGE_PREFIX = 'legal-assistant-admin-tasks';
function storageKey(username: string) { return `${TASK_STORAGE_PREFIX}:${username}`; }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DocumentsTab() {
  const { t } = useTranslation();
  const { apiFetch, user } = useAuth();
  const username = user?.username ?? 'anonymous';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [previewDoc, setPreviewDoc] = useState<{ filename: string, text: string } | null>(null);

  const [chunksDoc, setChunksDoc] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [editingChunk, setEditingChunk] = useState<string | null>(null);
  const [editChunkText, setEditChunkText] = useState('');
  const [savingChunk, setSavingChunk] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/`);
      if (res.ok) {
        const data = await res.json() as any[];
        setDocuments(data.map(d => ({ filename: String(d.filename), size_bytes: Number(d.size_bytes) })));
      }
    } catch { }
  }, [apiFetch]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(username)) ?? '[]');
      setTasks(Array.isArray(parsed) ? parsed : []);
    } catch {}
  }, [username]);

  const processUpload = async (files: File[]) => {
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    if (files.length > UPLOAD_MAX_FILES || totalBytes > UPLOAD_MAX_TOTAL_BYTES) { setError('Files exceed limit'); return; }
    setIsUploading(true); setError('');
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/ingest`, { method: 'POST', body: fd, timeoutMs: UPLOAD_TIMEOUT_MS });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json() as any;
      const newTask: Task = { task_id: data.task_id, type: 'ingest', status: 'queued', meta: { files: data.files }, updated_at: Date.now() };
      setTasks(p => [newTask, ...p]);
      localStorage.setItem(storageKey(username), JSON.stringify([newTask, ...tasks]));
      loadDocuments();
    } catch (err: any) { setError(err.message); }
    finally { setIsUploading(false); }
  };

  const handleDeleteFile = async (filename: string) => {
    setDeletingFile(filename);
    try {
      await apiFetch(`${API_BASE_URL}/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      setDocuments(p => p.filter(d => d.filename !== filename));
    } catch (err: any) { setError(err.message); }
    finally { setDeletingFile(null); }
  };

  const handlePreview = async (filename: string) => {
    setPreviewDoc(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/${encodeURIComponent(filename)}/preview`);
      if (!res.ok) throw new Error('Failed to load preview');
      const data = await res.json() as { text: string };
      setPreviewDoc({ filename, text: data.text });
    } catch (err: any) { setError(err.message); }
  };

  const loadChunks = async (filename: string) => {
    setLoadingChunks(true); setChunksDoc(filename);
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/${encodeURIComponent(filename)}/chunks?skip=0&limit=1000`);
      if (!res.ok) throw new Error('Failed to load chunks');
      const data = await res.json() as any;
      setChunks(data.chunks);
    } catch (err: any) { setError(err.message); setChunksDoc(null); }
    finally { setLoadingChunks(false); }
  };

  const handleSaveChunk = async () => {
    if (!editingChunk) return;
    setSavingChunk(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/chunks/${editingChunk}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: editChunkText })
      });
      if (!res.ok) throw new Error('Failed to update chunk');
      setChunks(p => p.map(c => c.id === editingChunk ? { ...c, text: editChunkText } : c));
      setEditingChunk(null);
    } catch (err: any) { setError(err.message); }
    finally { setSavingChunk(false); }
  };

  const handleDeleteAllDocs = async (password: string) => {
    const res = await apiFetch(`${API_BASE_URL}/documents/all`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any;
      throw new Error(body.detail ?? 'Error');
    }
    setDocuments([]);
    setPasswordModal(false);
  };

  const totalPages = Math.ceil(documents.length / pageSize);
  const paginatedDocs = documents.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t('admin.title')}</h2>
          <p className="admin-page-subtitle">{t('admin.subtitle')}</p>
        </div>
        <button className="btn btn-secondary" onClick={loadDocuments}><RefreshCw size={15}/> {t('admin.btn_reload')}</button>
      </div>

      <div className="admin-page-body">
        {/* Quick Stats & Upload Grid */}
        <div className="admin-stats-grid cols-xl-3">
          {/* Quick Stats */}
          <div className="flex flex-col gap-6">
            <div className="glass-panel p-6 flex flex-col justify-center items-center h-full">
              <span className="text-3xl font-bold text-primary">{documents.length}</span>
              <span className="text-sm text-faint uppercase tracking-wider mt-1">{t('admin.tab_documents')}</span>
            </div>
            <div className="glass-panel p-6 flex flex-col justify-center items-center h-full">
              <span className="text-3xl font-bold text-success">
                {formatBytes(documents.reduce((acc, curr) => acc + curr.size_bytes, 0))}
              </span>
              <span className="text-sm text-faint uppercase tracking-wider mt-1">Total Size (Page)</span>
            </div>
          </div>

          {/* Upload Zone */}
          <div className="glass-panel p-6 border-dashed border-2 flex flex-col items-center justify-center min-h-[160px] upload-zone" style={{ gridColumn: 'span 2', borderColor: 'var(--border-hover)' }}>
            <input type="file" multiple accept=".pdf,.docx,.txt" id="file-upload" className="hidden" onChange={e => e.target.files && processUpload(Array.from(e.target.files))} disabled={isUploading}/>
            <label htmlFor="file-upload" className={`w-full h-full cursor-pointer flex flex-col items-center justify-center p-4 gap-3 transition-all ${isDragging ? 'opacity-50' : 'hover:opacity-80'}`} onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={e => { e.preventDefault(); setIsDragging(false); processUpload(Array.from(e.dataTransfer.files)); }}>
              {isUploading ? (
                <>
                  <Loader2 size={40} className="spin text-primary" />
                  <p className="text-primary font-medium mt-2">{t('admin.uploading_ingesting')}</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2" style={{ background: 'var(--bg-overlay)', color: 'var(--primary)' }}>
                    <UploadCloud size={32}/>
                  </div>
                  <p className="font-medium text-text text-lg">{t('admin.drag_drop_upload')}</p>
                  <p className="text-xs text-faint">{t('admin.upload_limits')}</p>
                </>
              )}
            </label>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>{t('admin.col_name')}</th><th>{t('admin.col_type')}</th><th>{t('admin.col_size')}</th><th style={{ textAlign: 'right' }}>{t('admin.col_action')}</th></tr>
            </thead>
            <tbody>
              {paginatedDocs.length === 0 ? <tr><td colSpan={4} className="text-center py-6 text-muted">{t('admin.empty')}</td></tr> : paginatedDocs.map(d => (
                <tr key={d.filename}>
                  <td className="font-medium truncate max-w-xs">{d.filename}</td>
                  <td><span className="badge-primary">{d.filename.split('.').pop()?.toUpperCase()}</span></td>
                  <td className="text-sm font-mono text-faint">{formatBytes(d.size_bytes)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-secondary py-1 px-2 text-xs" onClick={() => handlePreview(d.filename)} title={t('admin.preview')}><Eye size={14}/></button>
                      <button className="btn btn-secondary py-1 px-2 text-xs" onClick={() => loadChunks(d.filename)} title={t('admin.chunks')}><Edit3 size={14}/> {t('admin.chunks')}</button>
                      <button className="btn btn-danger py-1 px-2 text-xs" onClick={() => handleDeleteFile(d.filename)} disabled={deletingFile === d.filename} title={t('admin.btn_delete')}><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-2">
            <button className="btn btn-secondary px-3 py-1" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium text-muted">{t('admin.page_of', { page, total: totalPages })}</span>
            <button className="btn btn-secondary px-3 py-1" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
          </div>
        )}

        <div className="danger-zone mt-8">
          <div className="danger-zone-header">
            <AlertTriangle size={16} style={{ color: '#e74c3c' }} />
            <span className="danger-zone-title">{t('admin.danger_zone')}</span>
          </div>
          <div className="danger-zone-body">
            <div className="danger-zone-item">
              <div className="danger-zone-item-info">
                <p className="danger-zone-item-title">{t('admin.delete_all_docs')}</p>
                <p className="danger-zone-item-desc">{t('admin.delete_all_docs_desc')}</p>
              </div>
              <button className="btn btn-danger shrink-0" onClick={() => setPasswordModal(true)}>
                <Trash2 size={14} /> {t('admin.btn_delete_all_docs')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {previewDoc && (
        <div className="dialog-backdrop" onClick={() => setPreviewDoc(null)}>
          <div className="glass-panel w-full max-w-4xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-default flex justify-between items-center">
              <h3 className="font-bold text-lg">{t('admin.preview')}: {previewDoc.filename}</h3>
              <button className="btn btn-ghost px-3 py-1" onClick={() => setPreviewDoc(null)}>{t('sidebar.btn_close')}</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed">{previewDoc.text}</div>
          </div>
        </div>
      )}

      {chunksDoc && (
        <div className="dialog-backdrop" onClick={() => setChunksDoc(null)}>
          <div className="glass-panel w-full max-w-5xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-default flex justify-between items-center">
              <h3 className="font-bold text-lg">{t('admin.manage_chunks')}: {chunksDoc}</h3>
              <button className="btn btn-ghost px-3 py-1" onClick={() => setChunksDoc(null)}>{t('sidebar.btn_close')}</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-4 bg-background">
              {loadingChunks ? <Loader2 className="spin mx-auto text-primary" size={32}/> : chunks.map(c => (
                <div key={c.id} className="border border-default rounded-lg p-4 bg-surface shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs text-faint font-mono bg-overlay px-2 py-1 rounded">ID: {c.id}</span>
                    {editingChunk === c.id ? (
                      <div className="flex gap-2">
                        <button className="btn btn-ghost text-xs py-1" onClick={() => setEditingChunk(null)}>{t('common.cancel')}</button>
                        <button className="btn btn-primary text-xs py-1" onClick={handleSaveChunk} disabled={savingChunk}>{savingChunk ? <Loader2 size={14} className="spin"/> : t('admin.save_chunk')}</button>
                      </div>
                    ) : (
                      <button className="btn btn-secondary text-xs py-1" onClick={() => { setEditingChunk(c.id); setEditChunkText(c.text); }}><Edit3 size={14}/> {t('admin.edit_chunk')}</button>
                    )}
                  </div>
                  {editingChunk === c.id ? (
                    <textarea className="input w-full h-48 font-mono text-sm leading-relaxed p-3" value={editChunkText} onChange={e => setEditChunkText(e.target.value)} />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed text-text">{c.text}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="dialog-backdrop" onClick={() => setPasswordModal(false)}>
          <div className="glass-panel dialog-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={24} className="text-danger" />
              <h3 className="dialog-title text-danger">{t('admin.confirm_delete_all_docs_title')}</h3>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleDeleteAllDocs(fd.get('password') as string).catch(err => alert(err.message));
            }}>
              <div className="mb-4">
                <label className="input-label">{t('admin.admin_pwd')}</label>
                <input type="password" name="password" className="input" required />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPasswordModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-danger">{t('common.confirm')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

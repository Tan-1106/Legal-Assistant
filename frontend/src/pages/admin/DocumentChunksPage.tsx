import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/auth';

interface ChunkInfo {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
}

interface ChunksResponse {
  chunks: ChunkInfo[];
  total: number;
}

function getErrorMessage(error: unknown, fallback = 'Error') {
  return error instanceof Error ? error.message : fallback;
}

function readFilenameParam(value: string | undefined) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function DocumentChunksPage() {
  const { t } = useTranslation();
  const { apiFetch } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const filename = readFilenameParam(params.filename);

  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingChunk, setEditingChunk] = useState<string | null>(null);
  const [editChunkText, setEditChunkText] = useState('');
  const [savingChunk, setSavingChunk] = useState(false);

  const loadChunks = useCallback(async () => {
    if (!filename) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/${encodeURIComponent(filename)}/chunks?skip=0&limit=1000`);
      if (!res.ok) throw new Error(t('admin.err_load_chunks', 'Failed to load chunks'));
      const data = await res.json() as ChunksResponse;
      setChunks(data.chunks);
      setTotal(data.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, filename, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadChunks(), 0);
    return () => window.clearTimeout(timer);
  }, [loadChunks]);

  const handleStartEdit = (chunk: ChunkInfo) => {
    setNotice('');
    setEditingChunk(chunk.id);
    setEditChunkText(chunk.text);
  };

  const handleSaveChunk = async () => {
    if (!editingChunk) return;
    setSavingChunk(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/chunks/${editingChunk}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editChunkText }),
      });
      if (!res.ok) throw new Error(t('admin.err_save_chunk', 'Failed to update chunk'));
      setChunks(current => current.map(chunk => (
        chunk.id === editingChunk ? { ...chunk, text: editChunkText } : chunk
      )));
      setEditingChunk(null);
      setNotice(t('admin.chunk_saved', 'Chunk saved and re-embedded.'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingChunk(false);
    }
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <button className="btn btn-ghost admin-back-link" onClick={() => navigate('/admin/documents')}>
            <ArrowLeft size={16} /> {t('admin.back_to_documents', 'Back to documents')}
          </button>
          <h2 className="admin-page-title">{t('admin.manage_chunks')}: {filename}</h2>
          <p className="admin-page-subtitle">{t('admin.chunks_page_subtitle', { count: total, defaultValue: '{{count}} indexed chunks' })}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void loadChunks()} disabled={isLoading}>
          {isLoading ? <Loader2 size={15} className="spin" /> : null}
          {t('admin.btn_reload')}
        </button>
      </div>

      <div className="admin-page-body chunks-page-body">
        {notice && <div className="success-banner">{notice}</div>}
        {error && <div className="error-banner">{error}</div>}

        {isLoading ? (
          <div className="welcome-state">
            <Loader2 className="spin text-primary" size={32} />
            <p className="text-muted">{t('admin.loading_chunks', 'Loading chunks...')}</p>
          </div>
        ) : chunks.length === 0 ? (
          <div className="welcome-state">
            <p className="text-muted">{t('admin.no_chunks', 'No chunks found for this document.')}</p>
          </div>
        ) : (
          <div className="chunk-editor-list">
            {chunks.map((chunk, index) => (
              <section key={chunk.id} className="chunk-editor-card">
                <div className="chunk-editor-header">
                  <div className="chunk-editor-title">
                    <span className="badge-primary">#{index + 1}</span>
                    <span className="text-xs text-faint font-mono">ID: {chunk.id}</span>
                  </div>
                  {editingChunk === chunk.id ? (
                    <div className="flex gap-2">
                      <button className="btn btn-ghost text-xs py-1" onClick={() => setEditingChunk(null)}>{t('common.cancel')}</button>
                      <button className="btn btn-primary text-xs py-1" onClick={handleSaveChunk} disabled={savingChunk}>
                        {savingChunk ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                        {t('admin.save_chunk')}
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-secondary text-xs py-1" onClick={() => handleStartEdit(chunk)}>
                      <Edit3 size={14} /> {t('admin.edit_chunk')}
                    </button>
                  )}
                </div>

                {editingChunk === chunk.id ? (
                  <textarea
                    className="chunk-editor-textarea"
                    value={editChunkText}
                    onChange={event => setEditChunkText(event.target.value)}
                  />
                ) : (
                  <div className="chunk-editor-preview">{chunk.text}</div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

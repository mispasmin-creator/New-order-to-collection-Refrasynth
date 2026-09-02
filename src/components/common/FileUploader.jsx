import React, { useRef, useState } from 'react';
import { Upload, X, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

const DRIVE_FOLDER_ID = '1iGeJSI9CZpmaCyUnpx1QoDJNOXr_Jd2L';
const MAX_SIZE_MB = 20;

/**
 * FileUploader — Drag & drop / click-to-browse file upload widget.
 *
 * Props:
 *   label        {string}   — Field label shown above the widget.
 *   value        {string}   — Current Drive URL (shows a link when set).
 *   onChange     {function} — Called with the Drive URL string after upload.
 *   accept       {string}   — MIME types to accept (default: all).
 *   required     {boolean}  — Marks the field as required.
 */
export default function FileUploader({
  label = 'Upload File',
  value = '',
  onChange,
  accept = '*/*',
  required = false,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;

    // Size guard
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setError('');
    setUploading(true);

    try {
      const driveUrl = await api.uploadFile(file, DRIVE_FOLDER_ID);
      if (driveUrl) {
        onChange(driveUrl);
      } else {
        setError('Upload failed. Please try again or paste a Drive URL manually.');
      }
    } catch (err) {
      console.error('FileUploader error:', err);
      setError('Upload error: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e) => {
    handleFile(e.target.files?.[0]);
    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleClear = () => {
    onChange('');
    setError('');
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
          {label}{required && ' *'}
        </label>
      )}

      {/* If a URL is already set — show it with a clear button */}
      {value ? (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 truncate underline flex items-center gap-1"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
            title="Remove file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Drag-and-drop zone */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-1.5
            p-4 border-2 border-dashed rounded-lg cursor-pointer
            transition-all duration-150
            ${dragOver
              ? 'border-indigo-400 bg-indigo-50/60 scale-[1.01]'
              : 'border-slate-300 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/30'
            }
            ${uploading ? 'cursor-wait' : ''}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleInputChange}
            className="sr-only"
          />

          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
              <p className="text-xs font-medium text-indigo-600">Uploading to Google Drive…</p>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-slate-400" />
              <p className="text-xs font-medium text-slate-600">
                Drag & drop file here, or{' '}
                <span className="text-indigo-600 underline">browse</span>
              </p>
              <p className="text-[10px] text-slate-400">Any file • Max {MAX_SIZE_MB} MB</p>
            </>
          )}
        </div>
      )}

      {/* Manual URL fallback */}
      {!value && !uploading && (
        <input
          type="url"
          value=""
          onChange={(e) => e.target.value && onChange(e.target.value)}
          placeholder="Or paste Google Drive link directly…"
          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 placeholder:text-slate-400"
        />
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-1.5 text-rose-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="text-[11px]">{error}</p>
        </div>
      )}
    </div>
  );
}

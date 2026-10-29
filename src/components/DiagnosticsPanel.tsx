import React, { useCallback, useEffect, useState } from 'react';
import { X, PlayCircle, CheckCircle2, AlertTriangle, XCircle, Copy, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  runDiagnostics,
  clearLocalLoginRecord,
  type DiagnosticCheck,
} from '../services/diagnosticsService';

/**
 * On-screen health check for the whole Supabase wiring.
 * Open it with ?diag=1 on any URL, or from Settings → System diagnostics.
 */
export const DiagnosticsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { logout } = useAuth();
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setChecks(await runDiagnostics());
    } catch (err: any) {
      setChecks([
        {
          id: 'fatal',
          label: 'Diagnostics crashed',
          status: 'fail',
          detail: String(err?.message || err),
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const failures = checks.filter((c) => c.status === 'fail').length;

  const copyReport = async () => {
    const text = checks
      .map((c) => `${c.status === 'ok' ? 'OK  ' : c.status === 'warn' ? 'WARN' : 'FAIL'} | ${c.label}: ${c.detail}${c.fix ? `\n       → ${c.fix}` : ''}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(`SZMC diagnostics — ${new Date().toISOString()}\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const icon = (s: DiagnosticCheck['status']) =>
    s === 'ok' ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
    ) : s === 'warn' ? (
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
    ) : (
      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
    );

  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">System Diagnostics</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {running
                ? 'Checking Supabase connection, login session, database writes…'
                : `${checks.length} checks · ${failures} failing`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close diagnostics"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {checks.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-3 ${
                c.status === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : c.status === 'warn'
                  ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20'
                  : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20'
              }`}
            >
              <div className="flex items-start gap-2">
                {icon(c.status)}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{c.label}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 break-words mt-0.5">
                    {c.detail}
                  </div>
                  {c.fix && (
                    <div className="text-[11px] mt-1 font-semibold text-rose-700 dark:text-rose-300">
                      → {c.fix}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {running && (
            <div className="text-center text-xs text-slate-500 py-6">Running checks…</div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Run again
          </button>
          <button
            type="button"
            onClick={copyReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied!' : 'Copy report'}
          </button>
          <button
            type="button"
            onClick={() => {
              clearLocalLoginRecord();
              logout();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Clear local login &amp; sign out
          </button>
        </div>
      </div>
    </div>
  );
};

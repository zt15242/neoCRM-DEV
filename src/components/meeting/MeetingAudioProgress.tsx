import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, X } from 'lucide-react';

export interface AudioProcessingState {
  meetingId: string;
  fileName?: string;
  /** Index of the current stage; 3 means every stage has completed. */
  stage: 0 | 1 | 2 | 3;
  startedAt: number;
  finishedAt?: number;
  label: string;
  tone: 'info' | 'success' | 'error';
}

const stages = ['准备音频', '音频转写', 'AI 总结'];

export const MeetingAudioProgress: React.FC<{
  processing: AudioProcessingState;
  onDismiss: () => void;
}> = ({ processing, onDismiss }) => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setNow(Date.now());
    if (processing.tone !== 'info') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [processing.meetingId, processing.startedAt, processing.tone]);

  const seconds = Math.max(0, Math.floor(((processing.finishedAt ?? now) - processing.startedAt) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const running = processing.tone === 'info';

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-start justify-between gap-4 mb-2 text-xs">
        <div className="flex items-start gap-2 min-w-0" role="status" aria-live="polite">
          {processing.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : processing.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 animate-spin motion-reduce:animate-none text-blue-600 shrink-0" />
          )}
          <div className="min-w-0">
            <div className={`break-words whitespace-pre-wrap ${processing.tone === 'error' ? 'text-rose-700' : 'text-slate-700'}`}>
              {processing.label}
            </div>
            {processing.fileName && (
              <div className="mt-0.5 truncate text-[11px] text-slate-400" title={processing.fileName}>
                {processing.fileName}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-[11px] text-slate-500">
          <span className="tabular-nums">已用时 {elapsed}</span>
          {!running && (
            <button type="button" onClick={onDismiss} className="p-1 rounded hover:bg-slate-100 cursor-pointer" aria-label="收起音频处理进度" title="收起进度">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div
        className="grid grid-cols-3 gap-2"
        role="progressbar"
        aria-label="音频处理阶段进度"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={processing.stage}
        aria-valuetext={processing.tone === 'success' ? processing.label : `${stages[processing.stage]}：${processing.tone === 'error' ? '失败' : '处理中'}`}
      >
        {stages.map((stage, index) => (
          <div key={stage}>
            <div className={`h-1.5 rounded-full ${
              processing.tone === 'success' && index < processing.stage ? 'bg-emerald-500'
                : processing.tone === 'success' ? 'bg-slate-100'
                : index < processing.stage ? 'bg-blue-500'
                : index === processing.stage ? processing.tone === 'error'
                  ? 'bg-rose-500'
                  : 'bg-blue-400 animate-pulse motion-reduce:animate-none'
                : 'bg-slate-100'
            }`} />
            <div className={`mt-1 text-[10px] ${index === processing.stage ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
              {index + 1}. {stage}
            </div>
          </div>
        ))}
      </div>
      {running && (
        <p className="mt-1.5 text-[10px] text-slate-400">
          阶段进度 · {processing.stage === 1 ? '正在等待转写服务处理，长音频可能需要较长时间' : processing.stage === 2 ? '正在分析转写内容，请稍候' : '正在准备音频文件'}
        </p>
      )}
    </div>
  );
};

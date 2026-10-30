import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Key,
  Globe,
  Radio,
  Sliders,
  Check,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { OpenAiAudioSettings } from '../../../shared/meetingTypes';

interface MeetingSettingsModalProps {
  onClose: () => void;
  onSave: (settings: Partial<OpenAiAudioSettings>) => Promise<void>;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MeetingSettingsModal: React.FC<MeetingSettingsModalProps> = ({
  onClose,
  onSave,
  showToast,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-transcribe');
  const [language, setLanguage] = useState('zh');
  const [temperature, setTemperature] = useState(0.0);
  const [promptTerminologyEnabled, setPromptTerminologyEnabled] = useState(true);

  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (window.neoApi?.meetingGetSettings) {
      window.neoApi.meetingGetSettings().then((s) => {
        if (s) {
          setApiKey(s.apiKey || '');
          setBaseUrl(s.baseUrl || 'https://api.openai.com/v1');
          setModel(s.model || 'gpt-transcribe');
          setLanguage(s.language || 'zh');
          setTemperature(s.temperature ?? 0.0);
          setPromptTerminologyEnabled(s.promptTerminologyEnabled ?? true);
        }
      });
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || 'https://api.openai.com/v1',
        model: model.trim() || 'gpt-transcribe',
        language,
        temperature,
        promptTerminologyEnabled,
      });
      showToast?.('success', '已保存转写配置');
      onClose();
    } catch (err: any) {
      showToast?.('error', `保存失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">会议转写配置</h3>
              <p className="text-xs text-slate-400">配置 OpenAI 兼容的音频转写服务及专业术语提示</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* OpenAI API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-blue-600" />
                <span>转写 API Key</span>
              </label>
              <span className="text-[11px] text-slate-400">仅复用已配置的 OpenAI 官方渠道密钥</span>
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>API Base URL (转写服务端点)</span>
            </label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              填写提供 /audio/transcriptions 接口的服务地址。请求失败时会显示接口错误，不会生成模拟转写文本。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Model */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">转写模型名称</label>
              <input
                type="text"
                placeholder="gpt-transcribe"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">默认识别语种</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="zh">中文普通话 (zh)</option>
                <option value="en">英语 (en)</option>
                <option value="auto">自动探测语种 (auto)</option>
              </select>
            </div>
          </div>

          {/* 自动注入术语库开关 */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>自动注入专业术语提示</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                将启用的 XOQL、SOQL、APL、CPQ、ARR 等术语作为提示传给转写模型，帮助识别专业名词。
              </p>
            </div>
            <input
              type="checkbox"
              checked={promptTerminologyEnabled}
              onChange={(e) => setPromptTerminologyEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-0.5 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? '正在保存...' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

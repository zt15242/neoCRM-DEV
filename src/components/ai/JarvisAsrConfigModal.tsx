import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  X, 
  ExternalLink, 
  CheckCircle2, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  Volume2, 
  Settings2,
  RefreshCw,
  Sliders
} from 'lucide-react';
import { BUILTIN_SILICONFLOW_KEY } from '../../../shared/constants';

interface JarvisAsrConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (apiKey: string) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const JarvisAsrConfigModal: React.FC<JarvisAsrConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'mic' | 'key'>('mic');
  const [apiKey, setApiKey] = useState(BUILTIN_SILICONFLOW_KEY || '');
  const [provider, setProvider] = useState<'siliconflow' | 'openai'>('siliconflow');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // 麦克风硬件设备枚举与试音状态
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    localStorage.getItem('jarvis_mic_device_id') || ''
  );
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testVolume, setTestVolume] = useState(0); // 0 ~ 100

  const testStreamRef = useRef<MediaStream | null>(null);
  const testAudioCtxRef = useRef<AudioContext | null>(null);
  const testAnimFrameRef = useRef<number | null>(null);

  // 加载音频输入设备列表
  const refreshDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        // 先触发一次轻量权限探测以确保能获取真实的设备 label
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
        } catch {}

        const allDevs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevs.filter((d) => d.kind === 'audioinput');
        setDevices(audioInputs);

        if (!selectedDeviceId && audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      }
    } catch (e: any) {
      console.warn('[Jarvis Mic] 获取设备列表失败:', e.message);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshDevices();
    } else {
      stopMicTest();
    }
  }, [isOpen]);

  // 停止试音
  const stopMicTest = () => {
    if (testAnimFrameRef.current) {
      cancelAnimationFrame(testAnimFrameRef.current);
      testAnimFrameRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (testAudioCtxRef.current && testAudioCtxRef.current.state !== 'closed') {
      try {
        testAudioCtxRef.current.close();
      } catch {}
      testAudioCtxRef.current = null;
    }
    setIsTestingMic(false);
    setTestVolume(0);
  };

  // 启动实时拾音测试 (麦克风音量跳动条)
  const startMicTest = async () => {
    stopMicTest();
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, echoCancellation: true }
          : { echoCancellation: true },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      testAudioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      setIsTestingMic(true);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const volPercent = Math.min(100, Math.round((avg / 128) * 100));
        setTestVolume(volPercent);
        testAnimFrameRef.current = requestAnimationFrame(loop);
      };

      testAnimFrameRef.current = requestAnimationFrame(loop);
    } catch (err: any) {
      setFeedback({ type: 'error', text: `无法开启测试: ${err.message}` });
      setIsTestingMic(false);
    }
  };

  // 保存麦克风设备偏好
  const handleSelectDevice = (devId: string) => {
    setSelectedDeviceId(devId);
    if (devId) {
      localStorage.setItem('jarvis_mic_device_id', devId);
    } else {
      localStorage.removeItem('jarvis_mic_device_id');
    }
    if (isTestingMic) {
      setTimeout(() => startMicTest(), 100);
    }
  };

  if (!isOpen) return null;

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      setFeedback({ type: 'error', text: '请输入有效的 API Key' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      if (window.neoApi?.jarvisSaveAsrKey) {
        const res = await window.neoApi.jarvisSaveAsrKey(cleanKey, provider);
        if (res.success) {
          setFeedback({ type: 'success', text: '语音识别服务已开启！' });
          showToast?.('success', '语音识别 Key 已就绪！现在您可以按住说话了。');
          setTimeout(() => {
            onSuccess(cleanKey);
            onClose();
          }, 600);
          return;
        } else {
          setFeedback({ type: 'error', text: res.error || '保存失败' });
        }
      } else {
        onSuccess(cleanKey);
        onClose();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `保存异常: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-[420px] bg-[#070d1a] border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(0,242,254,0.3)] text-cyan-50 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* 头部 */}
        <div className="px-4 py-3.5 border-b border-cyan-500/20 flex items-center justify-between bg-cyan-950/40">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-cyan-200 tracking-wide">
                贾维斯声学与对讲中心
              </h3>
              <p className="text-[10px] text-cyan-400/60 font-mono">
                J.A.R.V.I.S. ACOUSTIC DIAGNOSTICS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-cyan-400/60 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 顶部标签切换 */}
        <div className="px-4 pt-3 flex items-center space-x-2 border-b border-cyan-500/15 bg-cyan-950/20 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('mic')}
            className={`pb-2 px-2.5 font-bold transition-all border-b-2 flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'mic'
                ? 'border-cyan-400 text-cyan-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>麦克风设备与拾音自检</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('key')}
            className={`pb-2 px-2.5 font-bold transition-all border-b-2 flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'key'
                ? 'border-cyan-400 text-cyan-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>识别通道 (内置 SiliconFlow)</span>
          </button>
        </div>

        {/* 标签 1: 麦克风硬件自检与试音 */}
        {activeTab === 'mic' && (
          <div className="p-4 space-y-4 text-xs">
            {/* 设备选择 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-cyan-300">
                  当前输入音频设备 ({devices.length} 个可用)
                </label>
                <button
                  type="button"
                  onClick={refreshDevices}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-0.5 cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5 mr-0.5" />
                  <span>刷新设备</span>
                </button>
              </div>

              <select
                value={selectedDeviceId}
                onChange={(e) => handleSelectDevice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/40 rounded-xl text-xs text-cyan-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-sans"
              >
                <option value="">跟随系统默认麦克风 (推荐)</option>
                {devices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `音频输入设备 ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 实时拾音动态测试条 */}
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${isTestingMic ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                  <span className="text-[11px] font-bold text-cyan-200">实时拾音测试</span>
                </div>
                <button
                  type="button"
                  onClick={isTestingMic ? stopMicTest : startMicTest}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                    isTestingMic
                      ? 'bg-red-950/80 border border-red-500/40 text-red-300 hover:bg-red-900'
                      : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_10px_rgba(0,242,254,0.3)]'
                  }`}
                >
                  {isTestingMic ? '停止试音' : '开启试音测试'}
                </button>
              </div>

              {/* 音量跳动条 */}
              <div className="space-y-1">
                <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-cyan-500/20 p-0.5 flex items-center">
                  <div
                    style={{ width: `${testVolume}%` }}
                    className={`h-full rounded-full transition-all duration-75 ${
                      testVolume > 60
                        ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
                        : testVolume > 20
                        ? 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                        : 'bg-cyan-500/60'
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400/70">
                  <span>静音</span>
                  <span className="font-bold text-cyan-300">
                    {isTestingMic
                      ? testVolume > 25
                        ? `拾音饱满 (${testVolume}%) ✓`
                        : testVolume > 5
                        ? `检测到声音 (${testVolume}%)`
                        : '未检测到声音 (请对麦克风说话)'
                      : '点击上方「开启试音测试」开始检测'}
                  </span>
                  <span>最大</span>
                </div>
              </div>

              <p className="text-[10px] text-cyan-300/60 leading-normal">
                提示：若开启试音后对着电脑说话进度条完全不动，请检查 Mac<strong>「系统设置 - 声音 - 输入」</strong>中的输入音量是否过低或被静音。
              </p>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs uppercase hover:brightness-110 active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                完成自检并返回
              </button>
            </div>
          </div>
        )}

        {/* 标签 2: API 识别通道配置 */}
        {activeTab === 'key' && (
          <form onSubmit={handleSaveKey} className="p-4 space-y-3.5 text-xs">
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-1 text-emerald-200 leading-relaxed">
              <div className="flex items-center space-x-1.5 font-bold text-[11px] text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>已内置高可用 SiliconFlow 免费极速通道</span>
              </div>
              <p className="text-[10px] text-emerald-300/80 leading-normal">
                系统已默认内置了由官方托管的 SiliconFlow SenseVoice 密钥，无需任何配置即可开箱即用。若您有私人 Key，也可在此处替换。
              </p>
            </div>

            {/* 供应商选择 */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-cyan-300 block">服务商选择</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setProvider('siliconflow')}
                  className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    provider === 'siliconflow'
                      ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200 font-bold shadow-[0_0_12px_rgba(0,242,254,0.25)]'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-[11px]">硅基流动 (内置)</div>
                    <div className="text-[9px] text-emerald-400 font-mono">SenseVoice · 毫秒级</div>
                  </div>
                  {provider === 'siliconflow' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('openai')}
                  className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    provider === 'openai'
                      ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200 font-bold shadow-[0_0_12px_rgba(0,242,254,0.25)]'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-[11px]">OpenAI 官方</div>
                    <div className="text-[9px] text-slate-400 font-mono">Whisper-1</div>
                  </div>
                  {provider === 'openai' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>
              </div>
            </div>

            {/* API Key 输入框 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-cyan-300">
                  {provider === 'siliconflow' ? '硅基流动 API Key' : 'OpenAI API Key'}
                </label>
                {provider === 'siliconflow' && (
                  <button
                    type="button"
                    onClick={() => window.neoApi?.openExternal?.('https://cloud.siliconflow.cn/account/ak')}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-0.5 underline cursor-pointer"
                  >
                    <span>获取私人免费 Key</span>
                    <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/40 rounded-xl text-xs font-mono text-cyan-100 placeholder-cyan-500/40 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            {/* 反馈提示 */}
            {feedback && (
              <div
                className={`p-2 rounded-lg text-[11px] font-mono flex items-center space-x-1.5 ${
                  feedback.type === 'error'
                    ? 'bg-red-950/50 border border-red-500/40 text-red-300'
                    : 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-300'
                }`}
              >
                {feedback.type === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center space-x-1"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>保存配置</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

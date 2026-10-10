import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  X, 
  Eye, 
  Download, 
  Trash2, 
  RefreshCw, 
  Image as ImageIcon, 
  AlertCircle,
  Plus
} from 'lucide-react';

export interface ImageItem {
  fileId: string | number;
  fileName: string;
  url?: string;
  raw?: any;
}

interface ImageFieldComponentProps {
  fieldApiKey: string;
  fieldLabel: string;
  value: any;
  disabled?: boolean;
  onChange?: (newValue: any) => void;
}

/**
 * 智能解析图片字段的各种存储格式
 */
export function parseImageValue(rawVal: any): { items: ImageItem[]; isStringFormat: boolean } {
  if (!rawVal) return { items: [], isStringFormat: true };

  // 1. 若是字符串
  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim();
    if (!trimmed) return { items: [], isStringFormat: true };

    // 尝试解析 JSON 数组或对象
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return {
            items: parsed.map((p, idx) => ({
              fileId: p.fileId || p.id || p,
              fileName: p.fileName || p.name || `image_${idx + 1}.jpg`,
              raw: p,
            })),
            isStringFormat: true,
          };
        } else if (parsed && typeof parsed === 'object') {
          return {
            items: [
              {
                fileId: parsed.fileId || parsed.id,
                fileName: parsed.fileName || parsed.name || 'image.jpg',
                raw: parsed,
              },
            ],
            isStringFormat: true,
          };
        }
      } catch {}
    }

    // 纯数字 ID 字符串
    if (/^\d{8,20}$/.test(trimmed)) {
      return {
        items: [{ fileId: trimmed, fileName: 'image.jpg' }],
        isStringFormat: true,
      };
    }

    return { items: [], isStringFormat: true };
  }

  // 2. 若已经是数组
  if (Array.isArray(rawVal)) {
    return {
      items: rawVal.map((p, idx) => ({
        fileId: typeof p === 'object' ? p.fileId || p.id : p,
        fileName: typeof p === 'object' ? p.fileName || p.name || `image_${idx + 1}.jpg` : 'image.jpg',
        raw: p,
      })),
      isStringFormat: false,
    };
  }

  // 3. 单一数字或对象
  if (typeof rawVal === 'number') {
    return {
      items: [{ fileId: rawVal, fileName: 'image.jpg' }],
      isStringFormat: false,
    };
  }

  if (typeof rawVal === 'object' && rawVal !== null) {
    return {
      items: [{ fileId: rawVal.fileId || rawVal.id, fileName: rawVal.fileName || 'image.jpg', raw: rawVal }],
      isStringFormat: false,
    };
  }

  return { items: [], isStringFormat: true };
}

/**
 * 判断是否为图片字段
 */
export function isImageField(field: { itemType?: number; apiKey: string }, rawVal?: any): boolean {
  if (field.itemType === 14 || field.itemType === 29) return true;
  if (/picture|image|photo|avatar/i.test(field.apiKey)) return true;
  if (typeof rawVal === 'string' && rawVal.includes('"fileId"')) return true;
  if (Array.isArray(rawVal) && rawVal.length > 0 && rawVal[0]?.fileId) return true;
  return false;
}

export const ImageFieldComponent: React.FC<ImageFieldComponentProps> = ({
  fieldApiKey,
  fieldLabel,
  value,
  disabled = false,
  onChange,
}) => {
  const { items: initialItems, isStringFormat } = parseImageValue(value);
  const [items, setItems] = useState<ImageItem[]>(initialItems);
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});

  // 灯箱大图预览状态
  const [previewItem, setPreviewItem] = useState<{ url: string; name: string; fileId: string | number } | null>(null);

  // 上传状态
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当外部 value 变化时同步内部 items
  useEffect(() => {
    const res = parseImageValue(value);
    setItems(res.items);
  }, [value]);

  // 异步加载所有图片的 Base64 Data URL
  useEffect(() => {
    items.forEach((item) => {
      const idStr = String(item.fileId);
      if (!idStr || dataUrls[idStr] || loadingIds[idStr]) return;

      setLoadingIds((prev) => ({ ...prev, [idStr]: true }));
      window.neoApi
        ?.fetchImageDataUrl(item.fileId)
        .then((res) => {
          if (res.success && res.dataUrl) {
            setDataUrls((prev) => ({ ...prev, [idStr]: res.dataUrl! }));
          }
        })
        .finally(() => {
          setLoadingIds((prev) => ({ ...prev, [idStr]: false }));
        });
    });
  }, [items]);

  // 更新字段值给上层组件
  const triggerChange = (newItems: ImageItem[]) => {
    setItems(newItems);
    if (!onChange) return;

    if (newItems.length === 0) {
      onChange(null);
      return;
    }

    if (isStringFormat) {
      const payload = newItems.map((item) => ({
        fileId: Number(item.fileId) || item.fileId,
        fileName: item.fileName,
      }));
      onChange(JSON.stringify(payload));
    } else {
      onChange(
        newItems.map((item) => ({
          fileId: Number(item.fileId) || item.fileId,
          fileName: item.fileName,
        }))
      );
    }
  };

  // 选择并上传图片
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files.length) return;
    const file = e.target.files[0];

    setUploading(true);
    try {
      // 1. 读取为 base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          // 剔除 data:image/xxx;base64, 前缀
          const base64Clean = res.split(',')[1] || res;
          resolve(base64Clean);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // 2. 调用主进程上传接口
      const res = await window.neoApi.uploadImage(base64Data, file.name, file.type || 'image/jpeg');
      if (res.success && res.fileId) {
        const newItem: ImageItem = {
          fileId: res.fileId,
          fileName: res.fileName || file.name,
        };
        const nextItems = [...items, newItem];
        triggerChange(nextItems);
      } else {
        alert(`上传图片失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`上传异常: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 删除单张图片
  const handleDeleteItem = (index: number) => {
    const next = items.filter((_, idx) => idx !== index);
    triggerChange(next);
  };

  // 下载图片
  const handleDownload = (dataUrl: string, name: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name || 'image.jpg';
    a.click();
  };

  return (
    <div className="w-full space-y-2">
      {/* 缩略图网格与上传按钮 */}
      <div className="flex flex-wrap items-center gap-2.5">
        {items.map((item, index) => {
          const idStr = String(item.fileId);
          const dataUrl = dataUrls[idStr];
          const isLoading = loadingIds[idStr];

          return (
            <div
              key={`${idStr}_${index}`}
              className="relative group w-20 h-20 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center shadow-2xs transition-all hover:shadow-sm hover:border-sky-300"
            >
              {isLoading ? (
                <div className="flex flex-col items-center space-y-1 text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                  <span className="text-[9px]">加载中</span>
                </div>
              ) : dataUrl ? (
                <img
                  src={dataUrl}
                  alt={item.fileName}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setPreviewItem({ url: dataUrl, name: item.fileName, fileId: item.fileId })}
                />
              ) : (
                <div
                  className="flex flex-col items-center space-y-1 text-slate-400 p-1 text-center cursor-pointer"
                  onClick={() =>
                    dataUrl && setPreviewItem({ url: dataUrl, name: item.fileName, fileId: item.fileId })
                  }
                >
                  <ImageIcon className="w-5 h-5 text-slate-300" />
                  <span className="text-[9px] truncate max-w-[70px]">{item.fileName}</span>
                </div>
              )}

              {/* 悬浮操作遮罩 */}
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1.5 backdrop-blur-2xs">
                {dataUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewItem({ url: dataUrl, name: item.fileName, fileId: item.fileId })}
                    className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-transform hover:scale-110 shadow-xs"
                    title="查看高清大图"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-600" />
                  </button>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(index)}
                    className="p-1.5 bg-white/90 hover:bg-white text-rose-600 rounded-lg transition-transform hover:scale-110 shadow-xs"
                    title="移除此图片"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* 上传新图片按钮 (仅在非只读模式下显示) */}
        {!disabled && (
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-sky-500 bg-white hover:bg-sky-50/40 flex flex-col items-center justify-center cursor-pointer transition-all shadow-2xs group ${
              uploading ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="点击上传新图片 (支持 jpg/png/webp)"
          >
            {uploading ? (
              <RefreshCw className="w-5 h-5 animate-spin text-sky-600" />
            ) : (
              <>
                <Plus className="w-5 h-5 text-slate-400 group-hover:text-sky-600 transition-colors" />
                <span className="text-[10px] text-slate-500 group-hover:text-sky-700 font-medium mt-0.5">
                  添加图片
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* 如果没有图片且是只读模式 */}
      {disabled && items.length === 0 && (
        <span className="text-xs text-slate-400 italic">暂无图片</span>
      )}

      {/* 全屏高清大图查看器 (Lightbox Modal) */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* 顶栏 */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-semibold text-slate-900 truncate max-w-md">
                  {previewItem.name}
                </span>
                <span className="text-[10px] font-mono text-slate-400">ID: {previewItem.fileId}</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownload(previewItem.url, previewItem.name)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors flex items-center space-x-1"
                  title="下载原图"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 图片展示区 */}
            <div className="p-4 flex items-center justify-center bg-slate-100/60 max-h-[75vh] overflow-auto">
              <img
                src={previewItem.url}
                alt={previewItem.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

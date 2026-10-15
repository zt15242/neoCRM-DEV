import React from 'react';
import { 
  FileCode, 
  FileText, 
  FileSpreadsheet, 
  File, 
  Image, 
  ExternalLink, 
  Eye, 
  ChevronRight,
  Terminal,
  Sparkles
} from 'lucide-react';
import { AiToolCallRecord } from '../../../shared/types';

export interface ArtifactFile {
  name: string;
  fullPath: string;
  relativePath: string;
  ext: string;
  size: number;
  exists: boolean;
}

interface MessageArtifactsCardProps {
  content: string;
  toolCalls?: AiToolCallRecord[];
  projectPath?: string;
  onOpenArtifactsPanel?: () => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

/**
 * 格式化字节大小为 KB / MB
 */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '产物文件';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 从消息内容和工具调用中智能提取生成的产物文件列表
 */
export function extractArtifactsFromMessage(
  content: string,
  toolCalls: AiToolCallRecord[] = [],
  projectPath = ''
): ArtifactFile[] {
  if (!content && (!toolCalls || toolCalls.length === 0)) return [];

  const artifactsMap = new Map<string, ArtifactFile>();

  const addArtifact = (rawPath: string) => {
    if (!rawPath) return;
    const cleanPath = rawPath.replace(/^[`'"]+|[`'"]+$/g, '').trim();
    const fileName = cleanPath.split(/[\/\\]/).filter(Boolean).pop();
    if (!fileName || fileName.startsWith('.') || fileName.length < 3) return;

    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    if (!extMatch) return;
    const ext = `.${extMatch[1].toLowerCase()}`;

    // 重点产物格式清单 (完全对齐截图中 html, json, csv, docx 等)
    const validExts = ['.html', '.htm', '.json', '.csv', '.xlsx', '.xls', '.docx', '.doc', '.pdf', '.py', '.ts', '.js', '.sql', '.png', '.jpg'];
    if (!validExts.includes(ext)) return;

    let fullPath = cleanPath;
    if (projectPath && !cleanPath.startsWith('/') && !cleanPath.includes(':')) {
      fullPath = `${projectPath.replace(/[\/\\]$/, '')}/${cleanPath}`;
    }

    if (!artifactsMap.has(fileName)) {
      artifactsMap.set(fileName, {
        name: fileName,
        fullPath,
        relativePath: cleanPath,
        ext,
        size: 0,
        exists: false,
      });
    }
  };

  // 1. 扫描工具调用
  for (const tc of toolCalls) {
    if (tc.name === 'write' || tc.name === 'edit') {
      const p = tc.arguments?.file_path;
      if (p) addArtifact(p);
    } else if (tc.name === 'str_replace_editor' && tc.arguments?.command === 'create') {
      const p = tc.arguments?.path;
      if (p) addArtifact(p);
    }
  }

  // 2. 扫描文本中由 AI 汇报生成或提及的文件路径 (如 crm-objects.html, objects_full.json, objects.csv, xxx.docx)
  const regex = /(?:生成文件路径[：:]\s*[`'"]?([^\s`'"]+)[\`'"]?)|(?:产出的(?:几个|三个|两个|文件)?[：:]?\s*)|(?:[`'"]([a-zA-Z0-9_\-./\\]+?\.(?:html|json|csv|docx|xlsx|pdf|py|ts|js|png|jpg|txt|sql))[`'"])/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const p = match[1] || match[2];
    if (p) addArtifact(p);
  }

  // 备用正则扫描常见产物文件命名
  const simpleFileRegex = /\b([a-zA-Z0-9_\-]+\.(?:html|json|csv|docx|xlsx|pdf|py))\b/gi;
  let sm;
  while ((sm = simpleFileRegex.exec(content)) !== null) {
    if (sm[1] && !sm[1].startsWith('index.') && !sm[1].startsWith('package.')) {
      addArtifact(sm[1]);
    }
  }

  return Array.from(artifactsMap.values());
}

export const MessageArtifactsCard: React.FC<MessageArtifactsCardProps> = ({
  content,
  toolCalls = [],
  projectPath,
  onOpenArtifactsPanel,
  showToast,
}) => {
  const [artifacts, setArtifacts] = React.useState<ArtifactFile[]>([]);

  React.useEffect(() => {
    const list = extractArtifactsFromMessage(content, toolCalls, projectPath);
    // 异步尝试补全文件真实大小
    if (list.length > 0 && window.neoApi?.projectGetRecentArtifacts) {
      window.neoApi.projectGetRecentArtifacts(projectPath, 50).then((recent) => {
        if (Array.isArray(recent)) {
          const updated = list.map((art) => {
            const matched = recent.find((r) => r.name === art.name);
            if (matched) {
              return {
                ...art,
                size: matched.size,
                fullPath: matched.fullPath,
                exists: true,
              };
            }
            return art;
          });
          setArtifacts(updated);
        } else {
          setArtifacts(list);
        }
      }).catch(() => setArtifacts(list));
    } else {
      setArtifacts(list);
    }
  }, [content, toolCalls.length, projectPath]);

  if (artifacts.length === 0) return null;

  // 根据文件扩展名返回专属图标与背景色彩 (完全还原用户截图设计)
  const renderIconBadge = (ext: string) => {
    switch (ext) {
      case '.html':
      case '.htm':
        return (
          <div className="w-8 h-8 rounded-xl bg-purple-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            &lt;&gt;
          </div>
        );
      case '.json':
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            &lt;_
          </div>
        );
      case '.csv':
      case '.xlsx':
      case '.xls':
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
        );
      case '.docx':
      case '.doc':
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            <FileText className="w-4 h-4" />
          </div>
        );
      case '.py':
      case '.ts':
      case '.js':
        return (
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            <FileCode className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-slate-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            <File className="w-4 h-4" />
          </div>
        );
    }
  };

  const handleOpen = async (art: ArtifactFile) => {
    try {
      if (window.neoApi?.shellOpenPath && art.fullPath) {
        await window.neoApi.shellOpenPath(art.fullPath);
        showToast?.('success', `已在系统应用中打开: ${art.name}`);
      }
    } catch (e: any) {
      showToast?.('error', `打开文件失败: ${e.message}`);
    }
  };

  return (
    <div className="my-3 space-y-2 select-none">
      {/* 产物网格卡片 (两列平铺，完全对齐截图效果) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {artifacts.map((art) => (
          <div
            key={art.name}
            onClick={() => handleOpen(art)}
            title={`点击打开文件: ${art.name}\n${art.fullPath || ''}`}
            className="p-3 rounded-2xl bg-slate-100/70 hover:bg-slate-100 border border-slate-200/60 shadow-2xs flex items-center justify-between gap-3 cursor-pointer transition-all hover:border-slate-300 group"
          >
            <div className="flex items-center space-x-3 min-w-0 pr-1">
              {renderIconBadge(art.ext)}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-sky-700 transition-colors">
                  {art.name}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {formatFileSize(art.size)}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60">
                <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 底部查看所有产物链接 (对齐截图 `查看所有产物 (3) >`) */}
      {onOpenArtifactsPanel && (
        <button
          type="button"
          onClick={onOpenArtifactsPanel}
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 cursor-pointer transition-colors pt-0.5 group"
        >
          <span className="group-hover:underline">查看所有产物 ({artifacts.length})</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
};

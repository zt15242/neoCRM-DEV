import React, { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  Folder, 
  X, 
  FolderOpen, 
  Check, 
  AlertCircle,
  FileText
} from 'lucide-react';
import { WorkspaceProject } from '../../../shared/types';

interface CreateProjectModalProps {
  isOpen: boolean;
  editingProject?: WorkspaceProject | null;
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; localPath: string; description?: string }) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  editingProject,
  onClose,
  onSave,
  showToast,
}) => {
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [description, setDescription] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingProject) {
        setName(editingProject.name);
        setLocalPath(editingProject.localPath);
        setDescription(editingProject.description || '');
      } else {
        setName('');
        setLocalPath('');
        setDescription('');
      }
    }
  }, [isOpen, editingProject]);

  if (!isOpen) return null;

  // 调用系统原生目录选择器
  const handleBrowseFolder = async () => {
    if (!window.neoApi?.selectFolder) return;
    setIsSelecting(true);
    try {
      const selected = await window.neoApi.selectFolder();
      if (selected) {
        setLocalPath(selected);
        // 如果项目名称为空，自动采用选定文件夹的名称
        if (!name.trim()) {
          const folderName = selected.split(/[\/\\]/).filter(Boolean).pop() || '新项目';
          setName(folderName);
        }
      }
    } catch (e: any) {
      showToast?.('error', `选择目录失败: ${e.message}`);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast?.('error', '请输入项目名称');
      return;
    }
    if (!localPath.trim()) {
      showToast?.('error', '请选择或输入本地项目目录路径');
      return;
    }

    onSave({
      id: editingProject?.id,
      name: name.trim(),
      localPath: localPath.trim(),
      description: description.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {editingProject ? '编辑本地项目工作区' : '添加 / 关联本地项目文件夹'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                绑定本机物理文件目录，AI 工具（Bash、代码编辑、文件检索）将在该目录下执行
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单主体 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* 项目本地路径 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>本地项目文件存储路径 *</span>
              <span className="text-[10px] text-slate-400">本机物理文件目录</span>
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                required
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/Users/username/Desktop/my-project"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/50 text-slate-800 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={isSelecting}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium flex items-center space-x-1 shrink-0 cursor-pointer shadow-2xs"
              >
                <FolderOpen className="w-4 h-4 text-amber-600" />
                <span>{isSelecting ? '选择中...' : '选择目录...'}</span>
              </button>
            </div>
          </div>

          {/* 项目名称 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700">
              项目工作区名称 *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：neoCRM-DEV、设备维保工单系统"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* 项目描述 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>项目描述 (可选)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要说明该项目的业务范围或用途..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-800 text-[11px] leading-relaxed flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span>项目文件夹创建后，将在左侧边栏以项目树展示。在该项目下新建的 AI 会话将自动以该目录为工作区根目录，支持代码读写、全局检索与终端执行。</span>
            </div>
          </div>

          {/* 底部按键 */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingProject ? '保存变更' : '确认添加项目'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

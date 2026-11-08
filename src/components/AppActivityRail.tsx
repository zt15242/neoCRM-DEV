import React from 'react';
import { Box, Code2, Database, LayoutDashboard, LayoutTemplate, Mail, NotebookPen, Settings } from 'lucide-react';
import type { AppNavTab } from './AppSidebar';

export function AppActivityRail({ activeTab, onSelectTab, onOpenSettings }: {
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
  onOpenSettings: () => void;
}) {
  const applications = [
    { tab: 'ai' as const, label: '代码', title: '代码工作区', icon: Code2 },
    { tab: 'meeting' as const, label: '会议', title: '会议助手 · 纪要与行动项', icon: NotebookPen },
    { tab: 'mail' as const, label: '邮件', title: '邮件', icon: Mail },
    { tab: 'dashboard' as const, label: '连接', title: 'CRM 连接器', icon: LayoutDashboard },
    { tab: 'metadata' as const, label: '对象', title: '对象与字段', icon: Box },
    { tab: 'data' as const, label: '数据', title: '数据中心', icon: Database },
    { tab: 'workspace' as const, label: '工作台', title: '自定义工作台', icon: LayoutTemplate },
  ];
  return <nav className="app-activity-rail" aria-label="应用导航">
    <div className="activity-rail-apps">{applications.map(({ tab, label, title, icon: Icon }) => (
      <button key={tab} title={title} aria-label={title} aria-current={activeTab === tab ? 'page' : undefined}
        className={activeTab === tab ? 'is-active' : ''} onClick={() => onSelectTab(tab)}>
        <Icon size={20} strokeWidth={1.65} /><span>{label}</span>
      </button>
    ))}</div>
    <button className="activity-rail-settings" title="应用设置" aria-label="应用设置" onClick={onOpenSettings}><Settings size={20} strokeWidth={1.65} /><span>设置</span></button>
  </nav>;
}

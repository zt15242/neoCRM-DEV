/**
 * Foxmail 风格企业级邮件客户端与 AI 智能副驾驶类型定义
 */

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'starred' | 'trash' | `imap:${string}`;

export interface EmailMailboxFolder {
  key: `imap:${string}`;
  path: string;
  name: string;
}

/**
 * 对应用户截图中的 8 大主流邮件服务商
 */
export type EmailProviderType =
  | 'tencent_exmail'  // 腾讯企业邮
  | 'qq'              // QQ邮箱
  | 'exchange'        // Exchange
  | 'm365_intl'       // Microsoft 365 国际版
  | 'm365_cn'         // Microsoft 365 国内版 (世纪互联)
  | 'gmail'           // Gmail
  | '163'             // 163邮箱
  | 'custom';         // 其它邮箱

export interface EmailProviderPreset {
  id: EmailProviderType;
  name: string;
  badge: string;
  iconType: string;
  defaultImapHost: string;
  defaultImapPort: number;
  defaultImapSsl: boolean;
  defaultSmtpHost: string;
  defaultSmtpPort: number;
  defaultSmtpSsl: boolean;
  helpTip: string;
  placeholderEmail: string;
  authCodeLabel: string;
}

export const EMAIL_PROVIDER_PRESETS: EmailProviderPreset[] = [
  {
    id: 'tencent_exmail',
    name: '腾讯企业邮',
    badge: '企业微信',
    iconType: 'exmail',
    defaultImapHost: 'imap.exmail.qq.com',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'smtp.exmail.qq.com',
    defaultSmtpPort: 465,
    defaultSmtpSsl: true,
    helpTip: '如开启了安全登录，请使用企业微信/企业邮箱生成的专用客户端授权密码登录。',
    placeholderEmail: 'user@company.com',
    authCodeLabel: '企业邮箱密码 / 客户端授权密码',
  },
  {
    id: 'qq',
    name: 'QQ邮箱',
    badge: 'mail.qq.com',
    iconType: 'qq',
    defaultImapHost: 'imap.qq.com',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'smtp.qq.com',
    defaultSmtpPort: 465,
    defaultSmtpSsl: true,
    helpTip: '请登录网页版 QQ邮箱 ➔ 设置 ➔ 账户 ➔ 开启 POP3/IMAP/SMTP 服务并生成 16 位独立授权码登录（非QQ密码）。',
    placeholderEmail: 'yourname@qq.com',
    authCodeLabel: 'QQ 邮箱 16 位授权码 (非 QQ 密码)',
  },
  {
    id: 'exchange',
    name: 'Exchange',
    badge: 'Microsoft',
    iconType: 'exchange',
    defaultImapHost: 'mail.company.com',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'mail.company.com',
    defaultSmtpPort: 587,
    defaultSmtpSsl: false,
    helpTip: '支持自建企业 Exchange 服务的 IMAP/SMTP 接入，请输入企业邮件服务器地址与域账号。',
    placeholderEmail: 'user@corp.local',
    authCodeLabel: 'Exchange 域密码 / 应用程序密码',
  },
  {
    id: 'm365_intl',
    name: 'Microsoft 365 国际版',
    badge: 'Global M365',
    iconType: 'm365',
    defaultImapHost: 'outlook.office365.com',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'smtp.office365.com',
    defaultSmtpPort: 587,
    defaultSmtpSsl: false,
    helpTip: '支持国际版 Office 365 / Outlook.com / Hotmail。若开启了两步验证，请使用微软账户后台生成的“应用专用密码”。',
    placeholderEmail: 'user@company.onmicrosoft.com',
    authCodeLabel: '微软密码 / 应用专用密码',
  },
  {
    id: 'm365_cn',
    name: 'Microsoft 365 国内版',
    badge: '世纪互联运营',
    iconType: 'm365_cn',
    defaultImapHost: 'partner.outlook.cn',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'partner.outlook.cn',
    defaultSmtpPort: 587,
    defaultSmtpSsl: false,
    helpTip: '专用于由世纪互联在华运营的 Microsoft 365 商业版 / 教育版客户。',
    placeholderEmail: 'user@partner.company.cn',
    authCodeLabel: '世纪互联 M365 账号密码',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    badge: 'Google',
    iconType: 'gmail',
    defaultImapHost: 'imap.gmail.com',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'smtp.gmail.com',
    defaultSmtpPort: 465,
    defaultSmtpSsl: true,
    helpTip: '请登录 Google 账号安全性设置，开启两步验证并生成 16 位“应用专用密码 (App Password)”登录。',
    placeholderEmail: 'yourname@gmail.com',
    authCodeLabel: 'Google 应用专用密码 (App Password)',
  },
  {
    id: '163',
    name: '163邮箱',
    badge: '网易163/126/yeah',
    iconType: '163',
    defaultImapHost: 'imap.163.com',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: 'smtp.163.com',
    defaultSmtpPort: 465,
    defaultSmtpSsl: true,
    helpTip: '请登录网页版 163 邮箱 ➔ 设置 ➔ POP3/SMTP/IMAP ➔ 开启服务并获取客户端授权密码（非登录密码）。',
    placeholderEmail: 'yourname@163.com',
    authCodeLabel: '网易客户端授权密码 (非网页登录密码)',
  },
  {
    id: 'custom',
    name: '其它邮箱',
    badge: 'POP3/IMAP/SMTP',
    iconType: 'custom',
    defaultImapHost: '',
    defaultImapPort: 993,
    defaultImapSsl: true,
    defaultSmtpHost: '',
    defaultSmtpPort: 465,
    defaultSmtpSsl: true,
    helpTip: '支持阿里云企业邮 (imap.qiye.aliyun.com)、新浪、搜狐、SmarterMail 及各类自建邮件系统。',
    placeholderEmail: 'name@yourdomain.com',
    authCodeLabel: '邮箱登录密码 / 授权凭据',
  },
];

export interface EmailContact {
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  company?: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  ext: string;
  url?: string;
}

/**
 * 邮件单项需求洞察
 */
export interface EmailNeedItem {
  id: string;
  category: 'feature' | 'business' | 'contract' | 'support' | 'customization' | 'other';
  title: string;
  description: string;
  urgency: 'high' | 'medium' | 'low';
}

/**
 * 邮件待办行动项
 */
export interface EmailActionItem {
  id: string;
  task: string;
  deadline?: string;
  assignee?: string;
  completed?: boolean;
}

/**
 * AI 邮件内容与业务需求深度分析结果
 */
export interface EmailAnalysisResult {
  analyzedAt: number;
  modelUsed?: string;
  summary: string;
  intent: string;
  urgencyLevel: 'high' | 'medium' | 'low';
  urgencyReason: string;
  sentiment: 'positive' | 'neutral' | 'anxious' | 'critical';
  sentimentLabel: string;
  needs: EmailNeedItem[];
  actionItems: EmailActionItem[];
  keyInsights: string[];
  relatedCrmEntity?: {
    type: 'Opportunity' | 'Contract' | 'Account' | 'Case' | 'Custom';
    name: string;
    details: string;
  };
}

/**
 * 邮件数据实体
 */
export interface EmailItem {
  id: string;
  accountId: string;
  folder: EmailFolder;
  mailboxPath?: string;
  mailboxName?: string;
  imapUid?: number;
  from: EmailContact;
  to: EmailContact[];
  cc?: EmailContact[];
  bcc?: EmailContact[];
  subject: string;
  date: number;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  isRead: boolean;
  isStarred: boolean;
  attachments?: EmailAttachment[];
  tags?: string[];
  analysis?: EmailAnalysisResult;
}

/**
 * 联系人人物画像 (Contact Persona & Behavioral Profile)
 */
export interface ContactPersona {
  email: string;
  name: string;
  avatar?: string;
  company?: string;
  title?: string;
  department?: string;
  phone?: string;
  roleType: 'decision_maker' | 'technical_lead' | 'procurement' | 'business_manager' | 'end_user' | 'unknown';
  roleTypeLabel: string;
  personalityTraits: string[];
  communicationStyle: string;
  coreConcerns: string[];
  trustLevel: number;
  riskSignals: string[];
  negotiationStrategy: string;
  emailCount: number;
  lastInteractedAt: number;
  manualNotes?: string;
  updatedAt: number;
}

/**
 * 邮件账户配置
 */
export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: EmailProviderType;
  providerLabel: string;
  isDefault?: boolean;
  signature?: string;
  // 协议配置
  imapHost: string;
  imapPort: number;
  imapSsl: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSsl: boolean;
  authUsername: string;
  authPassword?: string;
  authStatus?: 'connected' | 'auth_failed' | 'untested';
  lastSyncAt?: number;
  inboxUidValidity?: string;
  lastInboxUid?: number;
  sentUidValidity?: string;
  lastSentUid?: number;
  mailboxSyncState?: Record<string, { uidValidity: string; lastUid: number }>;
  remoteFolders?: EmailMailboxFolder[];
  lastError?: string;
}

/**
 * 智能回复生成选项
 */
export interface GenerateReplyOptions {
  emailId: string;
  tone: 'formal' | 'friendly' | 'efficient' | 'negotiation' | 'technical' | 'decline';
  focusPoints?: string;
  language?: 'zh' | 'en';
  personaContext?: boolean;
}

/**
 * 智能回复生成结果
 */
export interface GeneratedReplyResult {
  subject: string;
  body: string;
  tone: string;
  rationale: string;
}

/**
 * 测试/创建真实账户请求载荷
 */
export interface CreateEmailAccountPayload {
  provider: EmailProviderType;
  name: string;
  email: string;
  authPassword: string; // 密码或授权码
  authUsername?: string;
  imapHost?: string;
  imapPort?: number;
  imapSsl?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSsl?: boolean;
}

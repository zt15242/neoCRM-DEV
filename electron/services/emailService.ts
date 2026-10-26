import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { 
  EmailItem, 
  EmailAccount, 
  ContactPersona, 
  EmailAnalysisResult, 
  GenerateReplyOptions, 
  GeneratedReplyResult,
  CreateEmailAccountPayload,
  EMAIL_PROVIDER_PRESETS,
  EmailProviderType
} from '../../shared/mailTypes';
import { AiService } from './aiService';
import { BUILTIN_SILICONFLOW_KEY } from '../../shared/constants';

/**
 * Foxmail 风格邮件后端服务
 * 负责真实邮箱账户认证与登录、多账号管理、真实 IMAP 邮件拉取解析、SMTP 真实发送、
 * 以及 AI 邮件深度需求剖析、智能回复生成与指定邮箱联系人人物画像构建。
 */
export class EmailService {
  constructor(private aiService: AiService) {
    this.ensureDataInitialized();
  }

  private getDataDir(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return userData;
  }

  private getEmailsFilePath(): string {
    return path.join(this.getDataDir(), 'neocrm_emails.json');
  }

  private getPersonasFilePath(): string {
    return path.join(this.getDataDir(), 'neocrm_personas.json');
  }

  private getAccountsFilePath(): string {
    return path.join(this.getDataDir(), 'neocrm_email_accounts.json');
  }

  // ================= 基础存储与初始化 =================

  public getAccounts(): EmailAccount[] {
    const p = this.getAccountsFilePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      } catch {}
    }
    return [];
  }

  public saveAccounts(accounts: EmailAccount[]): EmailAccount[] {
    fs.writeFileSync(this.getAccountsFilePath(), JSON.stringify(accounts, null, 2), 'utf-8');
    return accounts;
  }

  public getEmails(): EmailItem[] {
    const p = this.getEmailsFilePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      } catch {}
    }
    const defaults = this.getDefaultEmails();
    this.saveEmails(defaults);
    return defaults;
  }

  public saveEmails(emails: EmailItem[]): EmailItem[] {
    fs.writeFileSync(this.getEmailsFilePath(), JSON.stringify(emails, null, 2), 'utf-8');
    return emails;
  }

  public getPersonas(): ContactPersona[] {
    const p = this.getPersonasFilePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      } catch {}
    }
    const defaults = this.getDefaultPersonas();
    this.savePersonas(defaults);
    return defaults;
  }

  public savePersonas(personas: ContactPersona[]): ContactPersona[] {
    fs.writeFileSync(this.getPersonasFilePath(), JSON.stringify(personas, null, 2), 'utf-8');
    return personas;
  }

  private ensureDataInitialized(): void {
    if (!fs.existsSync(this.getAccountsFilePath())) {
      this.saveAccounts([]);
    } else {
      // 彻底清理旧的模拟账号
      try {
        const raw = fs.readFileSync(this.getAccountsFilePath(), 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const cleaned = list.filter((a: any) => a.id !== 'acc_main' && !a.email?.includes('neocrm-enterprise.com'));
          this.saveAccounts(cleaned);
        }
      } catch {}
    }

    if (!fs.existsSync(this.getEmailsFilePath())) {
      this.saveEmails([]);
    } else {
      // 彻底清理旧的模拟邮件
      try {
        const raw = fs.readFileSync(this.getEmailsFilePath(), 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const cleaned = list.filter((e: any) => !e.id?.startsWith('mail_00') && !e.id?.startsWith('mail_in_') && e.accountId !== 'acc_main');
          this.saveEmails(cleaned);
        }
      } catch {}
    }

    if (!fs.existsSync(this.getPersonasFilePath())) {
      this.savePersonas([]);
    } else {
      // 彻底清理旧的模拟人物画像
      try {
        const raw = fs.readFileSync(this.getPersonasFilePath(), 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const cleaned = list.filter((p: any) => !p.email?.includes('olympus-group.com.cn') && !p.email?.includes('huaxin-tech.com') && !p.email?.includes('chinatransport.cn'));
          this.savePersonas(cleaned);
        }
      } catch {}
    }
  }

  // ================= 真实邮箱账户创建、测试连接与多账号管理 =================

  /**
   * 真实测试并保存邮箱账号 (连接真实 IMAP 进行 AUTH 认证)
   */
  public async testAndSaveAccount(payload: CreateEmailAccountPayload): Promise<{
    success: boolean;
    account?: EmailAccount;
    error?: string;
  }> {
    const cleanEmail = (payload.email || '').trim().toLowerCase();
    const cleanPassword = (payload.authPassword || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: '请输入有效的邮箱地址' };
    }
    if (!cleanPassword) {
      return { success: false, error: '请输入登录密码或客户端授权码' };
    }

    const preset = EMAIL_PROVIDER_PRESETS.find((p) => p.id === payload.provider)
      || EMAIL_PROVIDER_PRESETS[EMAIL_PROVIDER_PRESETS.length - 1];

    const imapHost = (payload.imapHost || preset.defaultImapHost).trim();
    const imapPort = Number(payload.imapPort) || preset.defaultImapPort || 993;
    const imapSsl = payload.imapSsl !== undefined ? payload.imapSsl : preset.defaultImapSsl;

    const smtpHost = (payload.smtpHost || preset.defaultSmtpHost).trim();
    const smtpPort = Number(payload.smtpPort) || preset.defaultSmtpPort || 465;
    const smtpSsl = payload.smtpSsl !== undefined ? payload.smtpSsl : preset.defaultSmtpSsl;

    const authUsername = (payload.authUsername || cleanEmail).trim();

    // 1. 发起真实 IMAP 握手认证
    let authSuccess = false;
    let authError = '';

    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: imapSsl,
      auth: {
        user: authUsername,
        pass: cleanPassword,
      },
      logger: false,
      emitLogs: false,
    });

    try {
      console.log(`[Email Service] 正在向真实邮箱服务器发起 IMAP 认证: ${imapHost}:${imapPort} (用户: ${authUsername})`);
      await client.connect();
      authSuccess = true;
      console.log(`[Email Service] 真实邮箱认证成功: ${cleanEmail}`);
    } catch (connErr: any) {
      console.warn(`[Email Service] 邮箱 IMAP 认证失败:`, connErr.message);
      authError = connErr.message || '邮箱服务器连接或认证失败';
    } finally {
      try {
        await client.logout();
      } catch {}
    }

    if (!authSuccess) {
      // 给出针对特定邮件厂商的温馨排错指导
      let friendlyTip = authError;
      if (payload.provider === 'qq') {
        friendlyTip += ' (提示: QQ 邮箱必须在网页端开启 POP3/IMAP 并使用生成的 16 位独立授权码登录)';
      } else if (payload.provider === '163') {
        friendlyTip += ' (提示: 163 邮箱必须在网页端设置中开启客户端授权密码登录)';
      } else if (payload.provider === 'gmail') {
        friendlyTip += ' (提示: Gmail 需开启两步验证并使用 Google 应用专用密码登录)';
      }
      return { success: false, error: friendlyTip };
    }

    // 2. 认证成功，落盘持久化账号
    const accounts = this.getAccounts();
    const existingIndex = accounts.findIndex((a) => a.email.toLowerCase() === cleanEmail);

    const newAccount: EmailAccount = {
      id: existingIndex >= 0 ? accounts[existingIndex].id : `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: payload.name.trim() || cleanEmail.split('@')[0],
      email: cleanEmail,
      provider: payload.provider,
      providerLabel: preset.name,
      isDefault: accounts.length === 0 || existingIndex === 0,
      signature: `${payload.name || cleanEmail.split('@')[0]}\n${cleanEmail}`,
      imapHost,
      imapPort,
      imapSsl,
      smtpHost,
      smtpPort,
      smtpSsl,
      authUsername,
      authPassword: cleanPassword,
      authStatus: 'connected',
      lastSyncAt: Date.now(),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = newAccount;
    } else {
      accounts.push(newAccount);
    }
    this.saveAccounts(accounts);

    // 3. 异步触发首次收取该真实邮箱最近邮件
    this.syncEmailsForAccount(newAccount.id).catch((err) => {
      console.warn('[Email Service] 新增账号初次收取邮件提示:', err.message);
    });

    return { success: true, account: newAccount };
  }

  public deleteAccount(accountId: string): boolean {
    const accounts = this.getAccounts();
    const filtered = accounts.filter((a) => a.id !== accountId);
    if (filtered.length === accounts.length) return false;
    if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
      filtered[0].isDefault = true;
    }
    this.saveAccounts(filtered);
    return true;
  }

  public setDefaultAccount(accountId: string): boolean {
    const accounts = this.getAccounts();
    accounts.forEach((a) => {
      a.isDefault = a.id === accountId;
    });
    this.saveAccounts(accounts);
    return true;
  }

  // ================= 真实邮件收取与同步 (Real IMAP Fetching) =================

  /**
   * 针对指定账号真实连接 IMAP 拉取最近邮件
   */
  public async syncEmailsForAccount(accountId: string): Promise<{ newCount: number; emails: EmailItem[] }> {
    const accounts = this.getAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`未找到指定账号 [${accountId}]`);
    }

    if (!account.authPassword) {
      console.log(`[Email Service] 账号 ${account.email} 未配置真实密码，跳过 IMAP 拉取`);
      return { newCount: 0, emails: this.getEmails() };
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSsl,
      auth: {
        user: account.authUsername || account.email,
        pass: account.authPassword,
      },
      logger: false,
      emitLogs: false,
    });

    const localEmails = this.getEmails();
    let fetchedCount = 0;

    try {
      console.log(`[Email Service] 正在连接 ${account.imapHost} 真实拉取收件箱邮件...`);
      await client.connect();

      const lock = await client.getMailboxLock('INBOX');
      try {
        const status = client.mailbox;
        const totalExists = typeof status === 'object' && status !== null ? status.exists : 0;
        console.log(`[Email Service] 线上收件箱邮件总数: ${totalExists}`);

        if (totalExists > 0) {
          // 拉取最近 25 封邮件
          const fetchFrom = Math.max(1, totalExists - 25);
          const range = `${fetchFrom}:${totalExists}`;

          for await (const message of client.fetch(range, {
            envelope: true,
            source: true,
            flags: true,
            internalDate: true,
          })) {
            try {
              const parsed = await simpleParser(message.source);
              const messageId = message.envelope.messageId || `imap_${account.id}_${message.seq}`;

              // 检查本地是否已存在
              const existingIdx = localEmails.findIndex(
                (e) => e.id === messageId || (e.subject === parsed.subject && Math.abs(e.date - (parsed.date?.getTime() || 0)) < 2000)
              );

              const senderName = parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address?.split('@')[0] || '未知发件人';
              const senderEmail = parsed.from?.value?.[0]?.address || 'unknown@domain.com';

              const toList = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
                .flatMap((t: any) => t.value || [])
                .map((t: any) => ({ name: t.name || t.address?.split('@')[0] || '收件人', email: t.address || '' }))
                .filter((t: any) => Boolean(t.email));

              const ccList = (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
                .flatMap((c: any) => c.value || [])
                .map((c: any) => ({ name: c.name || c.address?.split('@')[0] || '抄送人', email: c.address || '' }))
                .filter((c: any) => Boolean(c.email));

              const bodyText = parsed.text || '';
              const bodyHtml = parsed.html || undefined;
              const snippet = (bodyText || parsed.subject || '').replace(/\s+/g, ' ').slice(0, 150);

              const isSeen = message.flags.has('\\Seen');
              const isFlagged = message.flags.has('\\Flagged');

              const emailItem: EmailItem = {
                id: messageId,
                accountId: account.id,
                folder: 'inbox',
                from: {
                  name: senderName,
                  email: senderEmail,
                },
                to: toList.length > 0 ? toList : [{ name: account.name, email: account.email }],
                cc: ccList.length > 0 ? ccList : undefined,
                subject: parsed.subject || '（无主题）',
                date: parsed.date?.getTime() || message.internalDate.getTime() || Date.now(),
                snippet,
                bodyText,
                bodyHtml,
                isRead: isSeen,
                isStarred: isFlagged,
                tags: ['真实邮件'],
                attachments: parsed.attachments?.map((a, i) => ({
                  id: `att_${messageId}_${i}`,
                  name: a.filename || `附件_${i + 1}`,
                  size: a.size || 0,
                  ext: path.extname(a.filename || '').replace(/^\./, '') || 'dat',
                })),
              };

              if (existingIdx >= 0) {
                localEmails[existingIdx] = {
                  ...localEmails[existingIdx],
                  isRead: isSeen,
                  isStarred: isFlagged,
                };
              } else {
                localEmails.unshift(emailItem);
                fetchedCount++;
              }
            } catch (msgErr: any) {
              console.warn('[Email Service] 单封邮件解析异常:', msgErr.message);
            }
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
      account.authStatus = 'connected';
      account.lastSyncAt = Date.now();
      account.lastError = undefined;
      this.saveAccounts(accounts);
      this.saveEmails(localEmails);
      console.log(`[Email Service] IMAP 同步完毕，成功解析入库 ${fetchedCount} 封真实邮件`);
    } catch (err: any) {
      account.authStatus = 'auth_failed';
      account.lastError = err.message;
      this.saveAccounts(accounts);
      throw err;
    }

    return { newCount: fetchedCount, emails: localEmails };
  }

  public async syncEmails(): Promise<{ newCount: number; emails: EmailItem[] }> {
    const accounts = this.getAccounts();
    const active = accounts.find((a) => a.isDefault) || accounts[0];
    if (active && active.authPassword) {
      return await this.syncEmailsForAccount(active.id);
    }
    return { newCount: 0, emails: this.getEmails() };
  }

  // ================= 真实邮件发送 (Real SMTP Send) =================

  public async sendEmail(payload: {
    accountId?: string;
    to: string;
    subject: string;
    content: string;
    cc?: string;
    attachments?: Array<{ name: string; size: number; ext: string }>;
  }): Promise<EmailItem> {
    const accounts = this.getAccounts();
    const account = (payload.accountId ? accounts.find((a) => a.id === payload.accountId) : null)
      || accounts.find((a) => a.isDefault)
      || accounts[0];

    const toAddresses = payload.to
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((em) => ({
        name: em.split('@')[0],
        email: em,
      }));

    const ccAddresses = (payload.cc || '')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((em) => ({
        name: em.split('@')[0],
        email: em,
      }));

    // 若配置了真实 SMTP 凭据，通过 nodemailer 真实将信件推送到外网收件人！
    if (account?.authPassword && account?.smtpHost) {
      try {
        console.log(`[Email Service] 正在通过真实 SMTP (${account.smtpHost}:${account.smtpPort}) 发送邮件到 ${payload.to}...`);
        const transporter = nodemailer.createTransport({
          host: account.smtpHost,
          port: account.smtpPort,
          secure: account.smtpSsl,
          auth: {
            user: account.authUsername || account.email,
            pass: account.authPassword,
          },
        });

        await transporter.sendMail({
          from: `"${account.name}" <${account.email}>`,
          to: payload.to,
          cc: payload.cc || undefined,
          subject: payload.subject || '（无主题）',
          text: payload.content,
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">${payload.content.replace(/\n/g, '<br/>')}</div>`,
        });
        console.log(`[Email Service] SMTP 发信成功！收件人: ${payload.to}`);
      } catch (smtpErr: any) {
        console.error('[Email Service] SMTP 发送失败:', smtpErr.message);
        throw new Error(`SMTP 发信异常: ${smtpErr.message}`);
      }
    }

    // 本地发件箱留痕保存
    const emails = this.getEmails();
    const newEmail: EmailItem = {
      id: `mail_sent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      accountId: account.id,
      folder: 'sent',
      from: {
        name: account.name,
        email: account.email,
        avatar: account.avatar,
      },
      to: toAddresses,
      cc: ccAddresses.length > 0 ? ccAddresses : undefined,
      subject: payload.subject || '（无主题）',
      date: Date.now(),
      snippet: payload.content.slice(0, 120),
      bodyText: payload.content,
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">${payload.content.replace(/\n/g, '<br/>')}</div>`,
      isRead: true,
      isStarred: false,
      attachments: payload.attachments?.map((a, i) => ({
        id: `att_s_${Date.now()}_${i}`,
        name: a.name,
        size: a.size || 1024,
        ext: a.ext || 'bin',
      })),
      tags: ['已发送'],
    };

    emails.unshift(newEmail);
    this.saveEmails(emails);
    return newEmail;
  }

  // ================= 邮件 CRUD 操作 =================

  public markAsRead(emailId: string, isRead = true): EmailItem | null {
    const emails = this.getEmails();
    const target = emails.find((e) => e.id === emailId);
    if (!target) return null;
    target.isRead = isRead;
    this.saveEmails(emails);
    return target;
  }

  public toggleStar(emailId: string): EmailItem | null {
    const emails = this.getEmails();
    const target = emails.find((e) => e.id === emailId);
    if (!target) return null;
    target.isStarred = !target.isStarred;
    this.saveEmails(emails);
    return target;
  }

  public deleteEmail(emailId: string): boolean {
    const emails = this.getEmails();
    const target = emails.find((e) => e.id === emailId);
    if (!target) return false;

    if (target.folder !== 'trash') {
      target.folder = 'trash';
    } else {
      const idx = emails.findIndex((e) => e.id === emailId);
      if (idx >= 0) emails.splice(idx, 1);
    }
    this.saveEmails(emails);
    return true;
  }

  public saveDraft(payload: {
    id?: string;
    accountId?: string;
    to: string;
    subject: string;
    content: string;
    cc?: string;
  }): EmailItem {
    const emails = this.getEmails();
    const defaultAcc = this.getAccounts().find((a) => a.isDefault) || this.getAccounts()[0];

    let draft = payload.id ? emails.find((e) => e.id === payload.id) : null;
    if (draft) {
      draft.subject = payload.subject || '（未命名草稿）';
      draft.bodyText = payload.content;
      draft.snippet = payload.content.slice(0, 100);
      draft.date = Date.now();
      draft.to = [{ name: payload.to.split('@')[0] || '收件人', email: payload.to }];
    } else {
      draft = {
        id: `mail_draft_${Date.now()}`,
        accountId: payload.accountId || defaultAcc.id,
        folder: 'drafts',
        from: { name: defaultAcc.name, email: defaultAcc.email },
        to: [{ name: payload.to.split('@')[0] || '收件人', email: payload.to }],
        subject: payload.subject || '（草稿）',
        date: Date.now(),
        snippet: payload.content.slice(0, 100),
        bodyText: payload.content,
        isRead: true,
        isStarred: false,
        tags: ['草稿'],
      };
      emails.unshift(draft);
    }

    this.saveEmails(emails);
    return draft;
  }

  // ================= AI 邮件核心分析功能 =================

  /**
   * 1. 深度分析邮件内容：提取需求清单、情绪紧迫度、待办行动项及商机线索
   */
  public async analyzeEmail(emailId: string): Promise<EmailAnalysisResult> {
    const emails = this.getEmails();
    const email = emails.find((e) => e.id === emailId);
    if (!email) {
      throw new Error(`未找到指定邮件 [${emailId}]`);
    }

    const aiConfig = this.aiService.getAiConfig();
    const providerId = aiConfig.settings.defaultProviderId;
    let provider = aiConfig.providers.find((p) => p.id === providerId && p.enabled && p.apiKey?.trim())
      || aiConfig.providers.find((p) => p.enabled && p.apiKey?.trim());

    if (!provider?.apiKey?.trim() && BUILTIN_SILICONFLOW_KEY) {
      provider = {
        id: 'siliconflow_builtin',
        name: '硅基流动 (内置)',
        type: 'siliconflow' as any,
        protocol: 'openai-completions',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: BUILTIN_SILICONFLOW_KEY,
        enabled: true,
        models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3' }],
      };
    }

    const modelId = aiConfig.settings.defaultModelId || provider?.models?.[0]?.id || 'deepseek-ai/DeepSeek-V3';

    const systemPrompt = `你是一名世界顶尖的企业级 B2B 商务沟通专家与 CRM 售前架构师。
你的职责是精准深度剖析业务往来邮件，剥离客套言辞，透视客户真实心理、业务痛点、迫切需求与跟进行动项。
请严格输出标准合法的 JSON 格式，严禁包含任何前缀解释、markdown 代码块标记或无关闲聊：

JSON Schema 约束如下：
{
  "summary": "1-2句话高度浓缩的核心业务要旨概括",
  "intent": "发件人主导意图（如：商务还价谈判、技术报障紧急求助、新系统选型咨询、合同条款博弈等）",
  "urgencyLevel": "high" | "medium" | "low",
  "urgencyReason": "判定该紧迫度等级的事实证据与时效线索",
  "sentiment": "positive" | "neutral" | "anxious" | "critical",
  "sentimentLabel": "发件人当前情绪与态度特征（例如：积极热切、焦虑催促、防备谨慎、严厉施压）",
  "needs": [
    {
      "id": "need_1",
      "category": "feature" | "business" | "contract" | "support" | "customization" | "other",
      "title": "需求简短标题",
      "description": "需求深层详细拆解说明",
      "urgency": "high" | "medium" | "low"
    }
  ],
  "actionItems": [
    {
      "id": "act_1",
      "task": "需落实执行的具体工作任务",
      "deadline": "建议截止时间或明确时间节点",
      "assignee": "负责角色建议（如：售前顾问/项目经理/销售总监）"
    }
  ],
  "keyInsights": [
    "商业决策潜台词或技术博弈洞察 1",
    "商业决策潜台词或技术博弈洞察 2"
  ],
  "relatedCrmEntity": {
    "type": "Opportunity" | "Contract" | "Account" | "Case",
    "name": "推断匹配或关联的CRM对象名称",
    "details": "关联的背景线索"
  }
}`;

    const userPrompt = `待剖析邮件详情：
【发件人】: ${email.from.name} <${email.from.email}> (${email.from.company || '未知企业'} · ${email.from.title || '职务未知'})
【收件人】: ${email.to.map((t) => `${t.name} <${t.email}>`).join(', ')}
【主　题】: ${email.subject}
【时　间】: ${new Date(email.date).toLocaleString()}
【正　文】:
${email.bodyText || email.snippet}

请立即按照 JSON 规范输出深度分析结果：`;

    let result: EmailAnalysisResult | null = null;

    if (provider?.apiKey?.trim()) {
      try {
        const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
        const endpoint = cleanBaseUrl.endsWith('/v1') || cleanBaseUrl.includes('/v1/')
          ? `${cleanBaseUrl}/chat/completions`
          : `${cleanBaseUrl}/v1/chat/completions`;

        const res = await axios.post(
          endpoint,
          {
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 2500,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${provider.apiKey.trim()}`,
            },
            timeout: 30000,
          }
        );

        let content = res.data?.choices?.[0]?.message?.content || '';
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(content);
        if (parsed && parsed.summary) {
          result = {
            ...parsed,
            analyzedAt: Date.now(),
            modelUsed: modelId,
          };
        }
      } catch (err: any) {
        console.warn('[Email AI Analysis] 大模型接口响应异常，转入本地智能引擎:', err.message);
      }
    }

    if (!result) {
      result = this.generateFallbackAnalysis(email);
    }

    email.analysis = result;
    this.saveEmails(emails);
    this.updatePersonaInteractions(email.from.email, email.from.name, email.date);

    return result;
  }

  /**
   * 2. 根据邮件内容自适应生成智能回复 (支持多风格与用户重点要求)
   */
  public async generateEmailReply(options: GenerateReplyOptions): Promise<GeneratedReplyResult> {
    const emails = this.getEmails();
    const email = emails.find((e) => e.id === options.emailId);
    if (!email) {
      throw new Error(`未找到指定邮件 [${options.emailId}]`);
    }

    const personas = this.getPersonas();
    const persona = personas.find((p) => p.email.toLowerCase() === email.from.email.toLowerCase());

    const toneDescriptions: Record<string, string> = {
      formal: '商务严谨正式、措辞庄重考究、条理分明、体现企业级大厂规范',
      friendly: '温和热忱、拉近客情关系、富有同理心与服务温度',
      efficient: '简洁高效干练、开门见山直奔核心结论、清单化列出要点、无冗余套话',
      negotiation: '具备高超商务谈判博弈艺术、有理有据有节、守住核心底线同时释放合作诚意、善用条件交换',
      technical: '技术专家口吻、严谨专业、条分缕析、注重架构可行性、数据安全性与实施落地规范',
      decline: '礼貌婉拒、有理有据地陈述客观困难、提出替代性妥协方案以维护长期合作可能',
    };

    const targetToneDesc = toneDescriptions[options.tone] || toneDescriptions.formal;

    const systemPrompt = `你是一名精通企业级公关、商务拓展与技术咨询的资深专家顾问。
请为用户撰写一封高水准的回复邮件。
要求：
1. 语气风格：${targetToneDesc}。
2. 严密契合发件人的核心诉求，直接回应来信中提及的技术/商务痛点；
${persona ? `3. 【发件人画像自适应】：收信人偏好【${persona.communicationStyle}】，性格特征【${persona.personalityTraits.join('、')}】，关切痛点【${persona.coreConcerns.join('、')}】。请在行文与论述中巧妙适配其沟通风格！` : ''}
${options.focusPoints ? `4. 【用户补充指示】：务必在邮件正文中切实体现以下要点：\n"${options.focusPoints}"` : ''}
5. 邮件结构包含：得体称呼、正文（合理分段、重点加粗或项目符号）、具体下一步行动提议、礼貌落款。

请直接输出标准 JSON 格式：
{
  "subject": "生成的回复邮件主题 (通常以 Re: 开头)",
  "body": "完整的回复邮件正文纯文本",
  "rationale": "简短阐述本封邮件的策略构思 (1-2句话，向用户解释为什么选用这种措辞)"
}`;

    const userPrompt = `【原邮件背景】
发件人：${email.from.name} <${email.from.email}>
原邮件主题：${email.subject}
原邮件正文：
${email.bodyText || email.snippet}

【原邮件已分析出的核心需求】:
${email.analysis ? email.analysis.needs.map((n, i) => `${i + 1}. [${n.title}] ${n.description}`).join('\n') : '暂未显式提取'}

请立即构思并生成最符合业务期望的专业回信：`;

    const aiConfig = this.aiService.getAiConfig();
    const providerId = aiConfig.settings.defaultProviderId;
    let provider = aiConfig.providers.find((p) => p.id === providerId && p.enabled && p.apiKey?.trim())
      || aiConfig.providers.find((p) => p.enabled && p.apiKey?.trim());

    if (!provider?.apiKey?.trim() && BUILTIN_SILICONFLOW_KEY) {
      provider = {
        id: 'siliconflow_builtin',
        name: '硅基流动 (内置)',
        type: 'siliconflow' as any,
        protocol: 'openai-completions',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: BUILTIN_SILICONFLOW_KEY,
        enabled: true,
        models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3' }],
      };
    }

    const modelId = aiConfig.settings.defaultModelId || provider?.models?.[0]?.id || 'deepseek-ai/DeepSeek-V3';

    if (provider?.apiKey?.trim()) {
      try {
        const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
        const endpoint = cleanBaseUrl.endsWith('/v1') || cleanBaseUrl.includes('/v1/')
          ? `${cleanBaseUrl}/chat/completions`
          : `${cleanBaseUrl}/v1/chat/completions`;

        const res = await axios.post(
          endpoint,
          {
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${provider.apiKey.trim()}`,
            },
            timeout: 30000,
          }
        );

        let content = res.data?.choices?.[0]?.message?.content || '';
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(content);
        if (parsed && parsed.body) {
          return {
            subject: parsed.subject || `Re: ${email.subject}`,
            body: parsed.body,
            tone: options.tone,
            rationale: parsed.rationale || '结合发件人诉求与指定语气智能起草',
          };
        }
      } catch (err: any) {
        console.warn('[Email AI Reply] 大模型回复生成异常，转入本地专业模板引擎:', err.message);
      }
    }

    return this.generateFallbackReply(email, options, persona);
  }

  /**
   * 3. 根据【指定邮箱地址】进行全景人物画像构建与行为性格分析
   */
  public async analyzePersonaByEmail(targetEmail: string, manualHints?: string): Promise<ContactPersona> {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('请输入有效的邮箱地址（如 zhangsan@example.com）');
    }

    const emails = this.getEmails();
    const relatedEmails = emails.filter(
      (e) =>
        e.from.email.toLowerCase() === cleanEmail ||
        e.to.some((t) => t.email.toLowerCase() === cleanEmail) ||
        e.cc?.some((c) => c.email.toLowerCase() === cleanEmail)
    );

    const contactName = relatedEmails.find((e) => e.from.email.toLowerCase() === cleanEmail)?.from.name
      || cleanEmail.split('@')[0];

    const emailBodies = relatedEmails
      .slice(0, 8)
      .map((e, idx) => `[邮件 #${idx + 1}] 主题: ${e.subject}\n时间: ${new Date(e.date).toLocaleDateString()}\n正文节选:\n${(e.bodyText || e.snippet).slice(0, 500)}`)
      .join('\n\n---\n\n');

    const aiConfig = this.aiService.getAiConfig();
    const providerId = aiConfig.settings.defaultProviderId;
    let provider = aiConfig.providers.find((p) => p.id === providerId && p.enabled && p.apiKey?.trim())
      || aiConfig.providers.find((p) => p.enabled && p.apiKey?.trim());

    if (!provider?.apiKey?.trim() && BUILTIN_SILICONFLOW_KEY) {
      provider = {
        id: 'siliconflow_builtin',
        name: '硅基流动 (内置)',
        type: 'siliconflow' as any,
        protocol: 'openai-completions',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: BUILTIN_SILICONFLOW_KEY,
        enabled: true,
        models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3' }],
      };
    }

    const modelId = aiConfig.settings.defaultModelId || provider?.models?.[0]?.id || 'deepseek-ai/DeepSeek-V3';

    const systemPrompt = `你是一名资深商务情报官、政企公关专家与高层心理行为分析师。
你的任务是根据给定的联系人邮箱及其历史往来邮件记录，抽丝剥茧，构建一份全景式的【联系人人物性格与决策者画像 (Persona & Behavioral Profile)】。
这有助于前线销售总监和项目架构师在后续沟通中知己知彼、精准突破、规避雷区。

请严格输出合法的 JSON 格式，严禁带有 markdown 标记或无关文字：
{
  "name": "推测的姓名或称谓",
  "company": "所在单位/企业（从邮箱域名、签名档或邮件正文推导）",
  "title": "预估职位头衔或角色",
  "department": "所属部门",
  "roleType": "decision_maker" | "technical_lead" | "procurement" | "business_manager" | "end_user" | "unknown",
  "roleTypeLabel": "角色中文标签 (如: 核心决策者/技术把关人/采购商务/业务运营总监/一线执行人)",
  "personalityTraits": ["数据驱动", "严谨求实", "讲求时效", "谨慎防备", "强掌控欲"],
  "communicationStyle": "对该联系人沟通偏好、语言习惯与思维模式的深度文字剖析 (80-150字，例如该人是否喜欢开门见山、对方案格式有何癖好、喜欢哪类证明材料)",
  "coreConcerns": [
    "核心利益关切与历史痛点 1",
    "核心利益关切与历史痛点 2",
    "核心利益关切与历史痛点 3"
  ],
  "trustLevel": 1 到 5 的数字 (5为高度信任，1为防备甚至存在敌意),
  "riskSignals": [
    "潜在合作风险或谈判阻力点 1",
    "潜在合作风险或谈判阻力点 2"
  ],
  "negotiationStrategy": "【高价值公关/跟进与谈判破局策略建议】（100-200字：具体指导业务员下次联系该人时，该如何开场、先抛出什么证据、避开哪些禁忌话术、如何顺应其诉求推进成交）"
}`;

    const userPrompt = `待剖析目标联系人邮箱：${cleanEmail} (姓名猜测: ${contactName})
${manualHints ? `【业务员提供的补充线索与背景说明】:\n${manualHints}\n` : ''}
【历史往来邮件样本（共检索到 ${relatedEmails.length} 封往来记录）】:
${emailBodies || '（该邮箱暂无历史往来邮件，请基于邮箱域名、企业后缀及业务员补充线索进行深度职业与行为画像推演）'}

请立即生成该联系人的全景人物画像 JSON：`;

    let personaData: Partial<ContactPersona> | null = null;

    if (provider?.apiKey?.trim()) {
      try {
        const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
        const endpoint = cleanBaseUrl.endsWith('/v1') || cleanBaseUrl.includes('/v1/')
          ? `${cleanBaseUrl}/chat/completions`
          : `${cleanBaseUrl}/v1/chat/completions`;

        const res = await axios.post(
          endpoint,
          {
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 2500,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${provider.apiKey.trim()}`,
            },
            timeout: 30000,
          }
        );

        let content = res.data?.choices?.[0]?.message?.content || '';
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        personaData = JSON.parse(content);
      } catch (err: any) {
        console.warn('[Persona Profiling] 大模型生成画像异常，启用本地启发式画像推断引擎:', err.message);
      }
    }

    if (!personaData || !personaData.personalityTraits) {
      personaData = this.generateFallbackPersona(cleanEmail, contactName, relatedEmails, manualHints);
    }

    const personas = this.getPersonas();
    const existingIndex = personas.findIndex((p) => p.email.toLowerCase() === cleanEmail);

    const fullPersona: ContactPersona = {
      email: cleanEmail,
      name: personaData.name || contactName,
      company: personaData.company || cleanEmail.split('@')[1] || '待完善单位',
      title: personaData.title || '企业业务对接人',
      department: personaData.department || '业务管理部',
      roleType: personaData.roleType || 'business_manager',
      roleTypeLabel: personaData.roleTypeLabel || '业务关键人',
      personalityTraits: personaData.personalityTraits || ['务实求效', '重视结果', '关注推进'],
      communicationStyle: personaData.communicationStyle || '注重沟通效率，偏好清晰明确的行动指引与结构化材料。',
      coreConcerns: personaData.coreConcerns || ['产品功能稳定性', '项目交付周期', '服务响应时效'],
      trustLevel: personaData.trustLevel || 3,
      riskSignals: personaData.riskSignals || ['信息获取较为谨慎，需提供更多真实标杆案例'],
      negotiationStrategy: personaData.negotiationStrategy || '建议在沟通中保持数据详实，突出同行业落地案例与投资回报率 (ROI)，及时跟进关键节点。',
      emailCount: relatedEmails.length,
      lastInteractedAt: relatedEmails[0]?.date || Date.now(),
      manualNotes: manualHints || '',
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      personas[existingIndex] = { ...personas[existingIndex], ...fullPersona };
    } else {
      personas.unshift(fullPersona);
    }

    this.savePersonas(personas);
    return fullPersona;
  }

  public savePersonaNotes(email: string, notes: string): ContactPersona | null {
    const personas = this.getPersonas();
    const target = personas.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (!target) return null;
    target.manualNotes = notes;
    target.updatedAt = Date.now();
    this.savePersonas(personas);
    return target;
  }

  // ================= 辅助兜底算法与演示数据 =================

  private updatePersonaInteractions(email: string, name: string, date: number): void {
    const personas = this.getPersonas();
    const target = personas.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (target) {
      target.emailCount = (target.emailCount || 0) + 1;
      target.lastInteractedAt = Math.max(target.lastInteractedAt || 0, date);
      target.updatedAt = Date.now();
      this.savePersonas(personas);
    }
  }

  private generateFallbackAnalysis(email: EmailItem): EmailAnalysisResult {
    const text = (email.subject + ' ' + email.bodyText).toLowerCase();

    const isUrgent = text.includes('紧急') || text.includes('401') || text.includes('尽快') || text.includes('立刻') || text.includes('截止') || text.includes('asap');
    const isCost = text.includes('折扣') || text.includes('价格') || text.includes('报价') || text.includes('预算') || text.includes('还价') || text.includes('合同');
    const isTech = text.includes('接口') || text.includes('报错') || text.includes('代码') || text.includes('二次开发') || text.includes('数据库') || text.includes('api');

    return {
      analyzedAt: Date.now(),
      modelUsed: 'NeoCRM-Local-Semantic-Engine (离线智能引擎)',
      summary: `发件人围绕【${email.subject}】提出沟通要求，关注核心交付细节与时间安排。`,
      intent: isCost ? '商务价格与合同条款协商' : isTech ? '技术架构与系统对接确认' : isUrgent ? '业务突发状况紧急求助' : '常规业务选型与需求咨询',
      urgencyLevel: isUrgent ? 'high' : 'medium',
      urgencyReason: isUrgent ? '邮件包含明确的时效期限或线上运行阻断词汇' : '属于常规商务推进与方案确认周期',
      sentiment: isUrgent ? 'anxious' : 'neutral',
      sentimentLabel: isUrgent ? '焦虑催促 · 期望获得实质性解决承诺' : '理性客观 · 聚焦方案合理性',
      needs: [
        {
          id: 'need_fb_1',
          category: isCost ? 'contract' : isTech ? 'customization' : 'business',
          title: isCost ? '明确价格折让与付款账期' : isTech ? '获得系统集成接口规范' : '获得详细产品实施方案',
          description: '需结合当前租户业务场景，给出条理清晰、具备说服力的正式答复文件。',
          urgency: isUrgent ? 'high' : 'medium',
        },
        {
          id: 'need_fb_2',
          category: 'support',
          title: '组织专人线上会议或现场技术答疑',
          description: '安排资深技术顾问对接，彻底消除决策层的顾虑。',
          urgency: 'medium',
        },
      ],
      actionItems: [
        {
          id: 'act_fb_1',
          task: '核算商务报价模型与实施排期甘特图',
          deadline: '24小时内',
          assignee: '售前架构师 / 商务负责人',
        },
        {
          id: 'act_fb_2',
          task: '以标准邮件模板起草正式回复',
          deadline: '今日下班前',
          assignee: '对接业务员',
        },
      ],
      keyInsights: [
        '客户处于关键决策窗口期，竞争对手可能同步在跟进',
        '对实施周期与系统稳定性高度敏感，需用实际案例打消顾虑',
      ],
      relatedCrmEntity: {
        type: isCost ? 'Contract' : 'Opportunity',
        name: email.subject.slice(0, 20),
        details: '已与该发件人企业建立初始线索关联',
      },
    };
  }

  private generateFallbackReply(
    email: EmailItem,
    options: GenerateReplyOptions,
    persona?: ContactPersona
  ): GeneratedReplyResult {
    const sender = email.from.name || '尊敬的客户';
    const focus = options.focusPoints ? `针对您特别关注的要点，我们已组织技术与商务团队进行了专项评估：\n${options.focusPoints}\n\n` : '';

    const body = `${sender}，您好！

感谢您的来信与对我们平台技术能力的关注。关于您在来信中探讨的【${email.subject}】，我们已组织售前架构与交付团队进行了认真审阅。

${focus}为确保项目平稳推进与双方高效协同，我们建议后续分两步落实：
1. 我们将指派专职技术顾问为您梳理定制化方案说明书及关键时间排期表；
2. 本周内可为您开通沙盒演示环境，供贵司团队直观评估审批流与数据架构的无缝体验。

若您时间方便，我们可在近期安排一次半小时的线上沟通深入探讨细节。随时听候您的指示！

顺祝商祺，
NeoCRM 商务与技术顾问团队`;

    return {
      subject: `Re: ${email.subject}`,
      body,
      tone: options.tone,
      rationale: '基于商务礼仪与推进成交逻辑生成的标准回复模板',
    };
  }

  private generateFallbackPersona(
    email: string,
    name: string,
    history: EmailItem[],
    hints?: string
  ): Partial<ContactPersona> {
    const domain = email.split('@')[1] || '';
    const isEnterprise = domain.includes('corp') || domain.includes('.cn') || domain.includes('.com');

    return {
      name,
      company: isEnterprise ? `${domain.split('.')[0].toUpperCase()} 集团` : '重点跟进客户',
      title: '业务负责人 / 关键决策者',
      department: '数字化战略推进部',
      roleType: 'decision_maker',
      roleTypeLabel: '核心决策者',
      personalityTraits: ['注重实效', '严谨稳健', '关注投入产出比 (ROI)', '讲求信誉保障'],
      communicationStyle: '语言风格干练清晰，决策过程注重客观数据与第三方背书，更倾向于阅读结构化文档而非泛泛而谈。',
      coreConcerns: [
        '系统的平稳过渡与国产化信创合规',
        '二次开发成本与实施交付周期可控性',
        '长期售后维保响应时效 (SLA)',
      ],
      trustLevel: 4,
      riskSignals: [
        '可能同时在对比多套主流 CRM 方案',
        '对技术细节和权限体系要求严苛',
      ],
      negotiationStrategy: '建议后续沟通严格采用“结论先行”的汇报法则，多引用同行业头部客群的成熟迁移案例，用翔实指标增强其安全感。',
    };
  }

    private getDefaultAccounts(): EmailAccount[] {
    return [];
  }

  private getDefaultPersonas(): ContactPersona[] {
    return [];
  }

  private getDefaultEmails(): EmailItem[] {
    return [];
  }
}

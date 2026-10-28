import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Download,
  ExternalLink,
  Filter,
  Layers,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  XCircle,
  FileText,
  Calendar,
  ChevronDown,
  ChevronRight,
  Zap,
  Info
} from 'lucide-react';

// CHIP 上线基准时间：2024-11-16 00:00:00
const CHIP_LAUNCH_TIMESTAMP = new Date('2024-11-16T00:00:00+08:00').getTime();

export interface RepairRecord {
  Id: string;
  Name: string;
  Complaint_Number__c?: string | null;
  DOJ_Status__c?: string | null;
  FSE_ApplyForRepair_time__c?: string | null;
  Field_Update_Flag_Date__c?: string | null;
  CreatedDate: string;
}

export interface QisRecord {
  Id: string;
  Name: string;
  Complaint_Number__c?: string | null;
  ComplaintStatus__c?: string | null;
  QIS_Submit_day__c?: string | null;
  Field_Update_Flag_Date__c?: string | null;
  CreatedDate: string;
}

export interface BatchIfLogRecord {
  Id: string;
  Name?: string;
  MessageGroupNumber__c?: string | null;
  Type__c?: string | null;
  RowDataFlg__c?: boolean | null;
  Log__c?: string | null;
  CreatedDate: string;
}

export interface ParsedLogItem {
  id: string;
  logId: string;
  groupNumber: string;
  name: string; // 单号 systemReferenceNumber
  inquiryNumber?: string;
  isSuccess: boolean;
  rawFlg: boolean;
  type: string;
  createdDate: string;
}

export default function ChipTrackingDashboard() {
  // 监控基准日期，默认为当前日期（或测试用 2026-10-25）
  const [monitorDate, setMonitorDate] = useState<string>(() => {
    const now = new Date();
    // 默认展示今天，格式 YYYY-MM-DD
    return now.toISOString().slice(0, 10);
  });

  const [activeTab, setActiveTab] = useState<'overview' | '411repair' | '411qis' | '411log' | '413repair' | '413qis' | '413log'>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('');
  const loadInProgress = useRef(false);

  // 原始数据
  const [repair411List, setRepair411List] = useState<RepairRecord[]>([]);
  const [qis411List, setQis411List] = useState<QisRecord[]>([]);
  const [log411List, setLog411List] = useState<BatchIfLogRecord[]>([]);

  const [repair413List, setRepair413List] = useState<RepairRecord[]>([]);
  const [qis413List, setQis413List] = useState<QisRecord[]>([]);
  const [log413List, setLog413List] = useState<BatchIfLogRecord[]>([]);

  // 搜索关键字
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 日期计算辅助
  const { dateTarget, datePlus1, datePlus2 } = useMemo(() => {
    try {
      const base = new Date(monitorDate + 'T00:00:00+08:00');
      const p1 = new Date(base.getTime() + 24 * 60 * 60 * 1000);
      const p2 = new Date(base.getTime() + 48 * 60 * 60 * 1000);
      return {
        dateTarget: monitorDate,
        datePlus1: p1.toISOString().slice(0, 10),
        datePlus2: p2.toISOString().slice(0, 10)
      };
    } catch {
      return { dateTarget: monitorDate, datePlus1: monitorDate, datePlus2: monitorDate };
    }
  }, [monitorDate]);

  // 从 411 日志 Log__c 解析单号和 INQ 号
  // 规则: "systemReferenceNumber":"xxx" 和 "inquiryNumber":"xxx"
  const parsed411Logs = useMemo<ParsedLogItem[]>(() => {
    const list: ParsedLogItem[] = [];
    log411List.forEach((r, idx) => {
      const text = r.Log__c || '';
      let sysRef = '';
      let inq = '';

      // 匹配 systemReferenceNumber
      const refMatch = text.match(/"systemReferenceNumber"\s*:\s*"([^"]+)"/i);
      if (refMatch) {
        sysRef = refMatch[1].trim();
      }

      // 匹配 inquiryNumber
      const inqMatch = text.match(/"inquiryNumber"\s*:\s*"([^"]+)"/i);
      if (inqMatch) {
        inq = inqMatch[1].trim();
      }

      list.push({
        id: r.Id || String(idx),
        logId: r.Id,
        groupNumber: r.MessageGroupNumber__c || '-',
        name: sysRef || r.Name || '-',
        inquiryNumber: inq,
        isSuccess: Boolean(inq || (r.RowDataFlg__c === true)),
        rawFlg: Boolean(r.RowDataFlg__c),
        type: r.Type__c || 'NFM411',
        createdDate: r.CreatedDate
      });
    });
    return list;
  }, [log411List]);

  // 411 日志已发单号集合
  const set411SentNames = useMemo(() => {
    const s = new Set<string>();
    parsed411Logs.forEach(item => {
      if (item.name && item.name !== '-') s.add(item.name.toUpperCase());
    });
    return s;
  }, [parsed411Logs]);

  // 从 413 日志 Log__c 解析拆分多行数据及响应成功
  // 规则: 413 批处理拆分，检查 Response 是否含 Status:202，组号继承
  const parsed413Logs = useMemo<ParsedLogItem[]>(() => {
    const list: ParsedLogItem[] = [];

    // 首先按 MessageGroupNumber 汇总响应状态（若存在一条 Status:202 则整组为 true）
    const groupStatusMap = new Map<string, boolean>();
    log413List.forEach(item => {
      const gNum = item.MessageGroupNumber__c || item.Name || '';
      if (!gNum) return;
      const text = item.Log__c || '';
      const is202 = text.includes('Status:202') || text.includes('202 Accepted') || text.includes('"status":202');
      if (is202) {
        groupStatusMap.set(gNum, true);
      } else if (!groupStatusMap.has(gNum)) {
        groupStatusMap.set(gNum, false);
      }
    });

    log413List.forEach((r, idx) => {
      const text = r.Log__c || '';
      const gNum = r.MessageGroupNumber__c || r.Name || '-';
      const isGroupSuccess = groupStatusMap.get(gNum) ?? false;

      // 提取全部 systemReferenceNumber (支持一个日志里存在多个案件)
      const regex = /"systemReferenceNumber"\s*:\s*"([^"]+)"/g;
      let match: RegExpExecArray | null;
      let matchCount = 0;

      while ((match = regex.exec(text)) !== null) {
        matchCount++;
        const sysRef = match[1].trim();
        list.push({
          id: `${r.Id}_${matchCount}`,
          logId: r.Id,
          groupNumber: gNum,
          name: sysRef,
          isSuccess: isGroupSuccess,
          rawFlg: Boolean(r.RowDataFlg__c),
          type: r.Type__c || 'NFM413',
          createdDate: r.CreatedDate
        });
      }

      // 如果正则未命中但有记录
      if (matchCount === 0) {
        list.push({
          id: r.Id || String(idx),
          logId: r.Id,
          groupNumber: gNum,
          name: r.Name || '-',
          isSuccess: isGroupSuccess,
          rawFlg: Boolean(r.RowDataFlg__c),
          type: r.Type__c || 'NFM413',
          createdDate: r.CreatedDate
        });
      }
    });

    return list;
  }, [log413List]);

  // 413 日志已发单号集合和成功集合
  const { set413SentNames, map413SuccessByName } = useMemo(() => {
    const sent = new Set<string>();
    const successMap = new Map<string, boolean>();
    parsed413Logs.forEach(item => {
      if (item.name && item.name !== '-') {
        const up = item.name.toUpperCase();
        sent.add(up);
        if (item.isSuccess) {
          successMap.set(up, true);
        } else if (!successMap.has(up)) {
          successMap.set(up, false);
        }
      }
    });
    return { set413SentNames: sent, map413SuccessByName: successMap };
  }, [parsed413Logs]);

  // ================= 411 修理判定明细 =================
  const computed411Repair = useMemo(() => {
    return repair411List.map(r => {
      const isShouldSend = Boolean(r.Id);
      const isSent = r.Name ? set411SentNames.has(r.Name.toUpperCase()) : false;
      const isGotInq = Boolean(r.Complaint_Number__c && r.Complaint_Number__c.trim().length > 0);
      return {
        ...r,
        isShouldSend,
        isSent,
        isGotInq,
        statusText: isGotInq ? '成功回写INQ' : isSent ? '已发送待回写' : '应发未发'
      };
    });
  }, [repair411List, set411SentNames]);

  // ================= 411 QIS 判定明细 =================
  const computed411Qis = useMemo(() => {
    return qis411List.map(q => {
      const isShouldSend = Boolean(q.Id);
      const isSent = q.Name ? set411SentNames.has(q.Name.toUpperCase()) : false;
      const isGotInq = Boolean(q.Complaint_Number__c && q.Complaint_Number__c.trim().length > 0);
      return {
        ...q,
        isShouldSend,
        isSent,
        isGotInq,
        statusText: isGotInq ? '成功回写INQ' : isSent ? '已发送待回写' : '应发未发'
      };
    });
  }, [qis411List, set411SentNames]);

  // ================= 413 修理判定明细 =================
  // 业务逻辑规则：
  // 1. isChip: CreatedDate(UTC+8) > 2024-11-16
  // 2. 应发送413判定:
  //    - updateDate 为空 => false
  //    - updateDate < 监控日 => false
  //    - updateDate = 监控日:
  //        * Complaint_Number__c 不是以 "INQ" 开头 => '旧INQ号' (false)
  //        * 不是 chip 案件 => '不是chip的案件' (false)
  //        * 是 chip 案件 => true
  //    - updateDate > 监控日: 若已发过(K列) => true, 否则 => false
  const computed413Repair = useMemo(() => {
    return repair413List.map(r => {
      const createdTs = new Date(r.CreatedDate).getTime();
      const isChip = createdTs > CHIP_LAUNCH_TIMESTAMP;
      const isSent = r.Name ? set413SentNames.has(r.Name.toUpperCase()) : false;
      const isSuccess = r.Name ? (map413SuccessByName.get(r.Name.toUpperCase()) ?? false) : false;

      const updateDateStr = r.Field_Update_Flag_Date__c ? r.Field_Update_Flag_Date__c.slice(0, 10) : '';
      const inq = r.Complaint_Number__c || '';
      const isStartWithInq = inq.toUpperCase().startsWith('INQ');

      let shouldSendResult = false;
      let shouldSendReason = '';

      if (!updateDateStr) {
        shouldSendResult = false;
        shouldSendReason = '无更新日期';
      } else if (updateDateStr < dateTarget) {
        shouldSendResult = false;
        shouldSendReason = '早于监控日';
      } else if (updateDateStr === dateTarget) {
        if (!isStartWithInq) {
          shouldSendResult = false;
          shouldSendReason = '旧INQ号(非INQ开头)';
        } else if (!isChip) {
          shouldSendResult = false;
          shouldSendReason = '非CHIP纳管案件';
        } else {
          shouldSendResult = true;
          shouldSendReason = '符合应发条件';
        }
      } else {
        // updateDateStr > dateTarget (回溯日志)
        if (isSent) {
          shouldSendResult = true;
          shouldSendReason = '回溯日志已发送认定';
        } else {
          shouldSendResult = false;
          shouldSendReason = '新日期未发';
        }
      }

      return {
        ...r,
        isChip,
        shouldSendResult,
        shouldSendReason,
        isSent,
        isSuccess
      };
    });
  }, [repair413List, dateTarget, set413SentNames, map413SuccessByName]);

  // ================= 413 QIS 判定明细 =================
  const computed413Qis = useMemo(() => {
    return qis413List.map(q => {
      const createdTs = new Date(q.CreatedDate).getTime();
      const isChip = createdTs > CHIP_LAUNCH_TIMESTAMP;
      const isSent = q.Name ? set413SentNames.has(q.Name.toUpperCase()) : false;
      const isSuccess = q.Name ? (map413SuccessByName.get(q.Name.toUpperCase()) ?? false) : false;

      const updateDateStr = q.Field_Update_Flag_Date__c ? q.Field_Update_Flag_Date__c.slice(0, 10) : '';
      const inq = q.Complaint_Number__c || '';
      const isStartWithInq = inq.toUpperCase().startsWith('INQ');

      let shouldSendResult = false;
      let shouldSendReason = '';

      if (!updateDateStr) {
        shouldSendResult = false;
        shouldSendReason = '无更新日期';
      } else if (updateDateStr < dateTarget) {
        shouldSendResult = false;
        shouldSendReason = '早于监控日';
      } else if (updateDateStr === dateTarget) {
        if (!isStartWithInq) {
          shouldSendResult = false;
          shouldSendReason = '旧INQ号(非INQ开头)';
        } else if (!isChip) {
          shouldSendResult = false;
          shouldSendReason = '非CHIP纳管案件';
        } else {
          shouldSendResult = true;
          shouldSendReason = '符合应发条件';
        }
      } else {
        if (isSent) {
          shouldSendResult = true;
          shouldSendReason = '回溯日志已发送认定';
        } else {
          shouldSendResult = false;
          shouldSendReason = '新日期未发';
        }
      }

      return {
        ...q,
        isChip,
        shouldSendResult,
        shouldSendReason,
        isSent,
        isSuccess
      };
    });
  }, [qis413List, dateTarget, set413SentNames, map413SuccessByName]);

  // ================= 大盘 KPI 统计 =================
  const summaryKpi = useMemo(() => {
    // 411 修理 + QIS
    const count411_Should = computed411Repair.filter(r => r.isShouldSend).length + computed411Qis.filter(q => q.isShouldSend).length;
    // 实际发了: BatchIF_Log__c 中 RowDataFlg__c = true 的记录数
    const count411_Actual = log411List.filter(l => l.RowDataFlg__c === true).length;
    // 发成功了: 回写获得 INQ 号的总记录数
    const count411_Success = computed411Repair.filter(r => r.isGotInq).length + computed411Qis.filter(q => q.isGotInq).length;

    // 413 修理 + QIS
    const count413_Should = computed413Repair.filter(r => r.shouldSendResult).length + computed413Qis.filter(q => q.shouldSendResult).length;
    // 实际发了: 413 日志拆分出的单号数
    const count413_Actual = parsed413Logs.filter(l => l.name && l.name !== '-').length;
    // 发成功了: 413 日志中响应包含 Status:202 的单号数
    const count413_Success = parsed413Logs.filter(l => l.name && l.name !== '-' && l.isSuccess).length;

    return {
      kpi411: {
        should: count411_Should,
        actual: count411_Actual,
        success: count411_Success,
        rate: count411_Should > 0 ? ((count411_Success / count411_Should) * 100).toFixed(1) : '100.0'
      },
      kpi413: {
        should: count413_Should,
        actual: count413_Actual,
        success: count413_Success,
        rate: count413_Should > 0 ? ((count413_Success / count413_Should) * 100).toFixed(1) : '100.0'
      }
    };
  }, [computed411Repair, computed411Qis, log411List, computed413Repair, computed413Qis, parsed413Logs]);

  // 执行真实 SOQL 数据查询
  const loadData = useCallback(async () => {
    const crm = window.neoCRM;
    if (!crm || typeof crm.query !== 'function') {
      setErrorMsg('未检测到工作台 CRM 数据连接上下文 (window.neoCRM.query)');
      return;
    }
    const crmQuery = (query: string) => crm.query(query);
    if (loadInProgress.current) return;

    loadInProgress.current = true;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. 411 修理 SOQL
      const sql411Repair = `SELECT Id, Name, Complaint_Number__c, DOJ_Status__c, FSE_ApplyForRepair_time__c, CreatedDate FROM Repair__c WHERE FSE_ApplyForRepair_time__c >= ${dateTarget}T00:00:00.000+08:00 AND FSE_ApplyForRepair_time__c < ${datePlus1}T00:00:00.000+08:00 AND DOJ_Status__c != '非对象' ORDER BY CreatedDate DESC`;

      // 2. 411 QIS SOQL
      const sql411Qis = `SELECT Id, Name, Complaint_Number__c, ComplaintStatus__c, QIS_Submit_day__c, CreatedDate FROM QIS_Report__c WHERE QIS_Submit_day__c = ${dateTarget} AND ComplaintStatus__c != '非对象' ORDER BY CreatedDate DESC`;

      // 3. 411 日志 SOQL
      const sql411Log = `SELECT Id, Name, RowDataFlg__c, Log__c, CreatedDate, Type__c, MessageGroupNumber__c FROM BatchIF_Log__c WHERE Type__c = 'NFM411' AND CreatedDate >= ${dateTarget}T00:00:00.000+08:00 AND CreatedDate < ${datePlus1}T00:00:00.000+08:00 ORDER BY CreatedDate DESC`;

      // 4. 413 修理 SOQL
      const sql413Repair = `SELECT Id, Name, Complaint_Number__c, Field_Update_Flag_Date__c, CreatedDate FROM Repair__c WHERE Field_Update_Flag_Date__c >= ${dateTarget} AND Complaint_Number__c != null ORDER BY CreatedDate DESC`;

      // 5. 413 QIS SOQL
      const sql413Qis = `SELECT Id, Name, Complaint_Number__c, Field_Update_Flag_Date__c, CreatedDate FROM QIS_Report__c WHERE Field_Update_Flag_Date__c >= ${dateTarget} AND Complaint_Number__c != null ORDER BY CreatedDate DESC`;

      // 6. 413 日志 SOQL (次日凌晨跑批)
      const sql413Log = `SELECT Id, MessageGroupNumber__c, Name, CreatedDate, RowDataFlg__c, Log__c, Type__c FROM BatchIF_Log__c WHERE Type__c = 'NFM413' AND CreatedDate >= ${datePlus1}T00:00:00.000+08:00 AND CreatedDate < ${datePlus2}T00:00:00.000+08:00 ORDER BY CreatedDate DESC`;

      const queries = [sql411Repair, sql411Qis, sql411Log, sql413Repair, sql413Qis, sql413Log];
      const queryResults: Array<{ records?: any[]; error?: string }> = [];
      for (let index = 0; index < queries.length; index += 3) {
        const batch: Array<{ records?: any[]; error?: string }> = await Promise.all(queries.slice(index, index + 3).map((query) =>
          crmQuery(query).catch((err) => ({ records: [], error: err?.message || 'CRM 查询失败' }))
        ));
        queryResults.push(...batch);
        const authFailed = batch.some((result) => /INVALID_AUTH_HEADER|INVALID_SESSION_ID|Salesforce 认证失败|Salesforce 续期后重试失败/i.test(result.error || ''));
        if (authFailed && queryResults.length < queries.length) {
          queryResults.push(...Array.from({ length: queries.length - queryResults.length }, () => ({ records: [], error: '未执行：前序查询认证失败' })));
          break;
        }
      }
      const [res411R, res411Q, res411L, res413R, res413Q, res413L] = queryResults;

      setRepair411List((res411R.records || []) as RepairRecord[]);
      setQis411List((res411Q.records || []) as QisRecord[]);
      setLog411List((res411L.records || []) as BatchIfLogRecord[]);
      setRepair413List((res413R.records || []) as RepairRecord[]);
      setQis413List((res413Q.records || []) as QisRecord[]);
      setLog413List((res413L.records || []) as BatchIfLogRecord[]);

      const queryLabels = ['411 修理', '411 QIS', '411 日志', '413 修理', '413 QIS', '413 日志'];
      const queryErrors = queryResults.flatMap((result, index) => result.error ? [`${queryLabels[index]}：${result.error}`] : []);
      if (queryErrors.length) setErrorMsg(`部分查询失败：${queryErrors.join('；')}`);

      setLastRefreshTime(new Date().toLocaleTimeString('zh-CN'));
    } catch (err: any) {
      setErrorMsg(err?.message || '加载 CHIP 监控数据失败');
    } finally {
      loadInProgress.current = false;
      setIsLoading(false);
    }
  }, [dateTarget, datePlus1, datePlus2]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 font-sans p-6 overflow-y-auto">
      {/* 顶部标题栏与控制台 */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">CHIP 接口预计与实际推送跟踪看板</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                NFM411 & NFM413
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              监控 Salesforce 案件/QIS 报告与下游 CHIP 系统的实时推送、投诉回写及次日增量对账
            </p>
          </div>
        </div>

        {/* 筛选与操作区 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 shadow-inner">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-slate-400">监控日期:</span>
            <input
              type="date"
              value={monitorDate}
              onChange={(e) => setMonitorDate(e.target.value)}
              className="bg-transparent text-sm text-cyan-300 font-medium focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-md shadow-cyan-900/40 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? '核对中...' : '刷新核对'}</span>
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      {errorMsg && (
        <div className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 大盘 KPI 核心指标卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {/* 411 接口总览卡 */}
        <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
              <h2 className="text-sm font-semibold text-slate-200">411 接口 (当日新建推送与INQ获取)</h2>
            </div>
            <span className="text-xs text-slate-400">成功率 {summaryKpi.kpi411.rate}%</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">应发送 411</p>
              <div className="text-xl font-bold text-slate-100 mt-1">{summaryKpi.kpi411.should}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">修理 + QIS 应发总计</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">实际发送 (批次)</p>
              <div className="text-xl font-bold text-cyan-400 mt-1">{summaryKpi.kpi411.actual}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">日志 RowDataFlg 计数</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">回写 INQ 成功</p>
              <div className="text-xl font-bold text-emerald-400 mt-1">{summaryKpi.kpi411.success}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">已获得投诉单号</p>
            </div>
          </div>
        </div>

        {/* 413 接口总览卡 */}
        <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
              <h2 className="text-sm font-semibold text-slate-200">413 接口 (次日变更增量推送)</h2>
            </div>
            <span className="text-xs text-slate-400">成功率 {summaryKpi.kpi413.rate}%</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">应发送 413</p>
              <div className="text-xl font-bold text-slate-100 mt-1">{summaryKpi.kpi413.should}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">CHIP 纳管增量更新</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">实际发送 (单号条数)</p>
              <div className="text-xl font-bold text-blue-400 mt-1">{summaryKpi.kpi413.actual}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">拆解系统参考号</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <p className="text-[11px] text-slate-400">发送成功 (202)</p>
              <div className="text-xl font-bold text-emerald-400 mt-1">{summaryKpi.kpi413.success}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">Status:202 判定通过</p>
            </div>
          </div>
        </div>
      </div>

      {/* 规则说明横幅 */}
      <div className="mt-4 p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            <b>CHIP 基准线:</b> 2024-11-16 之后创建的案件纳入 CHIP 纳管；413 批处理在次日凌晨跑批，对应分析日期次日日志；411 以 INQ 投诉号回写为成功基准。
          </span>
        </div>
        {lastRefreshTime && <span className="text-slate-500 shrink-0">最近核对: {lastRefreshTime}</span>}
      </div>

      {/* 标签栏导航与快速过滤 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 border-b border-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto pb-[-1px]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'overview'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>大盘汇总对比</span>
          </button>

          <button
            onClick={() => setActiveTab('411repair')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === '411repair'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <span>411 修理案件 ({computed411Repair.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('411qis')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === '411qis'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <span>411 QIS 报告 ({computed411Qis.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('411log')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === '411log'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <span>411 批处理日志 ({log411List.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('413repair')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === '413repair'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <span>413 修理变更 ({computed413Repair.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('413qis')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === '413qis'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <span>413 QIS 变更 ({computed413Qis.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('413log')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 border-b-2 ${
              activeTab === '413log'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/80'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <span>413 批处理日志 ({parsed413Logs.length})</span>
          </button>
        </div>

        {/* 关键字搜索框 */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="搜索单号 / INQ / 日志..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48 transition"
          />
        </div>
      </div>

      {/* 视图内容区域 */}
      <div className="mt-4 flex-1">
        {/* 汇总对照大盘 */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">监控指标汇总表 (按原工作表公式对账)</h3>
                <span className="text-xs text-slate-500">对比维度：411当日接口 vs 413次日增量</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">接口类型</th>
                    <th className="py-3 px-4">业务场景</th>
                    <th className="py-3 px-4">昨日应发送</th>
                    <th className="py-3 px-4">昨日实际发送</th>
                    <th className="py-3 px-4">发送成功判定</th>
                    <th className="py-3 px-4">核对状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr className="hover:bg-slate-800/20">
                    <td className="py-3 px-4 font-semibold text-cyan-400">NFM411</td>
                    <td className="py-3 px-4">新建修理 / 提交 QIS 推送生成 INQ</td>
                    <td className="py-3 px-4 font-bold text-slate-100">{summaryKpi.kpi411.should}</td>
                    <td className="py-3 px-4 text-cyan-300 font-medium">{summaryKpi.kpi411.actual} 批次</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">{summaryKpi.kpi411.success} 条获得 INQ</td>
                    <td className="py-3 px-4">
                      {summaryKpi.kpi411.should === summaryKpi.kpi411.success ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">全部回写</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">
                          {summaryKpi.kpi411.should - summaryKpi.kpi411.success} 条待回写
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/20">
                    <td className="py-3 px-4 font-semibold text-blue-400">NFM413</td>
                    <td className="py-3 px-4">案件字段更新增量推送 CHIP (次日跑批)</td>
                    <td className="py-3 px-4 font-bold text-slate-100">{summaryKpi.kpi413.should}</td>
                    <td className="py-3 px-4 text-blue-300 font-medium">{summaryKpi.kpi413.actual} 单号</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">{summaryKpi.kpi413.success} 单号 (Status:202)</td>
                    <td className="py-3 px-4">
                      {summaryKpi.kpi413.should === summaryKpi.kpi413.success ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">全部成功</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">
                          {summaryKpi.kpi413.should - summaryKpi.kpi413.success} 单待重推/失败
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 核对规则可视化逻辑流 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-4 h-4" /> 411 接口判定规则流
                </h4>
                <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                  <li><b>应发判定：</b>SOQL 提取当天申请且 DOJ 状态非“非对象”的修理单与当天提交的 QIS。</li>
                  <li><b>已发判定：</b>案件编号存在于当天 411 日志的 <code>systemReferenceNumber</code> 字段中。</li>
                  <li><b>成功判定：</b>案件的 <code>Complaint_Number__c</code> 字段非空（已从 CHIP 回写 INQ 投诉号）。</li>
                </ul>
              </div>

              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-4 h-4" /> 413 接口判定规则流
                </h4>
                <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                  <li><b>CHIP 纳管基线：</b>创建时间晚于 2024-11-16 00:00:00 的案件纳管。</li>
                  <li><b>应发判定：</b>当天发生字段变更，INQ 号必须以“INQ”开头；未来变更日期回溯次日日志。</li>
                  <li><b>成功判定：</b>同一报文组号 <code>MessageGroupNumber__c</code> 中包含 <code>Status:202</code> 响应。</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 411 修理列表 */}
        {activeTab === '411repair' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">411 修理案件清单 ({computed411Repair.length})</span>
              <span className="text-slate-500">条件: FSE 申请时间在监控日当天且 DOJ 状态 != '非对象'</span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">修理单号 (Name)</th>
                    <th className="py-2.5 px-4">投诉单号 (INQ)</th>
                    <th className="py-2.5 px-4">DOJ 状态</th>
                    <th className="py-2.5 px-4">FSE 申请时间</th>
                    <th className="py-2.5 px-4">昨日应发</th>
                    <th className="py-2.5 px-4">昨日已发</th>
                    <th className="py-2.5 px-4">回写INQ成功</th>
                    <th className="py-2.5 px-4">核验状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {computed411Repair
                    .filter(r => !searchKeyword || r.Name.toLowerCase().includes(searchKeyword.toLowerCase()) || (r.Complaint_Number__c && r.Complaint_Number__c.toLowerCase().includes(searchKeyword.toLowerCase())))
                    .map((item) => (
                      <tr key={item.Id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-medium text-cyan-300">{item.Name}</td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">{item.Complaint_Number__c || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.DOJ_Status__c || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.FSE_ApplyForRepair_time__c?.slice(0, 19).replace('T', ' ') || '-'}</td>
                        <td className="py-2.5 px-4 text-emerald-400">是</td>
                        <td className="py-2.5 px-4">
                          {item.isSent ? (
                            <span className="text-cyan-400">已发日志</span>
                          ) : (
                            <span className="text-slate-500">未见日志</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {item.isGotInq ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">已回写</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">未回写</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-semibold">
                          <span className={item.isGotInq ? 'text-emerald-400' : 'text-amber-400'}>
                            {item.statusText}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {computed411Repair.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        监控日期 {dateTarget} 无符合条件的 411 修理案件记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 411 QIS 列表 */}
        {activeTab === '411qis' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">411 QIS 报告清单 ({computed411Qis.length})</span>
              <span className="text-slate-500">条件: 提交日期为监控日当天且状态 != '非对象'</span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">报告编号 (Name)</th>
                    <th className="py-2.5 px-4">投诉单号 (INQ)</th>
                    <th className="py-2.5 px-4">投诉状态</th>
                    <th className="py-2.5 px-4">提交日期</th>
                    <th className="py-2.5 px-4">昨日应发</th>
                    <th className="py-2.5 px-4">昨日已发</th>
                    <th className="py-2.5 px-4">回写INQ成功</th>
                    <th className="py-2.5 px-4">核验状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {computed411Qis
                    .filter(q => !searchKeyword || q.Name.toLowerCase().includes(searchKeyword.toLowerCase()) || (q.Complaint_Number__c && q.Complaint_Number__c.toLowerCase().includes(searchKeyword.toLowerCase())))
                    .map((item) => (
                      <tr key={item.Id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-medium text-cyan-300">{item.Name}</td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">{item.Complaint_Number__c || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.ComplaintStatus__c || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.QIS_Submit_day__c || '-'}</td>
                        <td className="py-2.5 px-4 text-emerald-400">是</td>
                        <td className="py-2.5 px-4">{item.isSent ? <span className="text-cyan-400">已发日志</span> : <span className="text-slate-500">未见日志</span>}</td>
                        <td className="py-2.5 px-4">
                          {item.isGotInq ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">已回写</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">未回写</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-semibold">
                          <span className={item.isGotInq ? 'text-emerald-400' : 'text-amber-400'}>
                            {item.statusText}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {computed411Qis.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        监控日期 {dateTarget} 无符合条件的 411 QIS 报告记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 411 批处理日志 */}
        {activeTab === '411log' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">411 批处理日志 (NFM411, {log411List.length} 条)</span>
              <span className="text-slate-500">自动解析 JSON 报文提取 systemReferenceNumber 与 INQ 号</span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">日志记录 Id</th>
                    <th className="py-2.5 px-4">解析单号 (Ref)</th>
                    <th className="py-2.5 px-4">解析 INQ 号</th>
                    <th className="py-2.5 px-4">RowDataFlg</th>
                    <th className="py-2.5 px-4">创建时间</th>
                    <th className="py-2.5 px-4">报文内容摘要</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {parsed411Logs
                    .filter(l => !searchKeyword || l.name.toLowerCase().includes(searchKeyword.toLowerCase()) || (l.inquiryNumber && l.inquiryNumber.toLowerCase().includes(searchKeyword.toLowerCase())))
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono text-slate-400">{item.logId}</td>
                        <td className="py-2.5 px-4 font-mono text-cyan-300 font-medium">{item.name}</td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">{item.inquiryNumber || '-'}</td>
                        <td className="py-2.5 px-4">
                          {item.rawFlg ? (
                            <span className="text-emerald-400">true (请求)</span>
                          ) : (
                            <span className="text-slate-400">false (响应)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">{item.createdDate?.slice(0, 19).replace('T', ' ')}</td>
                        <td className="py-2.5 px-4 max-w-xs truncate text-slate-500">
                          {log411List.find(l => l.Id === item.logId)?.Log__c?.slice(0, 80) || '-'}
                        </td>
                      </tr>
                    ))}
                  {parsed411Logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        无 411 批处理日志数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 413 修理列表 */}
        {activeTab === '413repair' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">413 修理增量案件 ({computed413Repair.length})</span>
              <span className="text-slate-500">判定: 更新日期 &gt;= 监控日 且已有 INQ 投诉号</span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">修理单号 (Name)</th>
                    <th className="py-2.5 px-4">投诉号 (INQ)</th>
                    <th className="py-2.5 px-4">更新标记日期</th>
                    <th className="py-2.5 px-4">创建时间</th>
                    <th className="py-2.5 px-4">CHIP案件?</th>
                    <th className="py-2.5 px-4">应发413?</th>
                    <th className="py-2.5 px-4">413已发送?</th>
                    <th className="py-2.5 px-4">发送成功(202)?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {computed413Repair
                    .filter(r => !searchKeyword || r.Name.toLowerCase().includes(searchKeyword.toLowerCase()) || (r.Complaint_Number__c && r.Complaint_Number__c.toLowerCase().includes(searchKeyword.toLowerCase())))
                    .map((item) => (
                      <tr key={item.Id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-medium text-blue-300">{item.Name}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-200">{item.Complaint_Number__c}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.Field_Update_Flag_Date__c || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.CreatedDate?.slice(0, 10)}</td>
                        <td className="py-2.5 px-4">
                          {item.isChip ? (
                            <span className="text-emerald-400">是 (CHIP)</span>
                          ) : (
                            <span className="text-slate-500">否 (旧系统)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-semibold">
                          {item.shouldSendResult ? (
                            <span className="text-emerald-400">应发送</span>
                          ) : (
                            <span className="text-slate-500" title={item.shouldSendReason}>
                              否 ({item.shouldSendReason})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {item.isSent ? <span className="text-cyan-400">已发</span> : <span className="text-slate-500">未发</span>}
                        </td>
                        <td className="py-2.5 px-4 font-semibold">
                          {item.isSuccess ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">成功(202)</span>
                          ) : item.isSent ? (
                            <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-800/60">异常/非202</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  {computed413Repair.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        无符合条件的 413 修理变更记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 413 QIS 列表 */}
        {activeTab === '413qis' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">413 QIS 增量清单 ({computed413Qis.length})</span>
              <span className="text-slate-500">判定: 更新日期 &gt;= 监控日 且已有 INQ 投诉号</span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">报告编号 (Name)</th>
                    <th className="py-2.5 px-4">投诉号 (INQ)</th>
                    <th className="py-2.5 px-4">更新标记日期</th>
                    <th className="py-2.5 px-4">创建时间</th>
                    <th className="py-2.5 px-4">CHIP案件?</th>
                    <th className="py-2.5 px-4">应发413?</th>
                    <th className="py-2.5 px-4">413已发送?</th>
                    <th className="py-2.5 px-4">发送成功(202)?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {computed413Qis
                    .filter(q => !searchKeyword || q.Name.toLowerCase().includes(searchKeyword.toLowerCase()) || (q.Complaint_Number__c && q.Complaint_Number__c.toLowerCase().includes(searchKeyword.toLowerCase())))
                    .map((item) => (
                      <tr key={item.Id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-medium text-blue-300">{item.Name}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-200">{item.Complaint_Number__c}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.Field_Update_Flag_Date__c || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.CreatedDate?.slice(0, 10)}</td>
                        <td className="py-2.5 px-4">
                          {item.isChip ? (
                            <span className="text-emerald-400">是 (CHIP)</span>
                          ) : (
                            <span className="text-slate-500">否 (旧系统)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-semibold">
                          {item.shouldSendResult ? (
                            <span className="text-emerald-400">应发送</span>
                          ) : (
                            <span className="text-slate-500" title={item.shouldSendReason}>
                              否 ({item.shouldSendReason})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {item.isSent ? <span className="text-cyan-400">已发</span> : <span className="text-slate-500">未发</span>}
                        </td>
                        <td className="py-2.5 px-4 font-semibold">
                          {item.isSuccess ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">成功(202)</span>
                          ) : item.isSent ? (
                            <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-800/60">异常/非202</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  {computed413Qis.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        无符合条件的 413 QIS 变更记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 413 批处理日志拆解 */}
        {activeTab === '413log' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">413 批处理拆解日志 ({parsed413Logs.length} 项)</span>
              <span className="text-slate-500">拆分嵌套报文并按 MessageGroupNumber 关联 Status:202 响应</span>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">拆解编号</th>
                    <th className="py-2.5 px-4">消息组号 (GroupNo)</th>
                    <th className="py-2.5 px-4">系统单号 (RefNo)</th>
                    <th className="py-2.5 px-4">响应成功 (202)?</th>
                    <th className="py-2.5 px-4">日志类型</th>
                    <th className="py-2.5 px-4">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {parsed413Logs
                    .filter(l => !searchKeyword || l.name.toLowerCase().includes(searchKeyword.toLowerCase()) || l.groupNumber.toLowerCase().includes(searchKeyword.toLowerCase()))
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono text-slate-400">{item.id}</td>
                        <td className="py-2.5 px-4 font-mono text-blue-300">{item.groupNumber}</td>
                        <td className="py-2.5 px-4 font-mono font-medium text-cyan-300">{item.name}</td>
                        <td className="py-2.5 px-4 font-semibold">
                          {item.isSuccess ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">Status:202 成功</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-800/60">非202</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">{item.type}</td>
                        <td className="py-2.5 px-4 text-slate-400">{item.createdDate?.slice(0, 19).replace('T', ' ')}</td>
                      </tr>
                    ))}
                  {parsed413Logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        无 413 批处理日志数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

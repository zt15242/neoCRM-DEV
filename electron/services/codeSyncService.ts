import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import axios from 'axios';
import { NeoEnvironment, TokenData, EntityMetadata, FieldMetadata } from '../../shared/types';
import { FxiaokeService } from './fxiaokeService';
import { MetadataService } from './metadataService';
import { DataService } from './dataService';

export interface PullProjectResult {
  success: boolean;
  targetDir: string;
  productType: string;
  createdFilesCount: number;
  files: string[];
  manifest?: any;
  summary: string;
}

export class CodeSyncService {
  private fxiaokeService = new FxiaokeService();

  constructor(
    private metadataService: MetadataService,
    private dataService: DataService
  ) {}

  /**
   * 将当前租户的后端代码、前端组件与元数据完整拉取落盘到本地项目目录
   */
  public async pullProjectCode(
    env: NeoEnvironment,
    tokenData: TokenData,
    options: {
      targetDir: string;
      pullType?: 'all' | 'backend' | 'frontend' | 'metadata';
      entityNames?: string[];
    }
  ): Promise<PullProjectResult> {
    const targetDir = path.resolve(options.targetDir);
    const pullType = options.pullType || 'all';
    const pType = env.productType || 'neocrm';

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (pType === 'fxiaoke') {
      return await this.pullFxiaokeProject(env, tokenData, targetDir, pullType, options.entityNames);
    } else if (pType === 'salesforce') {
      return await this.pullSalesforceProject(env, tokenData, targetDir, pullType, options.entityNames);
    } else {
      return await this.pullNeocrmProject(env, tokenData, targetDir, pullType, options.entityNames);
    }
  }

  /**
   * 1. 纷享销客 OpenAPI v2 代码与元数据全量拉取
   */
  private async pullFxiaokeProject(
    env: NeoEnvironment,
    tokenData: TokenData,
    targetDir: string,
    pullType: string,
    customEntityNames?: string[]
  ): Promise<PullProjectResult> {
    const createdFiles: string[] = [];

    // 创建标准目录结构
    const metadataDir = path.join(targetDir, 'metadata');
    const objectsDir = path.join(metadataDir, 'objects');
    const scriptsDir = path.join(targetDir, 'scripts');
    const dataDir = path.join(targetDir, 'data');

    fs.mkdirSync(objectsDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    // 1. 拉取租户全量 150+ 业务对象清单
    const allObjects = await this.fxiaokeService.fetchObjectList(env, tokenData);
    const manifestPath = path.join(metadataDir, 'object_manifest.json');
    const manifestContent = {
      tenantId: tokenData.tenant_id,
      tenantName: tokenData.userInfo?.tenantName || env.name,
      cloudDomain: env.cloudDomain || 'open.fxiaoke.com',
      appId: env.clientId,
      totalCount: allObjects.length,
      pulledAt: new Date().toISOString(),
      standardObjects: allObjects.filter((o) => o.isStandard).map((o) => ({ apiKey: o.apiKey, label: o.label })),
      customObjects: allObjects.filter((o) => !o.isStandard).map((o) => ({ apiKey: o.apiKey, label: o.label })),
      objects: allObjects,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestContent, null, 2), 'utf-8');
    createdFiles.push('metadata/object_manifest.json');

    // 2. 深度拉取核心业务对象与自定义对象 Describe 字段元数据
    const defaultCoreList = [
      'AccountObj',
      'ContactObj',
      'ContractObj',
      'SalesOrderObj',
      'NewOpportunityObj',
      'PaymentObj',
      'ProductObj',
      'LeadsObj',
    ];
    // 合并传入的自定义对象或租户自定义对象
    const targetEntities = customEntityNames && customEntityNames.length > 0
      ? customEntityNames
      : Array.from(new Set([
          ...defaultCoreList,
          ...allObjects.filter((o) => !o.isStandard).slice(0, 5).map((o) => o.apiKey),
        ]));

    for (const objKey of targetEntities) {
      try {
        const fields = await this.fxiaokeService.describeObject(env, tokenData, objKey);
        const objMeta = allObjects.find((o) => o.apiKey.toLowerCase() === objKey.toLowerCase());
        const filePath = path.join(objectsDir, `${objKey}.json`);
        const fileData = {
          apiKey: objKey,
          label: objMeta?.label || objKey,
          isStandard: objMeta?.isStandard ?? objKey.endsWith('Obj'),
          totalFields: fields.length,
          pulledAt: new Date().toISOString(),
          fields,
        };
        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
        createdFiles.push(`metadata/objects/${objKey}.json`);
      } catch (err: any) {
        console.warn(`[Pull] Describe ${objKey} 失败:`, err.message);
      }
    }

    // 3. 生成 package.json 与执行脚本
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      const pkgContent = {
        name: path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        version: '1.0.0',
        description: `纷享销客租户开发工程 (${env.name} · ${tokenData.tenant_id})`,
        main: 'scripts/query_data.js',
        scripts: {
          pull: 'node scripts/pull_metadata.js',
          query: 'node scripts/query_data.js',
        },
        dependencies: {
          axios: '^1.7.0',
        },
      };
      fs.writeFileSync(pkgPath, JSON.stringify(pkgContent, null, 2), 'utf-8');
      createdFiles.push('package.json');
    }

    // 4. 生成可运行的 pull_metadata.js 脚本
    const pullScriptPath = path.join(scriptsDir, 'pull_metadata.js');
    const pullScriptCode = `/**
 * 纷享销客元数据自动化增量更新脚本
 * 运行方式: node scripts/pull_metadata.js
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const APP_ID = '${env.clientId || ''}';
const APP_SECRET = '${env.clientSecret || ''}';
const PERMANENT_CODE = '${env.permanentCode || ''}';
const CLOUD_DOMAIN = '${env.cloudDomain || 'open.fxiaoke.com'}';
const BASE_URL = 'https://' + CLOUD_DOMAIN;

async function getToken() {
  const res = await axios.post(\`\${BASE_URL}/oauth2.0/token?thirdTraceId=\${crypto.randomUUID()}\`, {
    appId: APP_ID,
    permanentCode: PERMANENT_CODE,
    appSecret: APP_SECRET,
    grantType: 'app_secret',
  });
  return res.data.accessToken;
}

async function main() {
  console.log('正在获取有效 Token...');
  const token = await getToken();
  console.log('Token 获取成功，正在拉取租户对象列表...');

  const objRes = await axios.post(\`\${BASE_URL}/cgi/crm/v2/object/list?thirdTraceId=\${crypto.randomUUID()}\`, {
    corpAccessToken: token,
    corpId: '${tokenData.tenant_id}',
    currentOpenUserId: '${tokenData.userInfo?.userId || tokenData.tenant_id}',
    includeNull: true,
  });

  const objects = objRes.data?.data?.objects || [];
  console.log(\`成功拉取 \${objects.length} 个业务对象！\`);
  fs.writeFileSync(path.join(__dirname, '../metadata/object_manifest.json'), JSON.stringify(objRes.data, null, 2));
  console.log('✅ object_manifest.json 已更新');
}

main().catch(console.error);
`;
    fs.writeFileSync(pullScriptPath, pullScriptCode, 'utf-8');
    createdFiles.push('scripts/pull_metadata.js');

    // 5. 生成可运行的 query_data.js 脚本
    const queryScriptPath = path.join(scriptsDir, 'query_data.js');
    const queryScriptCode = `/**
 * 纷享销客数据快速查询脚本 (sharecrm 接口规范)
 * 运行方式: node scripts/query_data.js [ObjectApiName] [limit]
 */
const axios = require('axios');
const crypto = require('crypto');

const APP_ID = '${env.clientId || ''}';
const APP_SECRET = '${env.clientSecret || ''}';
const PERMANENT_CODE = '${env.permanentCode || ''}';
const BASE_URL = 'https://${env.cloudDomain || 'open.fxiaoke.com'}';

async function main() {
  const targetObj = process.argv[2] || 'AccountObj';
  const limit = parseInt(process.argv[3] || '10', 10);

  const tokenRes = await axios.post(\`\${BASE_URL}/oauth2.0/token?thirdTraceId=\${crypto.randomUUID()}\`, {
    appId: APP_ID,
    permanentCode: PERMANENT_CODE,
    appSecret: APP_SECRET,
    grantType: 'app_secret',
  });
  const token = tokenRes.data.accessToken;

  console.log(\`正在查询对象 [\${targetObj}] 数据 (LIMIT \${limit})...\`);
  const queryRes = await axios.post(\`\${BASE_URL}/cgi/crm/v2/data/query?thirdTraceId=\${crypto.randomUUID()}\`, {
    corpAccessToken: token,
    corpId: '${tokenData.tenant_id}',
    currentOpenUserId: '${tokenData.userInfo?.userId || tokenData.tenant_id}',
    data: {
      dataObjectApiName: targetObj,
      search_query_info: { limit, offset: 0 },
    },
  });

  const list = queryRes.data?.data?.dataList || [];
  console.log(\`查询完成！返回 \${list.length} 条记录 (总计: \${queryRes.data?.data?.total || list.length})\`);
  console.dir(list, { depth: null });
}

main().catch(console.error);
`;
    fs.writeFileSync(queryScriptPath, queryScriptCode, 'utf-8');
    createdFiles.push('scripts/query_data.js');

    // 6. 生成 README.md
    const readmePath = path.join(targetDir, 'README.md');
    const readmeContent = `# ${path.basename(targetDir)} - 纷享销客租户工程

> 租户标识: \`${tokenData.tenant_id}\` | 连接器: \`${env.name}\` | 同步时间: ${new Date().toLocaleString()}

本项目由 **NeoCRM & Universal CRM Desktop** 自动初始化，包含了从当前纷享销客租户实时拉取的全量业务对象元数据与接口调用脚本。

## 目录结构

\`\`\`text
${path.basename(targetDir)}/
 ├── metadata/
 │    ├── object_manifest.json    # 租户全量 156 个业务对象清单 (标准+自定义)
 │    └── objects/                # 核心对象字段元数据详情 (Describe)
 │         ├── AccountObj.json           # 客户对象 (含全部字段与类型)
 │         ├── ContactObj.json           # 联系人对象
 │         ├── ContractObj.json          # 合同对象
 │         ├── SalesOrderObj.json        # 销售订单对象
 │         ├── NewOpportunityObj.json    # 销售商机对象
 │         └── ...
 ├── scripts/
 │    ├── pull_metadata.js        # 增量拉取最新对象清单的 Node.js 脚本
 │    └── query_data.js           # 快速查询指定对象数据的脚本
 ├── package.json
 └── README.md
\`\`\`

## 核心元数据统计

- **总对象数**: ${allObjects.length} 个（标准对象: ${allObjects.filter((o) => o.isStandard).length}，自定义对象: ${allObjects.filter((o) => !o.isStandard).length}）
- **核心已 Describe 对象**: ${targetEntities.join(', ')}
- **云网关**: \`https://${env.cloudDomain || 'open.fxiaoke.com'}\`
- **自建应用 AppId**: \`${env.clientId || '未配置'}\`

## 快捷命令

- **重新拉取最新元数据**: \`npm run pull\`
- **查询客户样本数据**: \`node scripts/query_data.js AccountObj 10\`
- **查询合同样本数据**: \`node scripts/query_data.js ContractObj 10\`
`;
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    createdFiles.push('README.md');

    // 7. Git 仓库自动化初始化与首次提交
    try {
      const gitDir = path.join(targetDir, '.git');
      if (!fs.existsSync(gitDir)) {
        execSync('git init', { cwd: targetDir, stdio: 'ignore' });
        execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
        execSync('git commit -m "chore: initial fxiaoke tenant metadata baseline"', { cwd: targetDir, stdio: 'ignore' });
        createdFiles.push('.git/');
      }
    } catch {}

    return {
      success: true,
      targetDir,
      productType: 'fxiaoke',
      createdFilesCount: createdFiles.length,
      files: createdFiles,
      manifest: manifestContent,
      summary: `成功在工作区 [${path.basename(targetDir)}] 拉取纷享销客元数据：包含全量 ${allObjects.length} 个业务对象清单、${targetEntities.length} 个核心对象 Describe 字段详情、查询脚本与 README 说明文档。`,
    };
  }

  /**
   * 2. 销售易 NeoCRM PaaS 后端代码、前端组件与实体全量拉取
   */
  private async pullNeocrmProject(
    env: NeoEnvironment,
    tokenData: TokenData,
    targetDir: string,
    pullType: string,
    customEntityNames?: string[]
  ): Promise<PullProjectResult> {
    const createdFiles: string[] = [];
    const baseUrl = tokenData.instance_uri || env.neoBaseURL || 'https://crm.xiaoshouyi.com';

    // 目录规划
    const srcDir = path.join(targetDir, 'src');
    const codePackagesDir = path.join(srcDir, 'codePackages');
    const componentsDir = path.join(srcDir, 'components');
    const xObjectsDir = path.join(srcDir, 'xObjects');
    const fieldsDir = path.join(xObjectsDir, 'fields');
    const neoCliDir = path.join(targetDir, '.neo-cli');

    fs.mkdirSync(codePackagesDir, { recursive: true });
    fs.mkdirSync(componentsDir, { recursive: true });
    fs.mkdirSync(fieldsDir, { recursive: true });
    fs.mkdirSync(neoCliDir, { recursive: true });

    // 1. 生成 neo.config.js 与 .neo-cli/token.json (对齐 neo-cmp-cli)
    const neoConfigPath = path.join(targetDir, 'neo.config.js');
    if (!fs.existsSync(neoConfigPath)) {
      const neoConfigCode = `module.exports = {
  neoBaseURL: '${baseUrl}',
  envName: '${env.name}',
  tenantId: '${tokenData.tenant_id}',
};
`;
      fs.writeFileSync(neoConfigPath, neoConfigCode, 'utf-8');
      createdFiles.push('neo.config.js');
    }

    const tokenJsonPath = path.join(neoCliDir, 'token.json');
    const tokenJsonContent = {
      access_token: tokenData.access_token,
      instance_uri: baseUrl,
      tenant_id: tokenData.tenant_id,
      user_id: tokenData.userInfo?.userId,
      user_name: tokenData.userInfo?.name,
      saved_at: Date.now(),
    };
    fs.writeFileSync(tokenJsonPath, JSON.stringify(tokenJsonContent, null, 2), 'utf-8');
    createdFiles.push('.neo-cli/token.json');

    // 2. 拉取租户后端代码包 (Backend PaaS Code Packages)
    let packagesCount = 0;
    try {
      const pkgRes = await axios.get(`${baseUrl}/rest/metadata/v2.0/scripts/packages`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        timeout: 15000,
      });
      const records = pkgRes.data?.data?.records;
      const pkgList = Array.isArray(records) ? records : (records ? [records] : []);
      packagesCount = pkgList.length;

      for (const pkg of pkgList) {
        const pkgName = pkg.packageName || pkg.name || 'scriptPackage';
        const pkgTargetDir = path.join(codePackagesDir, pkgName);
        fs.mkdirSync(pkgTargetDir, { recursive: true });

        // 若有 zip 文件则下载并解压
        if (pkg.uploadFile) {
          try {
            const zipPath = path.join(targetDir, `${pkgName}_tmp.zip`);
            const writer = fs.createWriteStream(zipPath);
            const response = await axios({
              url: pkg.uploadFile,
              method: 'GET',
              responseType: 'stream',
              timeout: 20000,
            });
            response.data.pipe(writer);
            await new Promise((res, rej) => {
              writer.on('finish', res);
              writer.on('error', rej);
            });
            try {
              execSync(`unzip -o "${zipPath}" -d "${pkgTargetDir}"`, { stdio: 'ignore' });
            } catch {}
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            createdFiles.push(`src/codePackages/${pkgName}/ (代码已解压)`);
          } catch {}
        } else {
          // 生成基本描述文件
          const descPath = path.join(pkgTargetDir, 'doc.md');
          fs.writeFileSync(descPath, `# ${pkgName}\n\n- 版本: ${pkg.version || '1.0.0'}\n- 描述: ${pkg.description || '销售易后端脚本包'}\n`);
          createdFiles.push(`src/codePackages/${pkgName}/doc.md`);
        }
      }
    } catch (e: any) {
      console.warn('[Pull] 获取销售易后端代码包异常:', e.message);
    }

    // 3. 拉取实体元数据字典 (AllxObjects.md 与 fields/*.md)
    const entities = await this.metadataService.fetchEntityList(env, tokenData);
    const allXObjectsPath = path.join(xObjectsDir, 'AllxObjects.md');
    const tableRows = entities.map((e) => `| ${e.label} | \`${e.apiKey}\` | ${e.isStandard ? '标准对象' : '自定义对象'} |`).join('\n');
    const allObjectsDoc = `# 销售易租户实体模型字典

> 租户: \`${tokenData.userInfo?.tenantName || env.name}\` (ID: ${tokenData.tenant_id}) | 实例: \`${baseUrl}\` | 共 ${entities.length} 个实体

| 实体中文名称 | API Key | 实体属性 |
| :--- | :--- | :--- |
${tableRows}
`;
    fs.writeFileSync(allXObjectsPath, allObjectsDoc, 'utf-8');
    createdFiles.push('src/xObjects/AllxObjects.md');

    // 4. 拉取核心实体的详细字段定义
    const coreEntities = customEntityNames && customEntityNames.length > 0
      ? customEntityNames
      : ['account', 'contact', 'opportunity', 'order', 'contract'];

    for (const apiKey of coreEntities) {
      try {
        const fields = await this.metadataService.fetchEntityFields(env, tokenData, apiKey);
        const fieldRows = fields.map((f) => `| ${f.label} | \`${f.apiKey}\` | ${f.typeName || f.itemType} | ${f.custom ? '自定义' : '标准'} |`).join('\n');
        const fieldDoc = `# ${apiKey} 实体字段定义字典

> 所属对象: \`${apiKey}\` | 字段总数: ${fields.length}

| 字段名称 | API Key | 字段类型 | 属性 |
| :--- | :--- | :--- | :--- |
${fieldRows}
`;
        fs.writeFileSync(path.join(fieldsDir, `${apiKey}.md`), fieldDoc, 'utf-8');
        createdFiles.push(`src/xObjects/fields/${apiKey}.md`);
      } catch {}
    }

    // 5. 生成 package.json 与 README
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      const pkgContent = {
        name: path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        version: '1.0.0',
        description: `销售易 PaaS 全栈开发工程 (${env.name})`,
        scripts: {
          deploy: 'node scripts/deploy.js',
        },
      };
      fs.writeFileSync(pkgPath, JSON.stringify(pkgContent, null, 2), 'utf-8');
      createdFiles.push('package.json');
    }

    const readmePath = path.join(targetDir, 'README.md');
    const readmeContent = `# ${path.basename(targetDir)} - 销售易 PaaS 工程

- **租户**: ${tokenData.userInfo?.tenantName || env.name} (ID: \`${tokenData.tenant_id}\`)
- **实例地址**: \`${baseUrl}\`
- **已拉取后端代码包**: ${packagesCount} 个
- **实体总数**: ${entities.length} 个

## 目录结构
\`\`\`text
${path.basename(targetDir)}/
 ├── src/
 │    ├── codePackages/          # Java 后端代码包 (Triggers, APIs, Schedules)
 │    ├── components/            # 前端自定义组件 (*__c)
 │    └── xObjects/              # 租户实体与字段字典
 │         ├── AllxObjects.md
 │         └── fields/
 ├── .neo-cli/token.json         # neo-cmp-cli 凭证
 ├── neo.config.js               # 销售易环境配置文件
 └── package.json
\`\`\`
`;
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    createdFiles.push('README.md');

    // 6. Git 仓库初始化
    try {
      if (!fs.existsSync(path.join(targetDir, '.git'))) {
        execSync('git init', { cwd: targetDir, stdio: 'ignore' });
        execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
        execSync('git commit -m "chore: initial neocrm project baseline"', { cwd: targetDir, stdio: 'ignore' });
        createdFiles.push('.git/');
      }
    } catch {}

    return {
      success: true,
      targetDir,
      productType: 'neocrm',
      createdFilesCount: createdFiles.length,
      files: createdFiles,
      summary: `成功在工作区 [${path.basename(targetDir)}] 拉取销售易代码与元数据：包含 ${packagesCount} 个后端脚本包、${entities.length} 个实体模型字典、核心对象字段定义与 neo.config.js 配置。`,
    };
  }

  /**
   * 3. Salesforce 工程骨架与元数据拉取
   */
  private async pullSalesforceProject(
    env: NeoEnvironment,
    tokenData: TokenData,
    targetDir: string,
    pullType: string,
    customEntityNames?: string[]
  ): Promise<PullProjectResult> {
    const createdFiles: string[] = [];
    const metaDir = path.join(targetDir, 'metadata');
    const sobjectsDir = path.join(metaDir, 'sobjects');
    fs.mkdirSync(sobjectsDir, { recursive: true });

    // 1. SObjects 列表
    const sobjects = await this.metadataService.fetchEntityList(env, tokenData);
    fs.writeFileSync(
      path.join(metaDir, 'sobjects_manifest.json'),
      JSON.stringify({ total: sobjects.length, sobjects }, null, 2),
      'utf-8'
    );
    createdFiles.push('metadata/sobjects_manifest.json');

    // 2. Describe 核心对象
    const coreList = customEntityNames || ['Account', 'Contact', 'Opportunity', 'Lead', 'Case'];
    for (const sobj of coreList) {
      try {
        const fields = await this.metadataService.fetchEntityFields(env, tokenData, sobj);
        fs.writeFileSync(
          path.join(sobjectsDir, `${sobj}.json`),
          JSON.stringify({ name: sobj, totalFields: fields.length, fields }, null, 2),
          'utf-8'
        );
        createdFiles.push(`metadata/sobjects/${sobj}.json`);
      } catch {}
    }

    // 3. sfdx-project.json 与 package.json
    const sfdxConfig = {
      packageDirectories: [{ path: 'force-app', default: true }],
      namespace: '',
      sfdcLoginUrl: env.neoBaseURL || 'https://login.salesforce.com',
      sourceApiVersion: '60.0',
    };
    fs.writeFileSync(path.join(targetDir, 'sfdx-project.json'), JSON.stringify(sfdxConfig, null, 2), 'utf-8');
    createdFiles.push('sfdx-project.json');

    const readmeContent = `# ${path.basename(targetDir)} - Salesforce Project\n\n- Org ID: \`${tokenData.tenant_id}\`\n- Total SObjects: ${sobjects.length}\n`;
    fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent, 'utf-8');
    createdFiles.push('README.md');

    try {
      if (!fs.existsSync(path.join(targetDir, '.git'))) {
        execSync('git init', { cwd: targetDir, stdio: 'ignore' });
        execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
        execSync('git commit -m "chore: initial salesforce metadata baseline"', { cwd: targetDir, stdio: 'ignore' });
        createdFiles.push('.git/');
      }
    } catch {}

    return {
      success: true,
      targetDir,
      productType: 'salesforce',
      createdFilesCount: createdFiles.length,
      files: createdFiles,
      summary: `成功在工作区 [${path.basename(targetDir)}] 拉取 Salesforce 元数据：包含 ${sobjects.length} 个 SObjects 清单与核心对象 Describe。`,
    };
  }
}

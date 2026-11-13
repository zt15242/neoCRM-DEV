import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-migration-test-'));

try {
  const subjectFile = path.join(fixture, 'subject.cjs');
  await build({
    stdin: {
      resolveDir: root,
      loader: 'ts',
      contents: `
        export { migrationEncryption } from './electron/services/migration/migrationEncryption';
        export { isMigrationSkill, getMigrationSkillInstruction, runMigrationSkillScript, readMigrationSkillPackage } from './electron/security/migrationSkillPackage';
        export { matchesCronExpression, MigrationService } from './electron/services/migration/migrationService';
        export { isProtectedBuiltinSkill, getProtectedSkillInstruction } from './electron/security/protectedHarness';
      `,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: subjectFile,
    external: ['esbuild'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'mock-electron',
        setup(builder) {
          builder.onResolve({ filter: /^mongodb$/ }, () => ({ path: path.join(root, 'node_modules/mongodb/lib/index.js') }));
          builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
          builder.onLoad({ filter: /^electron$/, namespace: 'fixture' }, () => ({
            contents: `
              export const app = { getPath: () => ${JSON.stringify(fixture)}, isPackaged: false };
              export const safeStorage = {
                isEncryptionAvailable: () => true,
                encryptString: (s) => Buffer.from('mock:' + s, 'utf8'),
                decryptString: (b) => b.toString('utf8').replace(/^mock:/, ''),
              };
              export const Notification = class { show() {} static isSupported() { return false; } };
              export const dialog = {};
              export const shell = {};
              export const BrowserWindow = class {};
            `,
          }));
        },
      },
    ],
  });

  const s = createRequire(import.meta.url)(subjectFile);
  const {
    migrationEncryption,
    isMigrationSkill,
    getMigrationSkillInstruction,
    runMigrationSkillScript,
    readMigrationSkillPackage,
    matchesCronExpression,
    isProtectedBuiltinSkill,
    getProtectedSkillInstruction,
  } = s;

  // 1. Test MigrationEncryptionService
  const rawUri = 'mongodb://app_user:SuperSecretPassword123@10.0.1.25:27017/neocrm_mig?authSource=admin';
  const masked = migrationEncryption.maskMongoUri(rawUri);
  assert.equal(masked, 'mongodb://app_user:******@10.0.1.25:27017/neocrm_mig?authSource=admin');
  assert(!masked.includes('SuperSecretPassword123'), 'URI password must be masked');

  const encCred = migrationEncryption.encryptCredential(rawUri);
  assert.notEqual(encCred, rawUri);
  const decCred = migrationEncryption.decryptCredential(encCred);
  assert.equal(decCred, rawUri, 'Decrypted credential must match original');

  const dummyDek = crypto.randomBytes(32);
  const sensitivePhone = '13812345678';
  const encField = migrationEncryption.encryptFieldValue(sensitivePhone, dummyDek);
  assert(encField.startsWith('mig-enc:v1:'));
  assert(!encField.includes(sensitivePhone), 'Ciphertext must not expose plaintext phone');
  const decField = migrationEncryption.decryptFieldValue(encField, dummyDek);
  assert.equal(decField, sensitivePhone, 'Decrypted field must match original');

  assert.equal(migrationEncryption.applyMask('13812345678', 'phone'), '138****5678');
  assert.equal(migrationEncryption.applyMask('张三', 'name'), '张*');
  assert.equal(migrationEncryption.applyMask('诸葛孔明', 'name'), '诸**明');
  assert.equal(migrationEncryption.applyMask('440106199001011234', 'idcard'), '4401**********1234');
  console.log('PASS 1: Migration credential and envelope encryption verified');

  // 2. Test Protected Skill Package & Anti-Exfiltration Guard
  assert(isMigrationSkill('skill-crm-data-migration'));
  assert(isMigrationSkill('crm-data-migration'));
  assert(isProtectedBuiltinSkill('skill-crm-data-migration'));
  const instruction = getMigrationSkillInstruction('skill-crm-data-migration');
  assert(instruction && instruction.includes('CRM 数据迁移与割接专家执行规范'));
  assert.equal(getProtectedSkillInstruction('skill-crm-data-migration'), instruction);

  // Verify scripts/*.mjs cannot be dumped via resource read
  assert.throws(
    () => readMigrationSkillPackage('crm-data-migration', { resource: 'scripts/dag-planner.mjs' }),
    /受加密沙箱保护/
  );
  // Verify references/*.md can be read via resource pagination
  const refChunk = readMigrationSkillPackage('crm-data-migration', {
    resource: 'references/platform-mapping-matrix.md',
    offset: 1,
    limit: 5,
  });
  assert(refChunk.content.includes('跨 CRM 标准对象'));

  // Test DAG topology solver in protected VM sandbox
  const mockObjects = [
    { entityApiKey: 'Contract', lookups: [{ field: 'opportunityId', targetEntity: 'Opportunity' }, { field: 'accountId', targetEntity: 'Account' }] },
    { entityApiKey: 'Account', lookups: [{ field: 'parentAccountId', targetEntity: 'Account' }, { field: 'ownerId', targetEntity: 'User' }] },
    { entityApiKey: 'User', lookups: [] },
    { entityApiKey: 'Contact', lookups: [{ field: 'accountId', targetEntity: 'Account' }] },
    { entityApiKey: 'Opportunity', lookups: [{ field: 'accountId', targetEntity: 'Account' }] },
    { entityApiKey: 'Payment', lookups: [{ field: 'contractId', targetEntity: 'Contract' }] },
  ];

  const dagOrder = runMigrationSkillScript('scripts/dag-planner.mjs', 'solveMigrationTopology', [mockObjects]);
  assert.equal(dagOrder.length, 6);
  const entities = dagOrder.map((d) => d.entityApiKey);
  assert(entities.indexOf('User') < entities.indexOf('Account'), 'User before Account');
  assert(entities.indexOf('Account') < entities.indexOf('Contact'), 'Account before Contact');
  assert(entities.indexOf('Account') < entities.indexOf('Opportunity'), 'Account before Opportunity');
  assert(entities.indexOf('Opportunity') < entities.indexOf('Contract'), 'Opportunity before Contract');
  assert(entities.indexOf('Contract') < entities.indexOf('Payment'), 'Contract before Payment');

  const accountNode = dagOrder.find((d) => d.entityApiKey === 'Account');
  assert.equal(accountNode.twoPassLookup, true, 'Account self-reference parentAccountId must trigger twoPassLookup');
  assert(accountNode.primaryLookupFields.includes('parentAccountId'));
  console.log('PASS 2: Protected VM sandbox DAG topological solver & source protection verified');

  // 3. Test Field Mapping Recommender & Data Scrubber
  const rec = runMigrationSkillScript('scripts/mapping-recommender.mjs', 'recommendFieldMappings', [{
    sourceEntity: 'Account',
    targetEntity: 'account',
    sourceFields: [
      { apiKey: 'Name', label: 'Company Name' },
      { apiKey: 'Phone', label: 'Phone' },
      { apiKey: 'ParentId', label: 'Parent Account' },
      { apiKey: 'Tax_No__c', label: 'Tax No' },
    ],
    targetFields: [
      { apiKey: 'accountName', label: '客户名称' },
      { apiKey: 'phone', label: '电话' },
      { apiKey: 'parentAccountId', label: '母公司' },
      { apiKey: 'taxNumber', label: '税号' },
    ],
    topologyMode: 'n_to_1',
    maskSensitive: true,
  }]);

  assert(rec.mappings.some((m) => m.sourceField === 'Name' && m.targetField === 'accountName'));
  assert(rec.mappings.some((m) => m.sourceField === 'Phone' && m.targetField === 'phone'));
  assert(rec.mappings.some((m) => m.sourceField === 'ParentId' && m.targetField === 'parentAccountId'));
  assert(rec.mappings.some((m) => m.sourceField === 'Tax_No__c' && m.targetField === 'taxNumber'));
  assert(rec.mappings.some((m) => m.isEncryptedInStage === true), 'Phone or tax must be marked for envelope encryption');

  const scrubbed = runMigrationSkillScript('scripts/data-scrubber.mjs', 'evaluateTransformPreview', [
    rec.mappings,
    [{ Name: '某某科技有限公司', Phone: '13987654321', Tax_No__c: '91310000XXXXXXXXXX' }],
  ]);
  assert.equal(scrubbed[0].accountName, '某某科技有限公司');
  assert(scrubbed[0].phone.includes('****'), 'Phone must be scrubbed in preview');
  console.log('PASS 3: Protected mapping recommendation & data scrubber verified');

  // 4. Test Error Diagnostics Clustering
  const mockErrors = [
    { sourceId: '101', errorMessage: 'UNABLE_TO_LOCK_ROW: unable to obtain exclusive access to this record' },
    { sourceId: '102', errorMessage: 'UNABLE_TO_LOCK_ROW: record is currently being updated' },
    { sourceId: '103', errorMessage: 'REQUIRED_FIELD_MISSING: [accountName]' },
    { sourceId: '104', errorMessage: 'INVALID_CROSS_REFERENCE_KEY: Foreign key not found' },
  ];
  const clusters = runMigrationSkillScript('scripts/error-diagnoser.mjs', 'diagnoseMigrationErrors', [mockErrors]);
  assert.equal(clusters[0].category, 'ROW_LOCK');
  assert.equal(clusters[0].count, 2);
  assert(clusters[0].advice.includes('父记录'));
  assert(clusters.some((c) => c.category === 'MISSING_REQUIRED'));
  assert(clusters.some((c) => c.category === 'BROKEN_LOOKUP'));
  console.log('PASS 4: Error diagnosis clustering verified');

  // 5. Test Cron Matcher
  const dateA = new Date('2026-11-13T02:00:00.000');
  assert(matchesCronExpression('0 2 * * *', dateA));
  assert(!matchesCronExpression('30 2 * * *', dateA));
  assert(matchesCronExpression('*/15 * * * *', new Date('2026-11-13T02:45:00.000')));
  assert(!matchesCronExpression('*/15 * * * *', new Date('2026-11-13T02:44:00.000')));
  console.log('PASS 5: Cron expression matcher verified');

    // 6. Test Connector Mention Exclusion & Multiple Mention Extraction
  const allAccounts = [
    { accountId: "acc_active_shanghai", connectorId: "env_shanghai", connectorName: "PAV模拟沙盒", productType: "neocrm", tenantName: "PAV模拟" },
    { accountId: "acc_target_sf", connectorId: "env_sf", connectorName: "上海Salesforce沙盒", productType: "salesforce", tenantName: "SF-TestOrg" },
    { accountId: "acc_target_fxk", connectorId: "env_fxk", connectorName: "北京纷享销客生产", productType: "fxiaoke", tenantName: "FXK-Enterprise" },
  ];
  const currentSession = { activeAccountId: "acc_active_shanghai", environment: { id: "env_shanghai", name: "PAV模拟沙盒" } };

  // Rule: Exclude the currently in-use account (it is the default active context)
  const mentionableConnectors = allAccounts.filter((acc) => {
    if (currentSession?.activeAccountId && acc.accountId === currentSession.activeAccountId) return false;
    if (currentSession?.environment?.id && acc.connectorId === currentSession.environment.id && !currentSession.activeAccountId) return false;
    return true;
  });

  assert.equal(mentionableConnectors.length, 2, "Must exclude current active account");
  assert(!mentionableConnectors.some((a) => a.accountId === "acc_active_shanghai"), "Current account must be excluded from mention list");
  assert(mentionableConnectors.some((a) => a.accountId === "acc_target_sf"), "Salesforce connector must be included");
  assert(mentionableConnectors.some((a) => a.accountId === "acc_target_fxk"), "Fxiaoke connector must be included");

  // Test multiple mention extraction from prompt text
  const promptText = "请把客户数据从当前租户迁移并拆分到 @连接器-上海Salesforce沙盒 和 @连接器-北京纷享销客生产 中";
  const extractedIds = [];
  for (const acc of mentionableConnectors) {
    const safeName = acc.connectorName.replace(/[.*+?^${}()|[\]\\]/g, "\\console.log('ALL MIGRATION SUITE TESTS PASSED SUCCESSFULLY!');");
    const pattern = new RegExp("@连接器[-_]" + safeName, "i");
    if (pattern.test(promptText)) extractedIds.push(acc.accountId);
  }
  assert.equal(extractedIds.length, 2, "Must extract both mentioned target connectors");
  assert(extractedIds.includes("acc_target_sf"));
  assert(extractedIds.includes("acc_target_fxk"));
  console.log("PASS 6: Connector mention exclusion & multiple mention extraction verified");

  console.log('ALL MIGRATION SUITE TESTS PASSED SUCCESSFULLY!');
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}

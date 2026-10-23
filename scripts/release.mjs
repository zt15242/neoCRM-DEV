import fs from 'node:fs';
import { execSync } from 'node:child_process';

const pkgPath = new URL('../package.json', import.meta.url);
const headerPath = new URL('../src/components/Header.tsx', import.meta.url);
const appSidebarPath = new URL('../src/components/AppSidebar.tsx', import.meta.url);
const notesPath = new URL('../RELEASE_NOTES.md', import.meta.url);
const constantsPath = new URL('../shared/constants.ts', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const args = process.argv.slice(2);
let bumpType = null;
let userNotes = '';

// 解析命令行参数:
// 例如: node scripts/release.mjs patch "更新说明..."
// 或: node scripts/release.mjs "更新说明..."
for (const arg of args) {
  if (['patch', 'minor', 'major'].includes(arg)) {
    bumpType = arg;
  } else if (!userNotes) {
    userNotes = arg.trim();
  }
}

function bumpVersion(ver, type) {
  const parts = ver.split('.').map(Number);
  if (type === 'major') return `${parts[0] + 1}.0.0`;
  if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  if (type === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  return ver;
}

// 1. 版本号升级 (如有)
if (bumpType) {
  const newVer = bumpVersion(pkg.version, bumpType);
  console.log(`[Release] 版本号自动升级: v${pkg.version} -> v${newVer}`);
  pkg.version = newVer;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  if (fs.existsSync(headerPath)) {
    let headerContent = fs.readFileSync(headerPath, 'utf-8');
    headerContent = headerContent.replace(/<span>v\d+\.\d+\.\d+<\/span>/, `<span>v${newVer}</span>`);
    fs.writeFileSync(headerPath, headerContent, 'utf-8');
  }
  if (fs.existsSync(appSidebarPath)) {
    let sidebarContent = fs.readFileSync(appSidebarPath, 'utf-8');
    sidebarContent = sidebarContent.replace(/<span>v\d+\.\d+\.\d+<\/span>/, `<span>v${newVer}</span>`);
    fs.writeFileSync(appSidebarPath, sidebarContent, 'utf-8');
  }
  if (fs.existsSync(constantsPath)) {
    let constantsContent = fs.readFileSync(constantsPath, 'utf-8');
    constantsContent = constantsContent.replace(/'v\d+\.\d+\.\d+'/, `'v${newVer}'`);
    fs.writeFileSync(constantsPath, constantsContent, 'utf-8');
  }
}

const tag = `v${pkg.version}`;

// 2. 自动收集或生成版本更新说明 (Release Notes)
let releaseNotes = '';

if (userNotes) {
  releaseNotes = userNotes;
} else if (fs.existsSync(notesPath)) {
  const existingNotes = fs.readFileSync(notesPath, 'utf-8').trim();
  if (existingNotes) {
    releaseNotes = existingNotes;
  }
}

if (!releaseNotes) {
  // 从 Git 历史中自动获取自上一个 tag 以来的提交说明
  try {
    let prevTag = '';
    try {
      prevTag = execSync('git describe --tags --abbrev=0 HEAD^', { encoding: 'utf-8' }).trim();
    } catch {
      try {
        prevTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
      } catch {}
    }

    const logCmd = prevTag
      ? `git log ${prevTag}..HEAD --pretty=format:"%s"`
      : `git log -n 10 --pretty=format:"%s"`;

    const commits = execSync(logCmd, { encoding: 'utf-8' })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && !s.startsWith('chore(release):'));

    if (commits.length > 0) {
      const items = commits.map((c, idx) => `${idx + 1}. ${c}`).join('\n');
      releaseNotes = `### 🚀 版本更新说明 (v${pkg.version})\n\n${items}`;
    }
  } catch {}
}

if (!releaseNotes) {
  releaseNotes = `### 🚀 版本更新说明 (v${pkg.version})\n\n1. 性能提升与稳定性优化\n2. 修复已知问题与界面交互提升`;
}

// 写入 RELEASE_NOTES.md
fs.writeFileSync(notesPath, releaseNotes.trim() + '\n', 'utf-8');
console.log(`\n[Release] 更新说明已保存至 RELEASE_NOTES.md:\n----------------------------------------\n${releaseNotes}\n----------------------------------------\n`);

// 提交变更
try {
  execSync('git add package.json src/components/Header.tsx src/components/AppSidebar.tsx shared/constants.ts RELEASE_NOTES.md scripts/release.mjs', { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): bump version to ${tag}"`, { stdio: 'inherit' });
} catch {
  // 如果没有文件需要 commit 则继续
}

console.log(`[Release] 正在创建并推送 Git 标签 ${tag} 以触发云端自动打包...`);

try {
  try {
    execSync(`git tag -d ${tag}`, { stdio: 'ignore' });
  } catch {}

  // 使用带注释的 tag (包含更新说明)
  execSync(`git tag -a ${tag} -F RELEASE_NOTES.md`, { stdio: 'inherit' });
  execSync(`git push origin main`, { stdio: 'inherit' });
  execSync(`git push origin ${tag} --force`, { stdio: 'inherit' });
  console.log(`\n✅ 成功推送标签 ${tag}！GitHub Actions 将自动执行多平台构建并归档包含此更新说明的 Release。`);
} catch (err) {
  console.error(`\n❌ 发布触发失败:`, err.message);
  process.exit(1);
}

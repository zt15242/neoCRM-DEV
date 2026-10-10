import fs from 'node:fs';
import { execSync } from 'node:child_process';

const pkgPath = new URL('../package.json', import.meta.url);
const headerPath = new URL('../src/components/Header.tsx', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const args = process.argv.slice(2);
const bumpType = args[0]; // 'patch' | 'minor' | 'major' (可选)

function bumpVersion(ver, type) {
  const parts = ver.split('.').map(Number);
  if (type === 'major') return `${parts[0] + 1}.0.0`;
  if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  if (type === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  return ver;
}

if (bumpType && ['patch', 'minor', 'major'].includes(bumpType)) {
  const newVer = bumpVersion(pkg.version, bumpType);
  console.log(`[Release] 版本号自动升级: v${pkg.version} -> v${newVer}`);
  pkg.version = newVer;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  if (fs.existsSync(headerPath)) {
    let headerContent = fs.readFileSync(headerPath, 'utf-8');
    headerContent = headerContent.replace(/<span>v\d+\.\d+\.\d+<\/span>/, `<span>v${newVer}</span>`);
    fs.writeFileSync(headerPath, headerContent, 'utf-8');
  }

  execSync(`git add package.json src/components/Header.tsx && git commit -m "chore(release): bump version to v${newVer}"`, { stdio: 'inherit' });
}

const tag = `v${pkg.version}`;
console.log(`[Release] 正在创建并推送 Git 标签 ${tag} 以触发云端自动打包...`);

try {
  try {
    execSync(`git tag -d ${tag}`, { stdio: 'ignore' });
  } catch {}

  execSync(`git tag ${tag}`, { stdio: 'inherit' });
  execSync(`git push origin main`, { stdio: 'inherit' });
  execSync(`git push origin ${tag} --force`, { stdio: 'inherit' });
  console.log(`\n✅ 成功推送标签 ${tag}！GitHub Actions 已自动开始构建 Windows (.exe) 与 macOS (.dmg) 安装包。`);
} catch (err) {
  console.error(`\n❌ 发布触发失败:`, err.message);
  process.exit(1);
}

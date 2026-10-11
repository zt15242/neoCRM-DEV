import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { dialog, BrowserWindow, shell } from 'electron';
import { AiSkillItem } from '../../shared/types';

export class SkillPackageService {
  /**
   * 解析 Frontmatter 与正文
   */
  private parseMarkdownFrontmatter(content: string): {
    metadata: Record<string, any>;
    body: string;
  } {
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
      return { metadata: {}, body: trimmed };
    }

    const endIdx = trimmed.indexOf('\n---', 3);
    if (endIdx === -1) {
      return { metadata: {}, body: trimmed };
    }

    const frontmatterText = trimmed.slice(3, endIdx).trim();
    const body = trimmed.slice(endIdx + 4).trim();
    const metadata: Record<string, any> = {};

    for (const line of frontmatterText.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();
        // 去除外层引号
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // 解析简单数组 [a, b, c]
        if (val.startsWith('[') && val.endsWith(']')) {
          metadata[key] = val
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        } else {
          metadata[key] = val;
        }
      }
    }

    return { metadata, body };
  }

  /**
   * 从 Buffer 解析 ZIP 技能包
   */
  public async parseSkillZipBuffer(
    buffer: Buffer,
    defaultName = '导入技能'
  ): Promise<{ skills: AiSkillItem[]; error?: string }> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const parsedSkills: AiSkillItem[] = [];

      // 提取所有合法文件
      const entries: { path: string; name: string; isDir: boolean; readText: () => Promise<string> }[] = [];
      zip.forEach((relPath, entry) => {
        // 过滤 macOS 临时隐藏文件
        if (relPath.includes('__MACOSX') || relPath.includes('.DS_Store') || path.basename(relPath).startsWith('._')) {
          return;
        }
        if (!entry.dir) {
          entries.push({
            path: relPath,
            name: path.basename(relPath),
            isDir: false,
            readText: () => entry.async('text'),
          });
        }
      });

      if (entries.length === 0) {
        return { skills: [], error: 'ZIP 压缩包内未找到有效文件' };
      }

      // 1. 查找是否存在结构化 JSON (skill.json, skills.json, manifest.json)
      const jsonEntries = entries.filter((e) => ['skill.json', 'skills.json', 'manifest.json'].includes(e.name.toLowerCase()));
      for (const jEntry of jsonEntries) {
        try {
          const raw = await jEntry.readText();
          const data = JSON.parse(raw);
          const list = Array.isArray(data) ? data : data.skills && Array.isArray(data.skills) ? data.skills : [data];
          for (const item of list) {
            const name = item.name || item.title || defaultName;
            const instruction = item.systemInstruction || item.instruction || item.prompt || item.content;
            if (instruction) {
              parsedSkills.push({
                id: `skill_zip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: String(name).trim(),
                description: String(item.description || '从 ZIP 技能包导入的专属业务技能').trim(),
                category: 'personal',
                iconName: item.iconName || 'Lightbulb',
                triggerKeywords: Array.isArray(item.triggerKeywords)
                  ? item.triggerKeywords
                  : Array.isArray(item.triggers)
                  ? item.triggers
                  : typeof item.triggerKeywords === 'string'
                  ? item.triggerKeywords.split(/[,，\s]+/).filter(Boolean)
                  : [],
                systemInstruction: String(instruction).trim(),
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }
          }
        } catch {}
      }

      // 2. 查找所有 SKILL.md 或包含 skill 命名的 markdown 文件
      const mdEntries = entries.filter(
        (e) => e.name.toLowerCase() === 'skill.md' || (e.name.toLowerCase().endsWith('.md') && !e.name.toLowerCase().includes('readme'))
      );

      for (const mEntry of mdEntries) {
        // 如果该文件所在文件夹或名称已经通过 JSON 解析过，则跳过
        const raw = await mEntry.readText();
        const { metadata, body } = this.parseMarkdownFrontmatter(raw);

        // 推断技能名称
        let skillName = metadata.name || metadata.title;
        if (!skillName) {
          // 查找首个一级标题 # xxx
          const headerMatch = body.match(/^#\s+(.+)$/m);
          if (headerMatch) {
            skillName = headerMatch[1].trim();
          } else {
            // 取父目录名或文件名
            const dirName = path.dirname(mEntry.path);
            skillName = dirName !== '.' ? path.basename(dirName) : path.basename(mEntry.name, '.md');
          }
        }

        // 推断关键词
        let keywords: string[] = [];
        if (metadata.triggerKeywords && Array.isArray(metadata.triggerKeywords)) {
          keywords = metadata.triggerKeywords;
        } else if (metadata.triggers && Array.isArray(metadata.triggers)) {
          keywords = metadata.triggers;
        } else if (metadata.triggerKeywords && typeof metadata.triggerKeywords === 'string') {
          keywords = metadata.triggerKeywords.split(/[,，\s]+/).filter(Boolean);
        }

        // 推断描述
        const desc = metadata.description || `${skillName} 业务指导与规范`;
        const instruction = body.trim() || raw.trim();

        if (instruction && !parsedSkills.some((s) => s.name === skillName)) {
          parsedSkills.push({
            id: `skill_zip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: String(skillName).trim(),
            description: String(desc).trim(),
            category: 'personal',
            iconName: 'Lightbulb',
            triggerKeywords: keywords,
            systemInstruction: instruction,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }

      // 3. 如果以上都没有识别到，但包内有其他 .txt / .md 文件，整合成一个技能
      if (parsedSkills.length === 0) {
        const textEntries = entries.filter((e) => e.name.endsWith('.md') || e.name.endsWith('.txt'));
        if (textEntries.length > 0) {
          let combinedInstruction = '';
          for (const te of textEntries) {
            const content = await te.readText();
            combinedInstruction += `\n\n### 知识库文档: ${te.name}\n${content.trim()}`;
          }
          parsedSkills.push({
            id: `skill_zip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: path.basename(defaultName, '.zip') || '导入自定义业务技能',
            description: `包含 ${textEntries.length} 个规范文档的业务技能包`,
            category: 'personal',
            iconName: 'Lightbulb',
            triggerKeywords: [],
            systemInstruction: combinedInstruction.trim(),
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }

      if (parsedSkills.length === 0) {
        return { skills: [], error: '未能在 ZIP 包中识别出有效的技能定义或 Markdown 指令文件' };
      }

      return { skills: parsedSkills };
    } catch (err: any) {
      console.error('解压或解析 ZIP 技能包失败:', err);
      return { skills: [], error: `ZIP 解析失败: ${err.message}` };
    }
  }

  /**
   * 打开系统对话框选择本地 ZIP 文件并导入
   */
  public async importSkillZipFromDialog(
    parentWin?: BrowserWindow
  ): Promise<{ skills: AiSkillItem[]; error?: string; canceled?: boolean }> {
    const res = await dialog.showOpenDialog(parentWin || BrowserWindow.getFocusedWindow() || undefined, {
      title: '导入 Skill 技能包 (.zip)',
      filters: [{ name: 'ZIP 技能包', extensions: ['zip'] }],
      properties: ['openFile'],
    });

    if (res.canceled || res.filePaths.length === 0) {
      return { skills: [], canceled: true };
    }

    const filePath = res.filePaths[0];
    const buffer = fs.readFileSync(filePath);
    return this.parseSkillZipBuffer(buffer, path.basename(filePath));
  }

  /**
   * 将选定的个人技能导出为标准 ZIP 技能包
   */
  public async exportSkillZip(
    skillsToExport: AiSkillItem[],
    parentWin?: BrowserWindow
  ): Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }> {
    // 强制安全过滤：绝不允许导出系统内置受保护技能
    const personalOnly = skillsToExport.filter((s) => s.category === 'personal');
    if (personalOnly.length === 0) {
      return { success: false, error: '没有可导出的个人专属技能（系统内置技能受内核保护不可导出）' };
    }

    try {
      const zip = new JSZip();

      if (personalOnly.length === 1) {
        // 单个技能导出
        const skill = personalOnly[0];
        const frontmatter = `---
name: ${skill.name}
description: ${skill.description}
triggers: ${JSON.stringify(skill.triggerKeywords || [])}
version: 1.0.0
exportedAt: ${new Date().toISOString()}
---

${skill.systemInstruction || ''}
`;
        zip.file('SKILL.md', frontmatter);
        zip.file(
          'skill.json',
          JSON.stringify(
            {
              id: skill.id,
              name: skill.name,
              description: skill.description,
              triggerKeywords: skill.triggerKeywords,
              systemInstruction: skill.systemInstruction,
              createdAt: skill.createdAt,
            },
            null,
            2
          )
        );
        zip.file(
          'README.md',
          `# ${skill.name} (NeoCRM 技能包)\n\n${skill.description}\n\n该技能包支持在 NeoCRM 开发者桌面工作台中一键导入并在 AI 对话中挂载使用。`
        );
      } else {
        // 批量导出多个个人技能
        for (const skill of personalOnly) {
          const folderName = skill.name.replace(/[/\\?%*:|"<>]/g, '_');
          const folder = zip.folder(folderName);
          if (folder) {
            const frontmatter = `---
name: ${skill.name}
description: ${skill.description}
triggers: ${JSON.stringify(skill.triggerKeywords || [])}
---

${skill.systemInstruction || ''}
`;
            folder.file('SKILL.md', frontmatter);
            folder.file('skill.json', JSON.stringify(skill, null, 2));
          }
        }

        zip.file(
          'skills.json',
          JSON.stringify(
            personalOnly.map((s) => ({
              name: s.name,
              description: s.description,
              triggerKeywords: s.triggerKeywords,
              systemInstruction: s.systemInstruction,
            })),
            null,
            2
          )
        );
        zip.file(
          'README.md',
          `# NeoCRM 个人专属技能集合包\n\n包含 ${personalOnly.length} 个自定义业务技能。\n可在 NeoCRM 开发者工作台一键解压并导入使用。`
        );
      }

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const defaultFileName =
        personalOnly.length === 1
          ? `${personalOnly[0].name.replace(/[/\\?%*:|"<>]/g, '_')}_skill.zip`
          : `NeoCRM_Personal_Skills_${Date.now()}.zip`;

      const saveRes = await dialog.showSaveDialog(parentWin || BrowserWindow.getFocusedWindow() || undefined, {
        title: '导出 Skill 技能包',
        defaultPath: defaultFileName,
        filters: [{ name: 'ZIP 技能包', extensions: ['zip'] }],
      });

      if (saveRes.canceled || !saveRes.filePath) {
        return { success: false, canceled: true };
      }

      fs.writeFileSync(saveRes.filePath, zipBuffer);

      try {
        shell.showItemInFolder(saveRes.filePath);
      } catch {}

      return { success: true, filePath: saveRes.filePath };
    } catch (e: any) {
      console.error('导出 ZIP 技能包失败:', e);
      return { success: false, error: `导出失败: ${e.message}` };
    }
  }
}

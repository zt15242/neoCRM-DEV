import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { formatMeetingMarkdown } from '../../shared/meetingMarkdown';
import type { MeetingRecord } from '../../shared/meetingTypes';

export async function saveMeetingDocument(
  meeting: MeetingRecord,
  downloadsDirectory: string,
  choosePath: (options: { title: string; defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>,
): Promise<{ canceled: boolean; filePath?: string }> {
  const safeTitle = meeting.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || '会议纪要';
  const name = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safeTitle) ? `会议_${safeTitle}` : safeTitle;
  const result = await choosePath({
    title: '保存会议纪要', defaultPath: path.join(downloadsDirectory, `${name}.md`),
    filters: [{ name: 'Markdown 会议纪要', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await writeFile(result.filePath, formatMeetingMarkdown(meeting), 'utf8');
  return { canceled: false, filePath: result.filePath };
}

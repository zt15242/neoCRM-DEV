import type { AiChatSession } from '../../../shared/types';

export function pendingQuestion(session: AiChatSession) {
  const messages = session.messages || [];
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return undefined;
  const call = last.toolCalls?.findLast(item => item.name === 'ask_user_question' && item.status === 'success');
  if (!call) return undefined;
  const args = call.arguments || {};
  const questions = Array.isArray(args.questions) && args.questions.length ? args.questions : [args];
  const fields = questions.flatMap((question: any, index: number) => {
    if (typeof question?.question !== 'string' || !question.question.trim()) return [];
    const options = (Array.isArray(question.options) ? question.options : []).flatMap((option: any) => {
      const label = typeof option === 'string' ? option : option?.label;
      if (typeof label !== 'string' || !label.trim()) return [];
      return [{ value: label, label, ...(typeof option?.description === 'string' ? { description: option.description } : {}) }];
    });
    return [{ key: typeof question.id === 'string' && question.id ? question.id : `question_${index + 1}`,
      type: question.multi_select && options.length ? 'multiselect' : 'string', title: question.header || `问题 ${index + 1}`,
      description: question.question, options, custom: args.allow_custom !== false }];
  });
  if (!fields.length) return undefined;
  return { id: `frm_${encodeURIComponent(call.id)}`, sessionID: session.id.startsWith('sess_') ? `ses_${session.id.slice(5)}` : session.id,
    title: typeof args.header === 'string' ? args.header : '请确认', metadata: { kind: 'question' }, fields };
}

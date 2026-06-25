interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  equations?: any[];
  tables?: any[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function exportAsText(messages: ChatMessage[], title: string): void {
  const lines = [`Chat Export: ${title}`, `Date: ${new Date().toLocaleString()}`, ''];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'You' : 'AI';
    const content = typeof msg.content === 'string' ? stripMarkdown(msg.content) : String(msg.content);
    lines.push(`[${role}]`);
    lines.push(content);
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(title)}_chat.txt`);
}

export function exportAsMarkdown(messages: ChatMessage[], title: string): void {
  const lines = [`# Chat Export: ${title}`, `*${new Date().toLocaleString()}*`, ''];

  for (const msg of messages) {
    const role = msg.role === 'user' ? '**You**' : '**AI**';
    const content = typeof msg.content === 'string' ? msg.content : String(msg.content);
    lines.push(`### ${role}`);
    lines.push(content);

    if (msg.tables?.length) {
      for (const table of msg.tables) {
        if (table.markdown) {
          lines.push('', table.markdown);
        }
      }
    }

    if (msg.equations?.length) {
      for (const eq of msg.equations) {
        const latex = eq.normalized_latex || eq.latex || '';
        if (latex) lines.push('', `$$${latex}$$`);
      }
    }

    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(title)}_chat.md`);
}

export function exportAsHTML(messages: ChatMessage[], title: string): void {
  const rows = messages.map((msg) => {
    const role = msg.role === 'user' ? 'You' : 'AI';
    const bg = msg.role === 'user' ? '#f5f5f4' : '#ffffff';
    const content = typeof msg.content === 'string' ? msg.content.replace(/\n/g, '<br>') : String(msg.content);
    return `<div style="padding:12px 16px;margin:8px 0;border-radius:12px;background:${bg};border:1px solid #e7e5e4"><strong>${role}</strong><div style="margin-top:6px">${content}</div></div>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1c1917}h1{font-size:1.25rem}</style></head><body><h1>${title}</h1><p style="color:#78716c;font-size:0.875rem">${new Date().toLocaleString()}</p>${rows}</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(title)}_chat.html`);
}

export function exportAsPDF(messages: ChatMessage[], title: string): void {
  const html = buildStyledHTML(messages, title);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}

export function exportAsWord(messages: ChatMessage[], title: string): void {
  const html = buildStyledHTML(messages, title);
  const wordDoc = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
    <style>
      body { font-family: Calibri, sans-serif; font-size: 11pt; color: #1c1917; max-width: 700px; margin: 0 auto; }
      h1 { font-size: 16pt; margin-bottom: 4pt; }
      .msg { padding: 8pt 12pt; margin: 6pt 0; border-radius: 8pt; border: 1px solid #e7e5e4; }
      .user { background: #f5f5f4; }
      .ai { background: #ffffff; }
      .role { font-weight: bold; margin-bottom: 4pt; }
      table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
      th, td { border: 1px solid #d6d3d1; padding: 4pt 8pt; text-align: left; font-size: 10pt; }
      th { background: #f5f5f4; font-weight: bold; }
    </style></head><body>${buildMessageRows(messages, title)}</body></html>`;

  const blob = new Blob([wordDoc], { type: 'application/msword' });
  downloadBlob(blob, `${sanitizeFilename(title)}_chat.doc`);
}

function buildStyledHTML(messages: ChatMessage[], title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body { font-family: -apple-system, system-ui, 'Segoe UI', sans-serif; max-width: 750px; margin: 40px auto; padding: 0 24px; color: #1c1917; font-size: 14px; line-height: 1.6; }
      h1 { font-size: 1.25rem; margin-bottom: 2px; }
      .meta { color: #78716c; font-size: 0.8rem; margin-bottom: 24px; }
      .msg { padding: 12px 16px; margin: 8px 0; border-radius: 12px; border: 1px solid #e7e5e4; }
      .user { background: #f5f5f4; }
      .ai { background: #ffffff; }
      .role { font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; }
      table { border-collapse: collapse; width: 100%; margin: 8px 0; }
      th, td { border: 1px solid #d6d3d1; padding: 6px 10px; text-align: left; font-size: 0.85rem; }
      th { background: #f5f5f4; font-weight: 600; }
      @media print { body { margin: 0; } .msg { break-inside: avoid; } }
    </style></head><body>${buildMessageRows(messages, title)}</body></html>`;
}

function buildMessageRows(messages: ChatMessage[], title: string): string {
  let html = `<h1>${title}</h1><p class="meta">${new Date().toLocaleString()}</p>`;
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'You' : 'AI';
    const cls = msg.role === 'user' ? 'user' : 'ai';
    let content = typeof msg.content === 'string' ? msg.content : String(msg.content);

    // Convert markdown tables to HTML tables
    content = markdownTablesToHTML(content);
    // Convert basic markdown formatting
    content = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\n/g, '<br>');

    html += `<div class="msg ${cls}"><div class="role">${role}</div><div>${content}</div></div>`;
  }
  return html;
}

function markdownTablesToHTML(text: string): string {
  const lines = text.split('\n');
  let result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    // Detect markdown table: line with |, next line is separator
    if (lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1].trim())) {
      const headerCells = lines[i].trim().split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`);
      let tableHTML = `<table><thead><tr>${headerCells.join('')}</tr></thead><tbody>`;
      i += 2; // skip header and separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`);
        tableHTML += `<tr>${cells.join('')}</tr>`;
        i++;
      }
      tableHTML += '</tbody></table>';
      result.push(tableHTML);
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join('\n');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').slice(0, 50);
}

import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import JSZip from 'jszip';
import { decodeText, extractScriptText, normalizeScriptText, UPLOAD_MAX_BYTES } from './script-file.js';

const file = (name: string, buffer: Buffer) => ({
  buffer,
  size: buffer.length,
  // multer처럼 UTF-8 파일명을 latin1로 넘긴다
  originalname: Buffer.from(name, 'utf8').toString('latin1'),
});

/** 최소 구성의 .docx 파일 */
async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** 텍스트 한 줄짜리 최소 PDF */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

describe('대본 파일 추출', () => {
  it('UTF-8 텍스트와 한글 파일명', async () => {
    const r = await extractScriptText(file('마지막 열차.txt', Buffer.from('﻿S#1. 승강장\r\n\r\n\r\n\r\n정수: 온다.  \r\n')));
    expect(r.suggestedTitle).toBe('마지막 열차');
    expect(r.text).toBe('S#1. 승강장\n\n정수: 온다.');
  });

  it('EUC-KR 텍스트도 읽는다', () => {
    const euckr = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]); // "한글"
    expect(decodeText(euckr)).toBe('한글');
  });

  it('docx', async () => {
    const r = await extractScriptText(file('draft.docx', await makeDocx(['S#1. 옥상', '미란: 한 그릇만.'])));
    expect(r.text).toContain('S#1. 옥상');
    expect(r.text).toContain('미란: 한 그릇만.');
  });

  it('pdf', async () => {
    const r = await extractScriptText(file('scene.pdf', makePdf('INT. STATION - NIGHT')));
    expect(r.text).toContain('INT. STATION - NIGHT');
  });

  it('지원하지 않는 형식, 빈 파일, 큰 파일, 깨진 파일은 거부', async () => {
    await expect(extractScriptText(file('a.hwp', Buffer.from('x')))).rejects.toThrow(BadRequestException);
    await expect(extractScriptText(file('a.txt', Buffer.from('  \n ')))).rejects.toThrow(BadRequestException);
    await expect(extractScriptText({ ...file('a.txt', Buffer.from('x')), size: UPLOAD_MAX_BYTES + 1 })).rejects.toThrow(PayloadTooLargeException);
    await expect(extractScriptText(file('a.docx', Buffer.from('not a zip')))).rejects.toThrow(BadRequestException);
  });

  it('정규화', () => {
    expect(normalizeScriptText('a\r\nb\rc\n\n\n\nd')).toBe('a\nb\nc\n\nd');
  });
});

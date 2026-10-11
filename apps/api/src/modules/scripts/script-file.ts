import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { extname } from 'node:path';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { FULL_TEXT_MAX } from './dto/script.dto.js';

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_EXTENSIONS = ['.txt', '.md', '.fountain', '.docx', '.pdf'] as const;

export interface ExtractedScript {
  text: string;
  /** 파일 이름에서 확장자를 뺀 것. 새 대본의 제목 기본값 */
  suggestedTitle: string;
}

/** 텍스트 파일은 UTF-8을 먼저 시도하고, 깨지면 EUC-KR(옛 한글 텍스트)로 읽는다 */
export function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('euc-kr').decode(buffer);
  }
}

/** 줄바꿈 통일, 줄 끝 공백 제거, 3줄 이상 빈 줄은 2줄로 */
export function normalizeScriptText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractScriptText(file: {
  buffer: Buffer;
  originalname: string;
  size: number;
}): Promise<ExtractedScript> {
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new PayloadTooLargeException(`파일은 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다`);
  }
  // multer는 파일명을 latin1로 넘기므로 UTF-8로 되돌린다 (한글 파일명)
  const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const ext = extname(filename).toLowerCase();
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new BadRequestException(`지원하는 형식: ${UPLOAD_EXTENSIONS.join(', ')} (한글 .hwp는 .docx나 .pdf로 저장해 올려주세요)`);
  }

  let raw: string;
  try {
    if (ext === '.docx') {
      raw = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    } else if (ext === '.pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
      raw = (await extractText(pdf, { mergePages: true })).text;
    } else {
      raw = decodeText(file.buffer);
    }
  } catch {
    throw new BadRequestException('파일을 읽을 수 없습니다. 손상되었거나 암호가 걸린 파일인지 확인하세요');
  }

  const text = normalizeScriptText(raw);
  if (!text) throw new BadRequestException('파일에서 본문을 찾지 못했습니다 (스캔 이미지 PDF는 지원하지 않습니다)');
  if (text.length > FULL_TEXT_MAX) {
    throw new BadRequestException(`본문이 너무 깁니다 (최대 ${FULL_TEXT_MAX.toLocaleString()}자)`);
  }
  return { text, suggestedTitle: filename.slice(0, filename.length - ext.length).trim().slice(0, 120) || '제목 없음' };
}

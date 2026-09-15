/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  ALLOWED_ATTACHMENT_TYPES,
  INLINE_ATTACHMENT_TYPES,
  sanitizeAttachmentName,
  sniffAttachmentMime,
} from '../../../lib/services/listings/attachmentTypes.js';

const PDF = Buffer.from('%PDF-1.7\nstuff');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

/**
 * These two functions are the whole trust boundary for uploads. Everything downstream - the type
 * stored in the row, the type sent back with the bytes, the name put in a response header - takes
 * their word for it, so their word has to be earned from the bytes rather than from the client.
 */
describe('attachment types', () => {
  describe('sniffAttachmentMime', () => {
    it('recognises the three allowed types', () => {
      expect(sniffAttachmentMime(PDF)).toBe('application/pdf');
      expect(sniffAttachmentMime(JPEG)).toBe('image/jpeg');
      expect(sniffAttachmentMime(PNG)).toBe('image/png');
    });

    it('only ever returns a type the feature allows', () => {
      for (const buffer of [PDF, JPEG, PNG]) {
        expect(Object.keys(ALLOWED_ATTACHMENT_TYPES)).toContain(sniffAttachmentMime(buffer));
      }
    });

    it('refuses anything else, whatever it was called', () => {
      // An executable, a zip, and an HTML page - the last is the one that would matter, since these
      // files are served back from Fredy's own origin.
      expect(sniffAttachmentMime(Buffer.from('MZ\u0090\u0000'))).toBeNull();
      expect(sniffAttachmentMime(Buffer.from('PK\u0003\u0004'))).toBeNull();
      expect(sniffAttachmentMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
      expect(sniffAttachmentMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />'))).toBeNull();
    });

    it('refuses an empty body and a non-buffer', () => {
      expect(sniffAttachmentMime(Buffer.alloc(0))).toBeNull();
      expect(sniffAttachmentMime(null)).toBeNull();
      expect(sniffAttachmentMime('%PDF-1.7')).toBeNull();
    });

    it('refuses a file too short to carry the signature it claims', () => {
      expect(sniffAttachmentMime(Buffer.from([0x89, 0x50]))).toBeNull();
      expect(sniffAttachmentMime(Buffer.from('%PD'))).toBeNull();
    });

    it('serves images inline and PDFs as a download', () => {
      expect(INLINE_ATTACHMENT_TYPES.has('image/jpeg')).toBe(true);
      expect(INLINE_ATTACHMENT_TYPES.has('image/png')).toBe(true);
      expect(INLINE_ATTACHMENT_TYPES.has('application/pdf')).toBe(false);
    });
  });

  describe('sanitizeAttachmentName', () => {
    it('keeps an ordinary name as it is', () => {
      expect(sanitizeAttachmentName('Expose Musterstraße 4.pdf', 'application/pdf')).toBe('Expose Musterstraße 4.pdf');
    });

    it('strips the characters that would break the response header', () => {
      const injected = `expose${CR}${LF}X-Evil: yes.pdf`;
      expect(sanitizeAttachmentName(injected, 'application/pdf')).toBe('exposeX-Evil: yes.pdf');
      expect(sanitizeAttachmentName(`a${NUL}b.png`, 'image/png')).toBe('ab.png');
    });

    it('flattens anything that looks like a path', () => {
      expect(sanitizeAttachmentName('../../etc/passwd', 'application/pdf')).toBe('.._.._etc_passwd');
      expect(sanitizeAttachmentName('C:\\Users\\me\\plan.png', 'image/png')).toBe('C:_Users_me_plan.png');
    });

    it('invents a name when nothing usable is left', () => {
      expect(sanitizeAttachmentName('', 'application/pdf')).toBe('document.pdf');
      expect(sanitizeAttachmentName('   ', 'image/jpeg')).toBe('document.jpg');
      expect(sanitizeAttachmentName('..', 'image/png')).toBe('document.png');
      expect(sanitizeAttachmentName('.', 'image/png')).toBe('document.png');
      expect(sanitizeAttachmentName(undefined, 'image/png')).toBe('document.png');
      expect(sanitizeAttachmentName(42, 'application/pdf')).toBe('document.pdf');
    });

    it('caps the length', () => {
      const long = `${'a'.repeat(400)}.pdf`;
      expect(sanitizeAttachmentName(long, 'application/pdf')).toHaveLength(255);
    });
  });
});

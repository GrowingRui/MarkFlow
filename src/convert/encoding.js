// Decodes text files that may not be UTF-8, such as a CSV saved by Excel in Chinese (GBK) or
// Japanese (Shift-JIS), or an older web page.
import chardet from 'chardet';

const CJK = ['shift_jis', 'gb18030', 'euc-kr', 'big5'];
// Han, kana, hangul and full-width forms.
const CJK_CHAR = /[\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/g;

const tryDecode = (bytes, label) => {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * @param {Uint8Array} bytes
 * @param {string} [declared] an encoding the file names for itself, such as an HTML page's <meta charset>
 */
export function decodeText(bytes, declared) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // An encoding the browser doesn't know: detect it instead.
    }
  }
  const utf8 = tryDecode(bytes, 'utf-8');
  if (utf8 !== null) return utf8;
  // A confident guess for a multi-byte encoding is usually right.
  const [guess] = chardet.analyse(bytes);
  if (guess && guess.confidence >= 50 && /GB|Big5|EUC|Shift_JIS/i.test(guess.name)) {
    const text = tryDecode(bytes, guess.name);
    if (text !== null) return text;
  }
  // Short files give too little to go on, so try the common East Asian encodings in turn and take the
  // first that decodes without errors into text that is mostly East Asian characters.
  const high = bytes.filter(b => b >= 0x80).length;
  for (const label of CJK) {
    const text = tryDecode(bytes, label);
    const nonAscii = text?.replace(/[\x00-\x7f]/g, '').length ?? 0;
    if (text !== null && nonAscii && (text.match(CJK_CHAR)?.length ?? 0) >= nonAscii * 0.8 && nonAscii <= high / 1.5) return text;
  }
  // Otherwise a Western single-byte encoding; Windows-1252 is a superset of Latin-1.
  const single = guess && !/UTF|GB|Big5|EUC|Shift_JIS|ISO-2022/i.test(guess.name) ? guess.name.replace(/^ISO-8859-1$/, 'windows-1252') : 'windows-1252';
  return tryDecode(bytes, single) ?? new TextDecoder('windows-1252').decode(bytes);
}

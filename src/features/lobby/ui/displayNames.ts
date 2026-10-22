/** 註冊表名稱多為「中文 (English)」或「中文 English」，大廳要把兩者分開排版 */
export function splitDisplayName(name: string): { zh: string; en: string } {
  const paren = name.match(/^(.*?)\s*\((.*)\)\s*$/)
  if (paren) return { zh: paren[1], en: paren[2] }
  const [zh, ...rest] = name.split(' ')
  return { zh, en: rest.join(' ') }
}

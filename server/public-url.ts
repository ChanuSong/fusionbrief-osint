import { isIP } from 'node:net';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a.startsWith('::ffff:')) return publicAddress(a.slice(7));
    return !(/^::|^f[cd]|^fe[89ab]|^ff|^2001:db8/.test(a));
  }
  return false;
}

export function publicURL(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('공개 HTTPS URL만 수집할 수 있습니다.');
  if (isIP(url.hostname.replace(/[\[\]]/g, '')) && !publicAddress(url.hostname.replace(/[\[\]]/g, '')))
    throw new Error('사설 주소는 수집할 수 없습니다.');
  url.hash = '';
  return url;
}

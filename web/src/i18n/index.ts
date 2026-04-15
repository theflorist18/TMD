import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18N } from './resources';

const STORAGE_KEY = 'tmd_lang';

function flatten(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (typeof v === 'string' || typeof v === 'number') {
      out[key] = String(v);
    }
  }
  return out;
}

const enFlat = flatten(I18N.en as unknown as Record<string, unknown>);
const idFlat = flatten(I18N.id as unknown as Record<string, unknown>);

const saved = localStorage.getItem(STORAGE_KEY);
const lng = saved === 'id' ? 'id' : 'en';

void i18n.use(initReactI18next).init({
  lng,
  fallbackLng: 'en',
  resources: {
    en: { translation: enFlat },
    id: { translation: idFlat },
  },
  interpolation: { escapeValue: false },
});

export function setAppLanguage(lang: 'en' | 'id') {
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export { i18n };

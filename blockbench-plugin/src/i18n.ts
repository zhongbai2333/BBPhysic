/**
 * i18n glue code for BBPhysic.
 *
 * Keep translation tables in data-only modules so this file stays focused on
 * registration and safe access wrappers.
 */

import { EN_TRANSLATIONS } from './i18n/en';
import { ZH_TRANSLATIONS } from './i18n/zh';

type TLVars = string | number | (string | number)[];

export function t(key: string, fallback: string, vars?: TLVars): string {
  try {
    return tl(key, vars as any, fallback);
  } catch {
    return fallback;
  }
}

export function registerBBPhysicTranslations() {
  const en = EN_TRANSLATIONS;
  const zh = ZH_TRANSLATIONS;

  try {
    Language.addTranslations('en', en);
    Language.addTranslations('zh', zh);
    Language.addTranslations('zh_tw', zh);
    translateUI();
  } catch {
    // ignore
  }
}

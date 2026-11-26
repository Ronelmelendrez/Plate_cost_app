import i18nextInstance from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';

// i18next exposes plugin registration through its default singleton.
// eslint-disable-next-line import/no-named-as-default-member
void i18nextInstance.use(initReactI18next).init({
  fallbackLng: 'en',
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18nextInstance;

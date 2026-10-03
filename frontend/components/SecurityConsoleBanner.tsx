'use client';

import { useEffect } from 'react';

/**
 * Emite aviso proativo de segurança contra ataques de engenharia social (Self-XSS)
 * no console do navegador, seguindo o padrão de mitigação do Discord e Facebook.
 */
export function SecurityConsoleBanner() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log(
      '%cPARE!',
      'color: #ef4444; font-size: 48px; font-weight: 900;'
    );
    console.log(
      '%cEste é um recurso do navegador voltado exclusivamente para desenvolvedores. Se alguém instruiu você a copiar e colar qualquer código aqui, trata-se de um golpe (Self-XSS) com o intuito de comprometer o seu acesso ou canal de transmissão.',
      'color: #f4f4f5; font-size: 14px; font-weight: 500; line-height: 1.5;'
    );
    console.log(
      '%cPara sua segurança, nunca compartilhe ou execute scripts de terceiros no console.',
      'color: #38bdf8; font-size: 12px; font-weight: 600;'
    );
  }, []);

  return null;
}

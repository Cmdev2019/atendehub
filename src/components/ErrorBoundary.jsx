import { Component, createElement as h } from 'react';
import { Icon } from './icons';

const e = h;

// B-12: sem isso, uma exceção de render em qualquer componente (ex.: campo
// inesperado num payload do backend) derrubava a SPA inteira pra tela
// branca, sem nenhum log específico do incidente nem forma de o usuário se
// recuperar sem saber que precisa dar F5. Error Boundary é o único jeito do
// React de capturar isso — não existe hook equivalente, precisa ser classe.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Nunca logar dados do usuário aqui — só a mensagem/stack do erro em si
    // (mesma convenção de higiene de logs do resto do projeto, F6-4/B5-4).
    console.error('❌ Erro não tratado na interface:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return e(
      'div',
      { className: 'error-boundary', role: 'alert' },
      e(Icon, { name: 'warning', size: 40 }),
      e('h1', null, 'Algo deu errado'),
      e(
        'p',
        null,
        'A tela encontrou um erro inesperado e não pode continuar. Recarregar a página deve resolver.',
      ),
      e(
        'button',
        {
          type: 'button',
          className: 'primary-button',
          // onReload injetável (default = recarregar de verdade) — jsdom não
          // deixa mockar window.location.reload em teste (propriedade
          // read-only), então o componente aceita a função por fora.
          onClick: () => (this.props.onReload || (() => window.location.reload()))(),
        },
        'Recarregar página',
      ),
    );
  }
}

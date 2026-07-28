# Logo AtendeHub - Guia de Uso

## 📐 Conceito

A logo do AtendeHub representa:
- **Bolha de Chat**: Comunicação e atendimento ao cliente
- **Dots Centrais**: Hub de conexão (omnichannel)
- **Gradient Teal**: Modernidade, confiança e profissionalismo
- **Cores**: Do gradiente teal (#0f766e → #14b8a6)

## 🎨 Variações

### Logo Completa (com texto)
- Arquivo: `src/components/Logo.jsx`
- Componente React reutilizável
- Tamanho responsivo

### Logo Marca (ícone apenas)
- Arquivo: `public/logo.svg`
- SVG puro, sem dependências
- Escalável para qualquer tamanho

## 📏 Tamanhos Recomendados

| Uso | Tamanho | Arquivo |
|-----|---------|---------|
| Favicon | 16-32px | logo.svg |
| Topbar | 36px | Component |
| Login | 64px | Component |
| Menu Mobile | 24px | Component |
| Impressão | 256px+ | logo.svg |

## 🎯 Cores Primárias

```css
Primary: #0f766e (Teal escuro)
Secondary: #14b8a6 (Teal claro)
Accent: #06b6d4 (Cyan)
Text: #ffffff (Branco)
```

## ✅ Usos Corretos

✅ Logo em fundos claros e escuros (ajusta automaticamente)
✅ Usar em tamanhos múltiplos de 4px para pixel-perfect
✅ Manter espaçamento mínimo de 16px ao redor
✅ Componente React ajusta tamanho via prop `size`

## ❌ Usos Incorretos

❌ Distorcer proporções
❌ Mudar cores do gradiente
❌ Usar em fondos que não contrastem
❌ Reduzir abaixo de 16px (perda de detalhe)

## 📦 Arquivos

- **src/components/Logo.jsx** - Componente React
- **public/logo.svg** - SVG estático
- **LOGO_GUIDELINES.md** - Este guia

## 🔧 Como Usar

### Como Componente React
```jsx
import { Logo } from './components/Logo';

// Tamanho padrão (40px)
<Logo />

// Tamanho customizado
<Logo size={64} />

// Com classe CSS
<Logo size={36} className="my-class" />
```

### Como SVG direto
```html
<img src="/logo.svg" alt="AtendeHub" width="40" height="40" />
```

## 📝 Nota

A logo foi projetada com foco em:
- Clareza em múltiplos tamanhos
- Legibilidade em temas claro/escuro
- Modernidade e profissionalismo
- Representação do conceito de omnichannel

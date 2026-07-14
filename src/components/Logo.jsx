import { createElement as h } from 'react';

export function Logo({ size = 40, className = '' }) {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 100 100',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      className: `logo ${className}`,
    },
    // Background circle
    h('circle', {
      cx: '50',
      cy: '50',
      r: '48',
      fill: 'url(#gradientBg)',
    }),

    // Main chat bubble shape
    h('path', {
      d: 'M 25 35 L 75 35 Q 80 35 80 40 L 80 60 Q 80 65 75 65 L 35 65 L 28 73 Q 26 75 24 72 L 26 65 Q 20 65 20 60 L 20 40 Q 20 35 25 35 Z',
      fill: 'white',
    }),

    // Center dot (connection)
    h('circle', {
      cx: '50',
      cy: '50',
      r: '4',
      fill: 'url(#gradientDot)',
    }),

    // Small dots (communication)
    h('circle', {
      cx: '38',
      cy: '48',
      r: '2',
      fill: 'url(#gradientDot)',
      opacity: '0.6',
    }),
    h('circle', {
      cx: '50',
      cy: '48',
      r: '2',
      fill: 'url(#gradientDot)',
      opacity: '0.6',
    }),
    h('circle', {
      cx: '62',
      cy: '48',
      r: '2',
      fill: 'url(#gradientDot)',
      opacity: '0.6',
    }),

    // Gradients
    h('defs', null,
      h(
        'linearGradient',
        { id: 'gradientBg', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
        h('stop', { offset: '0%', stopColor: '#0f766e' }),
        h('stop', { offset: '100%', stopColor: '#14b8a6' }),
      ),
      h(
        'linearGradient',
        { id: 'gradientDot', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
        h('stop', { offset: '0%', stopColor: '#06b6d4' }),
        h('stop', { offset: '100%', stopColor: '#10b981' }),
      ),
    ),
  );
}

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    // B-86: o cliente do Prisma, gerado em src/generated
    '!generated/**',
  ],
  coverageDirectory: '../coverage',
  // M-22/B-63: piso de cobertura dos testes unitários, um pouco abaixo do
  // medido em 2026-10-17 (56,6% statements / 61,2% branches / 56,1% funções /
  // 57,2% linhas). Não é meta, é catraca: impede regressão. Subir junto
  // quando a cobertura real subir.
  coverageThreshold: {
    global: { statements: 55, branches: 60, functions: 55, lines: 56 },
  },
  testEnvironment: 'node',
  roots: ['<rootDir>', '<rootDir>/../test'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
  },
};

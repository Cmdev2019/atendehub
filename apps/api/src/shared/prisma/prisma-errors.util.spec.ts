import { Prisma } from '@prisma/client';
import { isUniqueConstraintViolation } from './prisma-errors.util';

describe('isUniqueConstraintViolation', () => {
  it('reconhece P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    expect(isUniqueConstraintViolation(err)).toBe(true);
  });

  it('rejeita outro código do Prisma (ex.: P2025 — registro não encontrado)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.22.0',
    });
    expect(isUniqueConstraintViolation(err)).toBe(false);
  });

  it('rejeita erro genérico (não é do Prisma)', () => {
    expect(isUniqueConstraintViolation(new Error('conexão caiu'))).toBe(false);
  });

  it('rejeita valores não-Error (string, undefined, null)', () => {
    expect(isUniqueConstraintViolation('erro string')).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
  });
});

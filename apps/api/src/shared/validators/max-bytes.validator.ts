import { registerDecorator, ValidationOptions } from 'class-validator';

// B-96 (L-07): o bcrypt só considera os primeiros 72 bytes da senha — o que
// vem depois é ignorado sem aviso. Conta em bytes (UTF-8), não em caracteres:
// acento ocupa 2 bytes.
export const BCRYPT_MAX_BYTES = 72;

export function MaxBytes(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'maxBytes',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: { message: `Senha muito longa (máximo de ${max} bytes)`, ...options },
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') <= max,
      },
    });
}

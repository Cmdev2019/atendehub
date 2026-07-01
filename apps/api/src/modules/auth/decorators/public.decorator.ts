import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Uso: @Public() — marca a rota como pública (sem autenticação)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

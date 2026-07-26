import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  // Sem 'format' (ou 'json'): resposta JSON pra tabela na tela. 'csv'/'pdf':
  // resposta vira arquivo pra download (Content-Disposition: attachment).
  @IsOptional()
  @IsIn(['json', 'csv', 'pdf'])
  format?: 'json' | 'csv' | 'pdf';
}

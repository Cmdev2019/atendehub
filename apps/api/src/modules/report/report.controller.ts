import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReportService } from './report.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { sendCsv, sendPdf } from './report-export.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // GET /api/v1/reports/attendance?from=&to=&format=json|csv|pdf
  @Get('attendance')
  async getAttendance(
    @CurrentUser() user: AuthUserDto,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportService.getAttendanceReport(user.companyId, query.from, query.to);
    this.respond(res, query.format, {
      baseName: 'relatorio-base-de-atendimento',
      title: 'Base de atendimento',
      period: result.period,
      jsonBody: result,
      exportRows: this.reportService.toAttendanceExportRows(result.rows),
    });
  }

  // GET /api/v1/reports/by-tag?from=&to=&format=json|csv|pdf
  @Get('by-tag')
  async getByTag(
    @CurrentUser() user: AuthUserDto,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportService.getByTagReport(user.companyId, query.from, query.to);
    this.respond(res, query.format, {
      baseName: 'relatorio-por-tipo-de-atendimento',
      title: 'Por tipo de atendimento',
      period: result.period,
      jsonBody: result,
      exportRows: this.reportService.toByTagExportRows(result.rows),
    });
  }

  // GET /api/v1/reports/by-agent?from=&to=&format=json|csv|pdf
  @Get('by-agent')
  async getByAgent(
    @CurrentUser() user: AuthUserDto,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportService.getByAgentReport(user.companyId, query.from, query.to);
    this.respond(res, query.format, {
      baseName: 'relatorio-por-atendente',
      title: 'Por atendente',
      period: result.period,
      jsonBody: result,
      exportRows: this.reportService.toByAgentExportRows(result.rows),
    });
  }

  // Formato de resposta compartilhado pelos 3 relatórios: sem 'format' (ou
  // 'json') devolve o JSON de sempre pra tabela na tela; 'csv'/'pdf' vira
  // arquivo pra download.
  private respond(
    res: Response,
    format: ReportQueryDto['format'],
    args: {
      baseName: string;
      title: string;
      period: { from: Date; to: Date };
      jsonBody: unknown;
      exportRows: ReturnType<typeof this.reportService.toAttendanceExportRows>;
    },
  ) {
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      sendCsv(res, `${args.baseName}-${dateStamp}.csv`, args.exportRows);
      return;
    }
    if (format === 'pdf') {
      sendPdf(
        res,
        `${args.baseName}-${dateStamp}.pdf`,
        args.title,
        this.reportService.periodLabel(args.period),
        args.exportRows,
      );
      return;
    }
    res.json(args.jsonBody);
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { AutoAttendanceController } from './auto-attendance.controller';
import { AutoAttendanceService } from './auto-attendance.service';

const mockService = {
  getFlow: jest.fn(),
  updateFlow: jest.fn(),
  listMenuOptions: jest.fn(),
  createMenuOption: jest.fn(),
  updateMenuOption: jest.fn(),
  removeMenuOption: jest.fn(),
  reorderMenuOptions: jest.fn(),
};

describe('AutoAttendanceController', () => {
  let controller: AutoAttendanceController;
  const user = { companyId: 'company-1', id: 'user-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutoAttendanceController],
      providers: [{ provide: AutoAttendanceService, useValue: mockService }],
    }).compile();

    controller = module.get<AutoAttendanceController>(AutoAttendanceController);
  });

  it('getFlow delega para o service com o companyId do usuário logado', async () => {
    mockService.getFlow.mockResolvedValueOnce({ id: 'flow-1' });

    await controller.getFlow(user);

    expect(mockService.getFlow).toHaveBeenCalledWith('company-1');
  });

  it('updateFlow repassa o dto', async () => {
    const dto = { isActive: true };
    await controller.updateFlow(user, dto as any);

    expect(mockService.updateFlow).toHaveBeenCalledWith('company-1', dto);
  });

  it('createOption repassa o dto', async () => {
    const dto = { order: 1, label: 'Suporte', action: 'END_CONVERSATION' };
    await controller.createOption(user, dto as any);

    expect(mockService.createMenuOption).toHaveBeenCalledWith('company-1', dto);
  });

  it('reorderOptions repassa a lista ordenada de ids', async () => {
    await controller.reorderOptions(user, { orderedIds: ['opt-2', 'opt-1'] });

    expect(mockService.reorderMenuOptions).toHaveBeenCalledWith('company-1', ['opt-2', 'opt-1']);
  });

  it('removeOption repassa o id da opção', async () => {
    mockService.removeMenuOption.mockResolvedValueOnce({ success: true });

    await controller.removeOption(user, 'opt-1');

    expect(mockService.removeMenuOption).toHaveBeenCalledWith('company-1', 'opt-1');
  });
});

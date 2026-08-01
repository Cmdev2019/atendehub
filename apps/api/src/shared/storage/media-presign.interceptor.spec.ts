import { of } from 'rxjs';
import { MediaPresignInterceptor } from './media-presign.interceptor';

describe('MediaPresignInterceptor (B-38)', () => {
  it('presigna o valor devolvido pelo handler antes de responder ao cliente', (done) => {
    const mockStorage = {
      presignDeep: jest.fn().mockResolvedValue({ url: 'https://signed.example/x?expiry=600' }),
    };
    const interceptor = new MediaPresignInterceptor(mockStorage as any);

    const context = {} as any;
    const next = { handle: () => of({ url: 'http://localhost:9000/atendehub-media/x' }) };

    interceptor.intercept(context, next).subscribe((result) => {
      expect(mockStorage.presignDeep).toHaveBeenCalledWith({
        url: 'http://localhost:9000/atendehub-media/x',
      });
      expect(result).toEqual({ url: 'https://signed.example/x?expiry=600' });
      done();
    });
  });
});

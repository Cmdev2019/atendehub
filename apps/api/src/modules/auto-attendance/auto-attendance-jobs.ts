import { JobOptions } from 'bull';

export interface BaseJob {
  companyId: string;
  conversationId: string;
  contactPhone: string;
  sessionName: string;
}

// B-78 (M-05): reações do robô a uma mensagem do cliente. Antes rodavam
// dentro do worker do webhook — cada envio à Evolution (até 15 s) segurava a
// fila de webhooks de todas as empresas. Agora o webhook só enfileira e o
// AutoAttendanceProcessor envia, em ordem (concorrência 1: a resposta "1" nunca passa na
// frente da saudação que ainda está sendo enviada).
export type AutoAttendanceJobData =
  | (BaseJob & { kind: 'greeting'; queueGreetingMsg: string | null })
  | (BaseJob & { kind: 'reply'; text: string })
  | (BaseJob & { kind: 'activity' });

// O id do job é o da mensagem do cliente que o motivou: reenfileirar num
// retry do webhook não duplica a reação. Uma tentativa só — a engine trata os
// próprios erros (o contato segue na fila normal sem a resposta do robô) e
// repetir um envio parcial mandaria mensagem duplicada ao cliente.
export const AUTO_ATTENDANCE_JOB_OPTIONS: JobOptions = {
  attempts: 1,
  removeOnComplete: 500,
  removeOnFail: 200,
};

export const autoAttendanceJobId = (messageId: string) => `auto:${messageId}`;

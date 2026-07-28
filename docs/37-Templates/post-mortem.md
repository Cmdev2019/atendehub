# Post-mortem — <título do incidente>

- **Data do incidente:** AAAA-MM-DD
- **Duração:** HH:MM até HH:MM (X h Y min)
- **Severidade:** S1 | S2 | S3
- **Autor:** <quem esteve de plantão>
- **Status:** Rascunho | Publicado

> **Este documento é sem culpa.** O objetivo é entender o sistema, não avaliar pessoas. Se um humano
> conseguiu causar o incidente, o sistema permitiu — é o sistema que precisa mudar.

## Resumo

Dois ou três parágrafos que alguém consegue ler em 30 segundos e entender o que houve.

## Impacto

- **Clientes afetados:** quantidade e identificação
- **Funcionalidade afetada:** o que parou de funcionar
- **Dados afetados:** houve perda? houve exposição?
- **Impacto financeiro / contratual:** violação de SLA?

## Linha do tempo

Em horário de Brasília. Registre **o que se sabia em cada momento**, não o que se sabe agora.

| Horário | Evento |
|---|---|
| 00:00 | |

## Causa raiz

Vá além do primeiro "por quê". Continue perguntando até chegar a algo estrutural.

## Detecção

- Como foi detectado? Por alerta ou por cliente?
- Quanto tempo entre o início e a detecção?
- **Se foi detectado por cliente, o alerta ausente é um item de ação.**

## Resolução

O que foi feito para restabelecer o serviço. Distinga mitigação de correção definitiva.

## O que funcionou bem

Não pule esta seção. Reconhecer o que funcionou evita destruí-lo na próxima refatoração.

## O que não funcionou

## Onde tivemos sorte

A seção mais valiosa. O que poderia ter sido muito pior e não foi por acaso?

## Itens de ação

| # | Ação | Tipo | Responsável | Prazo | Item de roadmap |
|---|---|---|---|---|---|
| 1 | | Prevenção / Detecção / Mitigação / Processo | | | |

> Todo item de ação vira item de roadmap com ID. Ação sem responsável e sem prazo não é ação.

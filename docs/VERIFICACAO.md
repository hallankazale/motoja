# Verificação da versão 0.2.0

Referência: 12/09/2026.

## Executado nesta entrega

- TypeScript em modo estrito e build Vite de produção: passaram.
- Testes de domínio: três cenários passaram.
- PostgreSQL/PGlite: 15 cenários em base nova e 16 em base com legado, incluindo preservação de registros e revogação de acesso antigo.
- Regras verificadas: autenticação, conta suspensa/não confirmada, MFA administrativo, cotação no servidor, área de serviço, alteração indevida de preço, idempotência, participante autorizado, oferta privada, etapas, chegada, GPS e aprovação no embarque, PIN/limite persistente, capacetes, compartilhamento, encerramento, recebimento manual, contestação, avaliação e ocorrências privadas.
- Migrations aplicadas ao projeto existente sem apagar contas ou viagens; operação fechada.
- Edge Function publicada com validação explícita de JWT via `auth.getUser` em toda chamada. O gateway usa `verify_jwt=false` somente porque a autenticação é implementada na função.
- HTTP real: configuração pública 200, comando anônimo 401, mapas sem sessão 401, token inválido 401, schema privado rejeitado 406.
- Auditoria npm das dependências de produção: zero vulnerabilidades reportadas no momento da execução. Não equivale a garantia de ausência de vulnerabilidades.
- Auditoria Supabase após migração: avisos de execução pública das funções legadas eliminados. Resta proteção de senhas vazadas desativada em Auth e avisos informativos de RLS nas tabelas privadas sem acesso direto.
- Publicação Vercel em estado READY; endereço de avaliação aberto em navegador. Inspecionados início, mapa real, seleção de embarque e central de segurança. Sem erros atribuídos ao código do app na inspeção; registros do login Vercel/extensão pertenciam à navegação anterior.

## Preparado para CI

`tests/e2e/app.spec.ts` verifica passageiro, condutor pendente, administração e segurança em Chromium desktop, Chromium 360 px e WebKit 390 px. São fixtures sintéticas; não comprovam integração real de mapas, e-mail ou pagamentos. O resultado executado deve ser consultado no GitHub Actions do commit correspondente.

## Ainda não comprovado

- Fluxo inteiro com contas reais de homologação, provedor real de rota e dois aparelhos físicos.
- Entrega de confirmação/recuperação de e-mail, configuração de URL e SMTP.
- Aprovação/consulta documental externa, antifraude de identidade e verificação de telefone por SMS.
- GPS em segundo plano, tela bloqueada, notificações push, assinatura nativa ou publicação nas lojas.
- Concorrência de múltiplas conexões, carga, falhas de provedor e restauração de backups reais.
- Adequação jurídica, autorizações e seguros. A versão permanece fechada para corridas públicas.

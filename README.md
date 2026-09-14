# MotoJá · Campo Verde, MT

Aplicativo de corridas de moto para passageiros, motociclistas e administração. Interface em português, com adaptação para celulares, instalação pela tela inicial e backend Supabase. Versão 0.2.0, preparada em 12/09/2026.

**Versão para avaliação:** https://motoja-gilt.vercel.app/

**Situação: em preparação, com corridas públicas bloqueadas.** Existe implementação real dos fluxos e do banco; ainda não é uma operação comercial pronta nem um aplicativo publicado nas lojas. Mapas de fundo funcionam; busca de endereços e cálculo de rota dependem de um provedor configurado. Não há motoristas, avaliações, viagens ou pagamentos fictícios no aplicativo.

Veja o roteiro atual de configuração e teste em [docs/TESTAR.md](docs/TESTAR.md).

## O que foi implementado

| Área | Recursos |
| --- | --- |
| Passageiro | Cadastro por e-mail, acesso, recuperação de senha, origem/destino por mapa ou busca, cotação no servidor, solicitação idempotente, acompanhamento, cancelamento antes do embarque, histórico, avaliação, compartilhamento temporário |
| Motociclista | Cadastro da moto, envio privado de documentos, aprovação administrativa, disponibilidade, oferta com prazo, aceite, chegada, PIN e capacetes, início/fim, recebimento manual e avaliação |
| Administração | MFA obrigatório no servidor, aprovação de documentos e condutores, suspensão de condutor, ocorrências, convites do piloto, tarifas e contato de suporte |
| Segurança | Controle de acesso por participante, aprovação e validade documental, GPS recente no aceite/embarque, bloqueio de tentativas de PIN, registros de eventos, denúncia, solicitações de privacidade, atalhos 190/192 |
| Pagamento | Pix ou dinheiro diretamente ao condutor; recebimento declarado pelo condutor e contestação. Nenhuma confirmação bancária automática |

## Executar e verificar

Requer Node 22.12+ (CI usa Node 24).

```sh
npm ci
cp .env.example .env.local
npm run dev
npm run build
npm test
npm run test:db
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

O endereço e a chave publicável do projeto já existente são públicos por natureza. Nunca coloque `service_role`, token de mapas ou credenciais privadas em variáveis `VITE_*`.

Os testes de banco usam PostgreSQL/PGlite isolado, com cenário novo e cenário de atualização do legado. Os testes de navegador usam dados sintéticos interceptados, sem enviar cadastros, documentos ou corridas ao ambiente real. Emulação de navegador não substitui testes físicos de iPhone/Samsung.

## Organização

- `src/`: React, TypeScript, telas e cliente da API.
- `supabase/migrations/`: nova API privada e encerramento do acesso do cliente ao legado.
- `supabase/functions/motoja-locations/`: autenticação e integração de mapas no servidor.
- `legacy/`: versão anterior preservada para consulta. Não é publicada pelo build.
- `docs/OPERACAO.md`: configuração, limitações, roteiro de sete dias e critérios de liberação.
- `docs/SEGURANCA-E-PRIVACIDADE.md`: tratamento de ocorrências e requisitos jurídicos a validar.
- `docs/VERIFICACAO.md`: evidências e limites dos testes.

## Dados e publicação

O projeto Supabase existente foi reativado. As cinco contas e os sete registros de viagens antigos foram preservados. A nova área privada recebeu os perfis; as aprovações de condutores precisam ser revistas com os documentos. Viagens antigas permanecem arquivadas no banco e ainda não aparecem no histórico novo.

Os acessos do cliente às tabelas e funções antigas foram revogados para não contornar as novas regras. A migração se recusa a fazer isso se houver viagem antiga em andamento e mantém os privilégios anteriores em `motoja_private.legacy_acl_backup`. Nenhuma tabela antiga foi apagada.

Vercel publica somente `dist/`, com CSP, proteção contra enquadramento em outros sites e cache separado para arquivos públicos. O service worker oferece apenas uma página de indisponibilidade offline: não enfileira corridas e não guarda documentos, mapas ou viagens offline.

## iPhone e Samsung

A versão atual é web/PWA: Safari → Compartilhar → Adicionar à Tela de Início; Chrome Android → menu → Instalar/Adicionar à tela inicial. O GPS exige o aplicativo aberto durante o piloto.

`capacitor.config.ts` e as dependências preparam uma evolução nativa. Projetos Android/iOS, permissões nativas, GPS em segundo plano, notificações push, assinaturas e publicação nas lojas ainda precisam ser implementados/validados. Não há APK ou IPA nesta entrega.

## Antes de corridas reais

Configure provedor de mapas/rotas, e-mail transacional e URLs de retorno da autenticação. Defina CNPJ/controlador, contato de suporte, seguros e enquadramento municipal para transporte por motocicleta. Faça testes de ponta a ponta com duas contas em celulares físicos. Consulte os critérios completos em `docs/OPERACAO.md`.

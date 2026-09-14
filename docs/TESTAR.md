# Preparar o teste entre dois celulares

Estado de referência: 13/09/2026. A aplicação está publicada; a operação permanece fechada. Este roteiro não declara mapas, entrega de e-mail ou transporte real como já homologados.

## O que está pronto no código

- Busca e rotas Geoapify com perfil `motorcycle`, usando uma chave exclusiva do servidor; alternativa com serviços compatíveis Nominatim/OSRM próprios ou contratados.
- Diagnóstico em **Administração → Operação → Verificar integrações**. “Configurado” indica presença de configuração, não uma entrega de e-mail ou rota real aprovada.
- Solicitação idempotente: repetir após perder a resposta não cria outra corrida.
- PIN, etapas, recebimento manual, histórico e avaliação; teste com duas sessões executando as migrations reais em PostgreSQL isolado.
- Limite de mapas: 12 consultas por conta/minuto, 60 no total/minuto e 600 no total em uma janela de 24 horas. Em preparação/piloto só convidados e administradores podem consumir o serviço. Limites do fornecedor podem ser menores.

## Configurações que dependem do titular

### 1. Mapas

Crie um projeto em https://myprojects.geoapify.com/ e obtenha sua própria chave. A conta e os limites pertencem ao titular; nenhuma contratação foi feita nesta entrega.

No Supabase, configure **Edge Functions → Secrets**:

```text
MAPS_PROVIDER=geoapify
GEOAPIFY_API_KEY=<sua chave>
```

Não coloque a chave no código do navegador, no GitHub, em mensagens ou capturas. A API usada é `https://api.geoapify.com`; o modo de rota é `motorcycle`, em metros/segundos. Valide endereços conhecidos e a adequação das vias antes de usar uma rota.

### 2. Acesso e e-mail

A configuração pública consultada em 13/09 tinha `mailer_autoconfirm=true`: cadastrar não comprovava posse do e-mail. Configure um serviço SMTP e então ative a confirmação; não use cadastro sem confirmação como prova de identidade.

Em **Authentication → URL Configuration**, use `https://motoja-gilt.vercel.app` como Site URL e permita esse domínio nos Redirect URLs. Preserve outros retornos legítimos se o projeto for compartilhado. Evite coringa público.

Em **Authentication → Email/SMTP**, informe o servidor, porta, usuário, senha e remetente autorizado do seu serviço. Ative confirmação de e-mail. Depois teste cadastro e recuperação em caixas reais dos participantes. A ferramenta conectada usada nesta conversa não permite alterar Auth/secrets; nenhum SMTP ou API key foi inventado.

### Alternativa para quem usa terminal

O script `scripts/configure-pilot.mjs` aplica Auth/SMTP e secrets usando a API oficial do Supabase. Exige `SUPABASE_ACCESS_TOKEN` no ambiente local e um JSON privado **fora do repositório**, no formato ilustrado em `docs/pilot.example.json`. O exemplo não contém credenciais.

```sh
npm run configure:pilot -- --file /caminho/privado/piloto.json
npm run configure:pilot -- --file /caminho/privado/piloto.json --apply
```

A primeira execução mostra o plano sem segredos. A segunda aplica os valores, verifica a configuração de Auth e não ativa corridas nem promove usuários. Em caso de aplicação parcial, executar novamente com os mesmos valores é idempotente. Depois confira mapas/e-mail no app; a verificação automática de configuração não testa entrega SMTP.

## Teste manual

1. Abra o app no Chrome/Android e no Safari/iPhone. Use contas diferentes de passageiro e motociclista.
2. Na conta administrativa existente, confirme a autenticação em duas etapas. Convide os IDs dos participantes em Operação. Analise os documentos e o cadastro do condutor. Um convite não substitui aprovação documental.
3. Depois das configurações e da preparação necessária, ative **Piloto — apenas convidados**. Não habilite operação pública para fazer um teste.
4. Com o app aberto e GPS autorizado, o condutor toca em **Ficar disponível**. O passageiro seleciona origem/destino, confere o valor e solicita.
5. O condutor aceita, informa que está a caminho e registra chegada no embarque. Confira pessoa/placa, PIN e capacetes antes do início.
6. Conclua a viagem, registre o recebimento manual quando efetivamente ocorrido e avalie. Confira ambos os históricos. Não faça transferências reais só para testar botões.
7. Teste também: GPS negado, conexão perdida, PIN incorreto, cancelamento antes de embarcar, dois toques no pedido e indisponibilidade do provedor.

Use o ensaio automatizado abaixo para simular o ciclo sem transporte real, cobrança ou documentos de terceiros. Qualquer teste com transporte exige preparação operacional própria. A PWA precisa ficar aberta; tela bloqueada e GPS em segundo plano ainda não estão homologados.

## Testes automatizados e limites da evidência

```sh
npm test
npm run test:db
npm run test:e2e
```

- Unitários: tarifa/localização, adaptação do provedor, dados inválidos, limite/queda de provedor, segredos fora de mensagens e plano de configuração.
- Integração SQL: migrations em banco vazio e legado, permissões, etapas, PIN, valores, convites, limites globais.
- Interface com banco real isolado: passageiro e motorista em sessões diferentes, perda da primeira resposta, pedido sem duplicação, PIN errado/correto, conclusão, recebimento e avaliação. Auth, GPS e resposta externa do mapa são fixtures explícitas, não uma prova de integração hospedada.
- Não executado sem credenciais: consulta real Geoapify, entrega de e-mail e ciclo em dois aparelhos físicos.

## Estrutura e escolhas

- `supabase/functions/_shared/maps.ts`: adaptadores do fornecedor, validação e limites de resposta; sem dependência nova.
- `supabase/functions/motoja-locations/index.ts`: autenticação e emissão de cotações pelo servidor.
- `src/features/PilotReadiness.tsx`: diagnóstico administrativo, separado do fluxo do passageiro.
- `scripts/lib/pilot-config.mjs` e `scripts/configure-pilot.mjs`: planejamento e aplicação das configurações; segredos não são impressos.
- `scripts/lib/test-database.mjs`: ambiente PostgreSQL descartável compartilhado pelos testes.
- `tests/support/ride-fixture.ts` e `tests/e2e/ride-flow.spec.ts`: fluxo visual usando as regras SQL reais.

React/TypeScript, Supabase e PGlite foram mantidos para reaproveitar a arquitetura e validar contratos sem dados de produção. Geoapify foi adicionado como opção por reunir busca e rotas de motocicleta em uma única integração.

Referências verificadas em 13/09/2026:
- https://apidocs.geoapify.com/docs/routing/
- https://apidocs.geoapify.com/docs/geocoding/
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/reference/api/v1-update-auth-service-config

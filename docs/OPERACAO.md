# Preparação da operação

Data de referência: 12/09/2026. Responsável pelo projeto: Hallan. Cidade assumida a partir do pedido: Campo Verde, MT. Marca provisória: MotoJá.

## Estado atual

A aplicação e o banco foram implantados, mas `settings.mode = closed`. Nenhum cadastro pode abrir corrida enquanto esse bloqueio estiver ativo. A publicação web é uma versão de avaliação. Não foi contratado serviço pago nem configurado segredo de terceiro.

O piloto por convite é um modo técnico para homologação controlada. Não constitui dispensa de autorização, seguro, obrigações de transporte ou proteção de dados. A ausência desses requisitos impede o uso comercial e testes com transporte real onde a exigência se aplicar.

Atualização de 13/09: veja [TESTAR.md](TESTAR.md) para a integração Geoapify, o diagnóstico administrativo e a configuração assistida de Auth/SMTP. A confirmação automática de e-mail encontrada na conta precisa ser revisada com um SMTP funcional.

## Serviços que faltam configurar

1. **Mapas/rotas:** endpoints HTTPS Nominatim-compatible e OSRM-compatible contratados ou próprios. Definir `GEOCODER_BASE_URL`, `ROUTER_BASE_URL` e, se exigido, `MAPS_PROVIDER_TOKEN` como secrets da Edge Function. O provedor deve suportar cobertura e restrições apropriadas para motos em Campo Verde. Validar rotas reais e acessos proibidos; uma rota do perfil `driving` não garante legalidade para toda motocicleta.
2. **Autenticação:** no Supabase Auth, definir Site URL `https://motoja-gilt.vercel.app` e autorizar o mesmo domínio nos Redirect URLs. Para desenvolvimento, incluir apenas o localhost usado. Configurar SMTP próprio, limites, confirmação de e-mail e proteção de senhas comprometidas quando disponível no plano. Não usar wildcard aberto para URLs de retorno. Testar confirmação de conta e recuperação em dispositivos reais. Não foram enviados e-mails de teste a usuários existentes.
3. **Administração:** usar a conta administrativa já existente. Cadastrar fator TOTP no acesso inicial; os dados de gestão e suas alterações exigem `aal2`. Não existe promoção de usuário a administrador pela interface. Não compartilhar credenciais.
4. **Suporte:** definir telefone/e-mail reais e horários com equipe responsável. Hoje não há central 24h nem acionamento automático de polícia/SAMU.
5. **Pagamentos:** piloto previsto com Pix/dinheiro direto ao condutor. Conferência é manual. Cartão, split, carteira, estorno e conciliação bancária exigem PSP e integração com webhooks autenticados e idempotentes. Não armazenar cartões no app.
6. **Hospedagem:** confirmar plano e termos para atividade comercial. O plano Hobby da Vercel é destinado a uso pessoal não comercial; a avaliação não libera operação comercial nesse plano. Configurar domínio próprio, orçamento e alertas antes do lançamento.
7. **Retenção/backups:** definir prazos por categoria com assessoria, documentar bases legais e operador/controlador, testar restauração e exportação para local separado, alertas de falha e responsáveis. Cadeias de hash de eventos não substituem backup independente.

A ferramenta conectada permite implantar funções e migrations, mas não expôs configuração de Auth ou secrets de mapas. Essas configurações não foram preenchidas com valores inventados.

## Ativação controlada

Após as configurações e o atendimento estarem prontos, o administrador pode mudar de fechado para piloto, convidar IDs de contas e aprovar documentos. Convite não aprova um condutor; são controles distintos. Cada participante deve confirmar o e-mail e aceitar a versão vigente das regras.

O modo público `live` não é oferecido no painel nesta fase. O backend também exige `legal_ready`, `insurance_ready`, `routing_ready`, referência jurídica e telefone de suporte para esse modo. Esses campos só devem mudar por uma migração de liberação revisada, com documentos e testes concluídos. Nunca marcar controles como prontos apenas para remover uma mensagem de erro.

A área inicial é uma caixa geográfica aproximada (-15.68 a -15.43 de latitude; -55.32 a -55.04 de longitude). Ela não representa os limites oficiais do município. Validar bairros atendidos e vias permitidas antes de divulgar cobertura.

## Roteiro de sete dias

| Dia | Trabalho | Evidência para avançar |
| --- | --- | --- |
| 1 | Auditar base, UX e fluxos; publicar versão fechada | Código e versão avaliável; testes de regras |
| 2 | Definir empresa, suporte, tarifas e situação municipal; configurar mapas e SMTP | Serviços contratados/configurados e respostas documentadas |
| 3 | Testar cadastro, confirmação, recuperação, MFA, documentos e convites | Duas contas reais de homologação funcionando |
| 4 | Testar pedido → oferta → aceite → chegada → PIN → viagem → fim → recebimento → avaliação | Passageiro e condutor em celulares diferentes; consentimento dos participantes |
| 5 | Testar perda de rede/GPS, cancelamento, ofertas simultâneas, fraude de preço, denúncias e restauração | Nenhuma cobrança/corrida duplicada; protocolo de incidentes exercitado |
| 6 | Piloto supervisionado com pequeno grupo autorizado; medir bateria, latência e erros | Sem falha crítica aberta e suporte disponível |
| 7 | Revisar requisitos e decidir abertura limitada ou adiamento | Aceite operacional documentado; reservas financeiras e seguro adequados |

A semana é uma meta condicionada à disponibilidade de provedores, documentação, pessoas e testes. Não é prazo garantido para equivalência completa ao Uber, aprovação nas lojas ou licença municipal. O trabalho nesta conversa não continua automaticamente por sete dias.

## Critérios pendentes para produção

- Cadastro/recuperação, MFA e entrega de e-mail demonstrados de ponta a ponta.
- Roteamento e valor calculado pelo servidor com provedor real.
- Verificação humana/documental e política antifraude dos condutores; não declarar KYC biométrico inexistente.
- Termos definitivos e política de privacidade identificando empresa, finalidades, retenção, transferências e direitos.
- Teste físico de Samsung/Android e iPhone/Safari, tela bloqueada, app em segundo plano, bateria, permissões e conectividade ruim.
- Aplicativo nativo com GPS em segundo plano e notificações para operação sem tela aberta. PWA atual não garante isso.
- Teste concorrente em múltiplas conexões PostgreSQL e teste de carga; PGlite confirma regras e constraints, mas serializa transações.
- Observabilidade, alertas, backup/restauração e rotina para limpar tokens/quotas expirados segundo política de retenção.
- Paginação/escala de gestão, busca administrativa de usuários, bloqueio de passageiros pela interface e importação do histórico antigo; hoje existem limites explícitos de 30/100 registros e bloqueio de conta no backend.
- Chat com proteção de contato, notificações push e antifraude avançado ainda não implementados.

## Manutenção e retorno

O código antigo está em `legacy/`; o build Vite não o publica. Para retorno de emergência, manter operações fechadas e restaurar uma versão web conhecida. Não reaplicar concessões antigas de forma indiscriminada: revisar `motoja_private.legacy_acl_backup` e autorizar apenas os acessos necessários. As duas bases mantêm seus registros; não usar reset de banco em produção.

As migrations locais correspondem às alterações aplicadas, mas o serviço MCP atribui seus próprios números de versão remotos. Antes do primeiro `supabase db push` por CLI, comparar `supabase migration list` e reconciliar o histórico com o estado real; não reaplicar tabelas existentes. Migrations antigas incompletas estão arquivadas, não são uma cadeia confiável para reproduzir o legado.

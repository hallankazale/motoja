# Segurança, ocorrências e privacidade

Documento preparatório para o piloto; não substitui parecer jurídico nem os termos definitivos da empresa.

## Uso ilícito de uma corrida

O aplicativo proíbe violência, assédio, transporte/uso para finalidade ilícita e fraude. Nenhum termo ou recurso técnico garante imunidade à plataforma, ao operador ou ao condutor. Responsabilidade depende dos fatos, do conhecimento/participação de cada envolvido e das obrigações legais aplicáveis. A responsabilidade da plataforma pelo próprio serviço não pode ser simplesmente afastada por uma caixa de aceite.

A proteção prática envolve verificação dos condutores, cadastro, identificação da moto, PIN fornecido somente no embarque, registros de eventos, controle de acesso e atendimento humano. Não presumir crime por bairro, aparência, origem ou características pessoais. Tratar relatos como alegações até apuração. Evitar bloqueio automático baseado apenas em denúncia não verificada.

Se houver risco imediato: interromper a interação com segurança, não confrontar pessoas nem perseguir suspeitos e procurar o serviço de emergência. Os atalhos 190 e 192 apenas abrem o telefone do usuário; não enviam localização e não acionam automaticamente uma central.

## Procedimento de atendimento a definir com a equipe

1. Receber a ocorrência com protocolo, registrar fatos objetivos e avaliar urgência.
2. Restringir o acesso aos relatos e documentos a responsáveis autorizados, com MFA.
3. Preservar somente os registros pertinentes quando houver fundamento para retenção, sem edição das evidências originais. Documentar quem acessou/exportou e por quê.
4. Avaliar restrições preventivas proporcionais, motivo registrado, revisão humana e canal de contestação.
5. Encaminhar solicitações de autoridades à pessoa responsável e avaliar o fundamento legal. Não entregar livremente o histórico completo de usuários ou localização.
6. Registrar medidas tomadas e retorno ao denunciante sem expor dados desnecessários de outras pessoas.

A versão implementa protocolos, relato privado, revisão administrativa e suspensão de condutor com justificativa. Cadeia de custódia formal, exportação restrita de evidências, monitoramento 24h e acordo com central de emergência ainda não estão implantados.

## Dados tratados e limites atuais

| Dado | Uso previsto | Controle implementado / pendência |
| --- | --- | --- |
| Conta, nome e telefone | Acesso e contato necessário à corrida | Conta verificada, autorização por perfil; telefone cadastral ainda não é validado por SMS |
| CNH, identidade, veículo, autorização e seguro | Análise de habilitação para operar | Bucket privado, limite 5 MB, leitura do titular ou admin com MFA; análise humana, sem promessa de consulta oficial/biometria |
| Origem, destino e GPS | Oferta, embarque, acompanhamento | Oferta reduzida antes do aceite; localização recente; coleta em primeiro plano. Ainda sem histórico completo de trajeto e sem detecção confiável de GPS adulterado |
| PIN | Confirmar encontro para embarque | Só passageiro recebe PIN; contador persistente e bloqueio temporário após cinco erros |
| Pagamento | Registro de recebimento e contestação | Pix/dinheiro direto; registro manual, sem dados de cartão nem confirmação do banco |
| Ocorrência | Segurança, suporte e direitos | Autor e administração autorizada; protocolo não significa que alguém já atendeu |
| Link de acompanhamento | Compartilhamento escolhido por participante | Segredo no fragmento, expira em duas horas, pode ser revogado e termina com a corrida; qualquer pessoa com o link pode consultar enquanto válido |

Definir prazos de retenção por finalidade, base legal, contratos com operadores, transferência internacional, contato do controlador, procedimentos de acesso/correção/eliminação e resposta a incidentes antes da coleta operacional. Pedido de exclusão abre uma solicitação; esta versão não apaga automaticamente todos os dados nem promete apagar registros sujeitos a retenção legal.

## Requisitos jurídicos localizados

A Lei Complementar municipal 126/2019 trata de transporte privado individual por plataformas em Campo Verde e contém requisitos próprios de automóveis. O texto consultado não basta para confirmar autorização para transporte por motocicleta. Confirmar com a Prefeitura/órgão competente o enquadramento atual, atos posteriores, cadastro da empresa, condutores, veículos, seguros e obrigações tributárias antes de operar. Nenhum contato com autoridade foi feito em nome de Hallan.

O texto federal de requisitos de mototaxista foi alterado pela MP 1.360/2026. Não adotar automaticamente exigências antigas de idade/tempo de habilitação/curso sem verificar a redação vigente e os atos locais aplicáveis na data da operação.

Fontes oficiais consultadas em 12/09/2026:

- Município: https://sapl.campoverde.mt.leg.br/media/sapl/public/normajuridica/2019/3771/lei_c_n126-2019.pdf
- Código de Defesa do Consumidor: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Lei 12.009/2009, texto consolidado: https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12009.htm

## Serviços externos e segurança técnica

Mapas de fundo usam OpenStreetMap com atribuição visível, sem download em massa ou cache offline. A política de tiles não fornece SLA comercial; avaliar fornecedor com contrato para escala. Não usar o Nominatim público como autocomplete ou backend comercial embutido. A busca da aplicação exige envio explícito e provedor configurado.

- Tiles: https://operations.osmfoundation.org/policies/tiles/
- Geocodificação pública: https://operations.osmfoundation.org/policies/nominatim/
- RLS/negação por padrão: https://supabase.com/docs/guides/database/postgres/row-level-security
- Proteção de senhas comprometidas pendente: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Os avisos informativos de RLS sem políticas nas tabelas privadas são intencionais: clientes não têm concessões diretas; operações passam pelas funções autorizadas. As funções públicas novas são wrappers com SECURITY INVOKER e delegam a funções privadas que verificam identidade, titularidade e MFA. Isso não dispensa revisão externa, testes de invasão ou gestão de credenciais.

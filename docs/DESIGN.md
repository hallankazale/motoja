# Identidade visual MotoJá

Referência: imagem fornecida por Hallan nesta conversa. O arquivo de referência contém dados pessoais e não foi adicionado ao repositório.

## Direção

Fundo azul noturno, marca com capacete vetorial, destaque turquesa, ações em gradiente azul/verde, campos claros, títulos de peso alto e curvas amplas. O tema escuro é o padrão; a pessoa pode alternar para o tema claro e a preferência fica salva somente no próprio navegador.

A entrada abre em tela inteira no celular e em um painel central no desktop. O restante usa a mesma paleta com hierarquia consistente: ação principal em gradiente, navegação ativa em azul e mensagens de segurança com suas cores próprias. Campos de entrada usam texto escuro sobre fundo claro nos dois temas. O layout permite rolagem quando o teclado reduz a área disponível.

## Estrutura e escolhas

- `src/styles/theme.css`: cores semânticas para todos os estados e os dois temas. Variáveis CSS evitam cores divergentes entre áreas.
- `src/styles.css`: estrutura responsiva e componentes gerais existentes.
- `src/styles/auth.css`: apresentação da entrada, cadastro e recuperação.
- `src/components/Brand.tsx`: marca SVG pequena, nítida em qualquer densidade; gradiente com ID único por instância.
- `src/components/ThemeToggle.tsx` e `src/lib/theme.tsx`: preferência de aparência; falhas do armazenamento não bloqueiam o login.
- `src/features/Auth.tsx`: formulário acessível com senha ocultável, recuperação e criação de conta.

React/TypeScript e CSS foram mantidos para reaproveitar componentes e verificar tipos, sem acrescentar biblioteca visual ou dependência de execução. A lógica de corrida e as permissões do banco permanecem em sua camada própria.

## Validação

Build e verificação de tipos; suíte existente de domínio/integração; navegação das três áreas em Chromium e WebKit; formulário em 360/390 px; alternância de tema persistente após recarregar; mostrar/ocultar senha; ausência de transbordamento horizontal; foco visível e botões de pelo menos 44 px nos controles de autenticação. O documento de verificação e o GitHub Actions registram os resultados executados.

Não foi colocado e-mail ou senha da imagem nos campos. Botões de acesso social não são exibidos como disponíveis: Google e Apple dependem de configuração real dos provedores. A referência visual não altera a situação de preparação da operação.

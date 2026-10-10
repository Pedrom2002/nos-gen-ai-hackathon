# Animar a onda de censura

## Objetivo
Fazer com que a onda no modo **Deslizar** pareça fluir continuamente e transforme visualmente o texto à medida que o atravessa: atrás da onda, o conteúdo fica censurado; à frente, permanece original.

## Alterações
- Animar o contorno da onda vertical com movimento contínuo e suave, em vez de apenas pulsar a largura da linha.
- Criar uma faixa aquática subtil junto à divisória, com camadas translúcidas e brilho leve, usando a cor principal do tema.
- Sincronizar a fronteira visual da onda com a máscara do documento, para cada palavra mudar entre original e `*` exatamente quando a onda passa por ela.
- Manter o arrastamento por rato/toque, teclado e a animação automática inicial já existentes.
- Preservar uma versão estática e legível quando o dispositivo tiver redução de movimento ativa.

## Limites técnicos
- A alteração será apenas visual em `RiverComparison` e nos estilos globais.
- Não serão alterados a deteção, a lógica de anonimização, o texto copiado nem os ficheiros descarregados.

## Verificação
- Confirmar a passagem original → censurado ao arrastar nos dois sentidos.
- Confirmar a animação automática inicial, rato, toque e teclado.
- Verificar em telemóvel e computador, nos temas claro e escuro, incluindo redução de movimento.

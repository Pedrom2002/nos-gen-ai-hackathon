# Lethe mobile (React Native)

App nativa para Android e iOS, feita com Expo. Fotografa um documento (ou escolhe uma imagem, PDF, DOCX, TXT ou CSV), envia-o à API do Lethe e devolve o texto anonimizado, o relatório e o próprio ficheiro com os dados pessoais removidos de forma irreversível.

A lógica não é duplicada: a máscara por posição, o histórico de revisão, o modelo da API e as 8 línguas vêm do frontend web (`../frontend/src`, através do atalho `@web`).

## Correr no telemóvel

1. Instalar a app **Expo Go** no telemóvel (Play Store ou App Store).
2. Neste computador:
   ```bash
   cd submission/mobile
   npm install
   npx expo start --tunnel
   ```
3. Ler o QR com a câmara (iOS) ou com o Expo Go (Android).
4. Na app, abrir **Definições** e escrever o endereço da API (por exemplo o túnel `abc.trycloudflare.com` que aponta para `uvicorn api.main:app --port 8000`). Carregar em **Testar ligação**. Sem endereço, a app funciona em modo demo, com o aviso no cabeçalho.

## Estrutura

| Ficheiro | Papel |
|---|---|
| `src/app/index.tsx` | Importar: câmara, galeria, ficheiros, colar texto, exemplo |
| `src/app/result.tsx` | Resultado: original e anonimizado, copiar, partilhar `.txt`, relatório e ficheiro censurado |
| `src/app/settings.tsx` | Tema, língua e endereço da API |
| `src/api.ts` | Cliente da API (modo demo, tempo limite, erros da API mostrados tal como vêm) |
| `src/session.tsx` | Documento, resultado e revisão (histórico partilhado com a web) |
| `src/pick.ts` | Câmara, galeria e ficheiros, com validação antes do envio (tipo, 25 MB) |
| `src/share.ts` | Partilha pelo menu do sistema |
| `src/strings.ts` | Textos só do telemóvel, nas 8 línguas |

## Testes

```bash
npm test          # jest-expo
npm run typecheck # tsc
```

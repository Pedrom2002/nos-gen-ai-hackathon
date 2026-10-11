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
4. A app encontra a API sozinha:
   - **pelo endereço deste computador**: copiar `.env.example` para `.env.local` e pôr `EXPO_PUBLIC_API_URL=` com o túnel da API (por exemplo `abc.trycloudflare.com`), depois reiniciar `npx expo start`;
   - **ou na mesma rede Wi-Fi**: sem nada configurado, usa a porta 8000 do computador que serviu a app (`uvicorn api.main:app --host 0.0.0.0 --port 8000`).

   Um endereço escrito em **Definições** tem prioridade; **Testar ligação** confirma. Sem nenhum endereço, a app funciona em modo demo, com o aviso no cabeçalho.

## Estrutura

| Ficheiro | Papel |
|---|---|
| `src/app/index.tsx` | Importar: câmara, galeria, ficheiros, colar texto, exemplo |
| `src/app/review.tsx` | Revisão: tocar num valor para o mascarar ou mostrar, filtrar e ligar categorias, desfazer e refazer, e carregar numa palavra para a mascarar à mão |
| `src/app/result.tsx` | Resultado: original e anonimizado, copiar, partilhar `.txt`, relatório e ficheiro censurado |
| `src/app/settings.tsx` | Tema, língua e endereço da API |
| `src/api.ts` | Cliente da API (modo demo, tempo limite, erros da API mostrados tal como vêm) |
| `src/address.ts`, `src/useApi.ts` | Onde está a API: o endereço das Definições ou, se estiver vazio, o automático |
| `src/review.ts` | Auxiliares da revisão sobre a máscara partilhada com a web: marcas, contagem por categoria e alterações |
| `src/report.ts` | Relatório explicativo do ecrã de resultado: cada valor mascarado, categoria e motivo, mais os totais |
| `src/ui.tsx` | Componentes visuais com a paleta da web (alvos de toque de 44 pt e etiquetas acessíveis) |
| `src/session.tsx` | Documento, resultado e revisão (histórico partilhado com a web) |
| `src/pick.ts` | Câmara, galeria e ficheiros, com validação antes do envio (tipo, 25 MB) |
| `src/share.ts` | Partilha pelo menu do sistema |
| `src/strings.ts` | Textos só do telemóvel, nas 8 línguas |

## Instalar sem o Expo Go (APK)

O APK da demo: [descarregar](https://expo.dev/artifacts/eas/W1jxgI0oRh6OxMl2B8Wv0CxKdVs7ClcOr_97FQJ-ihg.apk). Para gerar outro:

```bash
cd submission/mobile
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value <endereço da API>
eas build -p android --profile preview   # perfil em eas.json: APK instalável
```

O endereço da API fica gravado na app no build; se mudar, escreve-se o novo em **Definições**.

## Testes

```bash
npm test          # jest-expo, 31 testes
npm run typecheck # tsc
```

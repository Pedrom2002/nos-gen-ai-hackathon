# Lethe

> O documento lembra-se de tudo, menos de quem és.

Lethe é o rio do esquecimento da mitologia grega. Esta app faz os documentos "esquecerem" quem é a pessoa, mantendo o significado: anonimização de dados sensíveis com IA, em conformidade com o RGPD.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Formatos

- **PDF com texto**: o texto e a posição de cada palavra vêm do pdf.js, no navegador.
- **Imagens (PNG, JPG, WebP) e PDF digitalizados**: o texto é reconhecido no navegador com o tesseract.js (modelos `por` + `eng`, descarregados do CDN do pacote na primeira utilização e guardados em cache), para pré-visualizar e posicionar as palavras na página. Um PDF misto só passa pelo OCR nas páginas sem camada de texto. O ficheiro segue para o backend, que faz o seu próprio OCR (Tesseract, endireitado e com erros de leitura corrigidos); só se o servidor não tiver OCR é que o texto lido no navegador é enviado em seu lugar (`documento.txt`).
- **DOCX, TXT e CSV**: o navegador não lê DOCX, por isso o ficheiro vai direto para o backend e o texto mostrado é o que ele leu. TXT e CSV são lidos como texto.
- **Resultado**: quando o original tem páginas (fotografia ou PDF), o passo final mostra-as com caixas pretas sobre as palavras mascaradas, lado a lado (com o scroll sincronizado) ou com o deslizador; "Texto" volta à comparação textual. As caixas derivam dos mesmos troços que `anonymize()` mascara (`src/lib/redaction.ts`); `src/lib/align.ts` casa o texto devolvido pelo backend com as palavras lidas no navegador. Numa fotografia, a metade anonimizada é o próprio PNG censurado que o backend construiu e verificou (`download/redacted`); as caixas só servem para localizar a entidade em foco.
- **Exportar**: "Descarregar ficheiro censurado" pede ao backend o ficheiro com as palavras removidas de vez (PNG para fotografias, PDF para PDF, DOCX para DOCX). `src/lib/export.ts` sabe gerar um PNG ou PDF rasterizado no navegador, mas não está ligado à página.
- Para servir os ficheiros do tesseract localmente, copia `worker.min.js`, o core wasm e os `.traineddata.gz` para `public/tesseract/` e passa `workerPath`/`corePath`/`langPath` em `src/lib/ocr.ts`.

## Ligar ao backend

Todo o acesso ao backend está em `src/services/anonymizer.ts`. O backend é a API FastAPI em `../submission/api` (ver o `README.md` dela para as rotas e os tipos).

- `VITE_API_URL=/` → o frontend chama `/api/...` na própria origem e o Vite reencaminha para `http://localhost:8000` (`vite.config.ts`), sem CORS.
- `VITE_API_URL=https://api.exemplo.pt` → chamada direta; a origem do frontend tem de estar em `ALLOWED_ORIGINS` no `.env` da API.
- Sem `VITE_API_URL` → modo demo com dados simulados.

Fluxo:

1. `POST /api/documents` (multipart `file`): o ficheiro original (PDF, DOCX, PNG, JPG, WebP, TXT ou CSV) quando o texto não foi editado, senão o texto como `documento.txt`. Da resposta (`DocumentState`), `lines` passa a ser o texto mostrado (o documento como o backend o leu, sem linhas vazias) e cada `item` vira uma entidade com o troço exato da linha (`first..last`), guardando os ids do backend em `refs`.
2. O mascaramento (`*` por palavra, sem linhas vazias) continua a ser feito no frontend, para as alterações manuais se aplicarem antes do resultado.
3. Ao gerar o resultado, `PUT /api/documents/{id}/decisions` envia os itens desativados na revisão (`keep`), e o resumo passa a incluir a verificação de fugas do backend.
4. "Limpar" faz `DELETE /api/documents/{id}`: o backend só guarda documentos em memória.

```sh
# terminal 1
cd submission && uvicorn api.main:app --port 8000 --no-access-log
# terminal 2
cd submission/frontend && cp .env.example .env && npm install && npm run dev   # http://localhost:8080
```

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

## Ligar ao backend

Este projeto é **apenas frontend**. Todo o acesso ao backend está em `src/services/anonymizer.ts`.

- Definir `VITE_API_URL` (ex.: `VITE_API_URL=https://api.exemplo.pt`) → o frontend faz `POST ${VITE_API_URL}/anonymize` com corpo JSON `{ "text": "..." }`.
- Sem `VITE_API_URL` → modo demo com dados simulados.

Contrato da resposta:

```ts
type Category = "nome"|"data"|"identificador"|"contacto"|"morada"|"saude"|"financeiro"|"biometrico"|"religiao_etnia"|"outro";
interface Entity { text: string; category: Category; reason: string; gdpr_basis?: string }
interface AnalysisResult { entities: Entity[]; summary: string; prompt?: string }
```

- `text` deve ser o texto **exato** do documento (o frontend procura todas as ocorrências).
- O mascaramento (`*` por palavra, sem linhas vazias) é feito no frontend, após a validação manual.
- `prompt` (opcional) pode ser devolvido, mas já não é mostrado na interface.
- O backend deve permitir CORS a partir do domínio do frontend.

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

Todo o acesso ao backend está em `src/services/anonymizer.ts`. O backend é a API FastAPI em `submission/api/`.

1. Na pasta `submission`: `uvicorn api.main:app --port 8000 --no-access-log`
2. Aqui: criar `.env.local` com `VITE_API_URL=http://localhost:8000` e correr `npm run dev`.
3. Se o frontend correr noutro domínio (ex.: preview do Lovable), juntar esse domínio a `ALLOWED_ORIGINS` em `submission/.env`.

Sem `VITE_API_URL` a app corre em modo demo, com o resultado do documento da NOS igual à referência.

O frontend faz `POST ${VITE_API_URL}/api/anonymize` com `{ "text": "..." }` e recebe:

```ts
interface AnalysisResult {
  entities: { text: string; category: Category; reason: string; gdpr_basis?: string }[];
  summary: string;
  prompt?: string;
  masked_text?: string; // texto final do pipeline, igual ao do run.py
}
```

Enquanto a revisão não mudar nada, o texto anonimizado e o `submission.txt` vêm de `masked_text`. Depois de uma alteração (ligar, desligar ou acrescentar dados), o mascaramento é refeito no browser a partir das entidades ativas.

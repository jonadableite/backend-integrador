// src/utils/spintax.ts
import { Logger } from "./logger";

const logger = new Logger("SpintaxProcessor");

/**
 * Processa uma string com sintaxe Spintax e retorna uma variação aleatória.
 * Exemplo: "Olá {mundo|pessoal|gente}!" pode retornar "Olá mundo!", "Olá pessoal!" ou "Olá gente!".
 * @param text A string contendo sintaxe Spintax.
 * @returns Uma string com uma variação aleatória aplicada.
 */
export function processSpintax(text: string | null | undefined): string {
	if (!text) {
		return "";
	}

	// Regex para encontrar blocos Spintax como {opcao1|opcao2|opcao3}
	const spintaxRegex = /\{([^}]+)\}/g;

	let processedText = text;
	// biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
	let match;

	// Loop para processar múltiplos blocos Spintax na string
	// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
	while ((match = spintaxRegex.exec(processedText)) !== null) {
		const fullMatch = match[0]; // Ex: {opcao1|opcao2}
		const options = match[1].split("|"); // Ex: ['opcao1', 'opcao2']

		if (options.length > 0) {
			// Seleciona uma opção aleatoriamente
			const randomIndex = Math.floor(Math.random() * options.length);
			const selectedOption = options[randomIndex].trim();

			// Substitui o bloco Spintax pela opção selecionada
			// Usamos match.index e fullMatch.length para garantir que substituímos a ocorrência correta
			processedText =
				processedText.substring(0, match.index) +
				selectedOption +
				processedText.substring(match.index + fullMatch.length);

			// Reinicia a busca a partir do início para garantir que todos os blocos sejam encontrados,
			// especialmente se houver Spintax aninhado (embora esta implementação simples não suporte aninhamento complexo)
			spintaxRegex.lastIndex = 0;
		} else {
			// Se não houver opções (ex: {}), remove o bloco vazio
			processedText =
				processedText.substring(0, match.index) +
				processedText.substring(match.index + fullMatch.length);
			spintaxRegex.lastIndex = 0;
		}
	}

	logger.depurar(
		`Spintax processado: Original="${text}" -> Final="${processedText}"`,
	);
	return processedText;
}

// Exemplo de uso:
// const template = "Olá {mundo|pessoal}! Tudo {bem|tranquilo}? {Podemos conversar|Vamos falar}?";
// const variation = processSpintax(template);
// console.log(variation); // Ex: Olá pessoal! Tudo tranquilo? Vamos falar?

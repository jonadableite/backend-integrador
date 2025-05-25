// src/services/spintax.service.ts

/**
 * Processa uma string com sintaxe Spintax e retorna uma variação aleatória.
 * Ex: "Olá, {mundo|pessoal|gente}!" pode retornar "Olá, mundo!", "Olá, pessoal!" ou "Olá, gente!".
 * @param text A string com sintaxe Spintax.
 * @returns Uma string com uma variação aleatória.
 */
export function processSpintax(text: string | null | undefined): string {
	if (!text) {
		return "";
	}

	// Expressão regular para encontrar blocos Spintax {opção1|opção2|...}
	const spintaxRegex = /{([^}]+)}/g;

	let processedText = text;
	let match;

	// Itera sobre todos os blocos Spintax encontrados
	while ((match = spintaxRegex.exec(processedText)) !== null) {
		const fullMatch = match[0]; // Ex: {opção1|opção2}
		const options = match[1].split("|"); // Ex: ['opção1', 'opção2']

		// Seleciona uma opção aleatoriamente
		const selectedOption = options[Math.floor(Math.random() * options.length)];

		// Substitui o bloco Spintax pela opção selecionada
		// É importante usar o índice do match para evitar problemas com strings repetidas
		const startIndex = match.index;
		const endIndex = startIndex + fullMatch.length;
		processedText =
			processedText.substring(0, startIndex) +
			selectedOption +
			processedText.substring(endIndex);

		// Resetar a última posição do regex para buscar o próximo match na string modificada
		spintaxRegex.lastIndex = startIndex + selectedOption.length;
	}

	return processedText;
}

// Exemplo de uso (opcional, para testes)
// console.log(processSpintax("Olá, {mundo|pessoal|gente}! Como você está {hoje|agora}?"));

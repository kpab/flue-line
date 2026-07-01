export class InvalidLineConversationKeyError extends Error {
	constructor() {
		super('Invalid LINE conversation key.');
		this.name = 'InvalidLineConversationKeyError';
	}
}

export class InvalidLineInputError extends TypeError {
	readonly field: string;

	constructor(field: string) {
		super(`Invalid LINE ${field}.`);
		this.name = 'InvalidLineInputError';
		this.field = field;
	}
}

export class LineApiError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(input: { endpoint: string; status: number; body: unknown }) {
		super(`LINE Messaging API request to ${input.endpoint} failed with status ${input.status}.`);
		this.name = 'LineApiError';
		this.status = input.status;
		this.body = input.body;
	}
}

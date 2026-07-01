import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/tools.ts'],
	format: ['esm'],
	dts: true,
	clean: true,
});

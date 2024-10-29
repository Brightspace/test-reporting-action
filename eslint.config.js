import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { includeIgnoreFile } from '@eslint/compat';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, '.gitignore');
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [
	includeIgnoreFile(gitignorePath),
	{ ignores: ['**/dist/'] },
	...compat.extends('brightspace/node-config').map((config) => ({
		...config,
		files: ['**/*.js', '**/*.cjs']
	})),
	...compat.extends('brightspace/testing-config').map((config) => ({
		...config,
		files: ['test/**/*.test.js']
	}))
];

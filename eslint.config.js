import { dirname, resolve } from 'node:path';
import { nodeConfig, setDirectoryConfigs, testingConfig } from 'eslint-config-brightspace';
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import { includeIgnoreFile } from '@eslint/compat';
import jsonPlugin from 'eslint-plugin-json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gitignorePath = resolve(__dirname, '.gitignore');

export default [
	includeIgnoreFile(gitignorePath),
	{ ignores: ['**/dist/'] },
	...setDirectoryConfigs(
		nodeConfig,
		{
			'test/': testingConfig
		}
	),
	{
		files: ['test/**/*.js'],
		languageOptions: {
			globals: {
				...globals.node
			}
		}
	},
	jsonPlugin.configs['recommended']
];

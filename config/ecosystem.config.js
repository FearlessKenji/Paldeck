const path = require(`node:path`);

module.exports = {
	apps: [
		{
			name: `paldeck`,
			script: `index.js`,
			cwd: path.resolve(__dirname, `..`),
			instances: 1,
			exec_mode: `fork`,
			autorestart: true,
			watch: false,
			restart_delay: 5000,
			kill_timeout: 10000,
			env: {
				NODE_ENV: `production`,
			},
		},
	],
};

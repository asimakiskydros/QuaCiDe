const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

module.exports = {
	mode: 'production', 
	entry: './src/behaviors.ts', 
	output: {
		filename: 'index.min.js', 
		path: path.resolve(__dirname, 'out'),
		clean: true
	},
	resolve: {
		extensions: ['.ts', '.js'],
		modules: [path.resolve(__dirname, 'node_modules'), 'node_modules']
	},
	module: {
		rules: [
			{
				test: /\.ts$/, 
				use: 'ts-loader', 
				exclude: /node_modules/,
			},
		]
	},
	optimization: {
		minimize: true, 
		minimizer: [
		new TerserPlugin({
			terserOptions: {
			compress: {
				drop_console: true, 
			},
			},
		}),
		],
	},
	devtool: 'source-map'
};

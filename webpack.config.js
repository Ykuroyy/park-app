const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      projectRoot: __dirname,
    },
    argv
  );
  
  // 出力ディレクトリを設定
  config.output.path = path.resolve(__dirname, 'web-build');
  
  return config;
};
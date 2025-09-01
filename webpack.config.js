const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env = {}, argv = {}) {
  // デフォルトのmodeを設定
  const mode = argv.mode || process.env.NODE_ENV || 'production';
  
  const config = await createExpoWebpackConfigAsync(
    {
      mode: mode,
      projectRoot: __dirname,
      ...env,
    },
    {
      mode: mode,
      ...argv,
    }
  );
  
  // 出力ディレクトリを設定
  config.output.path = path.resolve(__dirname, 'web-build');
  
  return config;
};
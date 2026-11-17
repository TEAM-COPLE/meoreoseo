// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions 는 앱이 아니라 Supabase 서버(Deno)에서 돈다.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);

const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  parallel: false,
  transpileDependencies: true,
  devServer: {
    port: 8089
  }
})

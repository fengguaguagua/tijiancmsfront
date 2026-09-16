import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

//导入element-plus框架
import ElementPlus from 'element-plus'
import 'element-plus/theme-chalk/index.css'
import './style.css'

createApp(App).use(router).use(ElementPlus).mount('#app')

import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import OrdersList from '../views/OrdersList.vue'
import OrdersContent from '../views/OrdersContent.vue'

const routes = [
  { path: '/', alias: '/login', name: 'Login', component: Login, meta: { public: true } },
  { path: '/ordersList', name: 'OrdersList', component: OrdersList },
  { path: '/ordersContent', name: 'OrdersContent', component: OrdersContent },
  { path: '/:pathMatch(.*)*', redirect: '/ordersList' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  let doctor = null
  try { doctor = JSON.parse(sessionStorage.getItem('doctor') || 'null') } catch (_) {
    sessionStorage.removeItem('doctor')
  }
  if (!doctor || !doctor.docId) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
